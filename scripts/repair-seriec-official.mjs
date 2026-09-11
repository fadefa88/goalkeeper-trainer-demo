#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith('--')).map(x => {
  const [k, ...v] = x.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const season = args.season || '2026';
const input = resolve(ROOT, args.input || `scripts/import-serie-abc-${season}.json`);
const logoDir = resolve(ROOT, args['logo-dir'] || 'assets/club-logos');
const manifestPath = resolve(logoDir, 'manifest.json');
const missingPath = resolve(logoDir, 'missing.json');
const SOURCE_URL = 'https://www.seriec.com/clubs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';

const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|club|team|1907|1908|1909|1911|1913|1914|1920)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

const namesOf = c => [...new Set([c.officialName, c.shortName, ...(c.aliases || [])]
  .filter(Boolean).map(norm).filter(Boolean))];

function nameScore(text, club) {
  const n = norm(text);
  if (!n) return 0;
  let best = 0;
  for (const c of namesOf(club)) {
    if (n === c) best = Math.max(best, 140);
    else if (n.includes(c) || c.includes(n)) best = Math.max(best, 95);
    else {
      const a = new Set(n.split(' ')), b = new Set(c.split(' '));
      const common = [...a].filter(x => b.has(x) && x.length > 2).length;
      best = Math.max(best, common * 28);
    }
  }
  return best;
}

function serieCSeason(club) {
  for (const team of club.teams || []) {
    for (const s of team.seasons || []) {
      if (String(s.competition || '').toLowerCase().includes('serie c')) return s;
    }
  }
  return null;
}

function mainCompetition(club) {
  const seasons = (club.teams || []).flatMap(t => t.seasons || []);
  const comps = seasons.map(s => String(s.competition || '').toLowerCase());
  if (comps.some(x => x.includes('serie a'))) return 'Serie A';
  if (comps.some(x => x.includes('serie b'))) return 'Serie B';
  if (comps.some(x => x.includes('serie c'))) return 'Serie C';
  return 'other';
}

async function collectImages(page, groupName) {
  return page.evaluate((groupName) => {
    const abs = v => { try { return new URL(v, location.href).href; } catch { return null; } };
    const rows = [];
    for (const img of document.images) {
      const src = abs(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'));
      if (!src || !/^https?:/i.test(src)) continue;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w && h && (w < 18 || h < 18 || w > 1400 || h > 1400)) continue;

      let p = img;
      let nearText = '';
      for (let i = 0; i < 7 && p; i++, p = p.parentElement) {
        const t = (p.innerText || p.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length <= 160) {
          nearText = t;
          if (t.length >= 3) break;
        }
      }
      rows.push({
        groupName,
        src,
        alt: (img.alt || '').trim(),
        title: (img.title || '').trim(),
        nearText,
        width: w,
        height: h
      });
    }
    return rows;
  }, groupName);
}

async function scrapeSerieC(page) {
  await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1800);
  const all = [];

  for (const groupName of ['Girone A', 'Girone B', 'Girone C']) {
    const clicked = await page.evaluate((groupName) => {
      const clean = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const target = clean(groupName);
      const nodes = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')];
      const el = nodes.find(x => clean(x.innerText || x.textContent) === target)
        || nodes.find(x => clean(x.innerText || x.textContent).includes(target));
      if (!el) return false;
      el.click();
      return true;
    }, groupName).catch(() => false);

    if (clicked) await page.waitForTimeout(1100);
    await page.mouse.wheel(0, 900).catch(() => {});
    await page.waitForTimeout(250);
    await page.mouse.wheel(0, -900).catch(() => {});
    const rows = await collectImages(page, groupName);
    console.log(`SerieC.com ${groupName}: ${rows.length} immagini candidate${clicked ? '' : ' (tab non individuato, uso DOM corrente)'}`);
    all.push(...rows);
  }

  const dedup = new Map();
  for (const r of all) dedup.set(`${r.groupName}|${r.src}|${r.alt}|${r.nearText}`, r);
  console.log(`SerieC.com: ${dedup.size} immagini candidate uniche`);
  return [...dedup.values()];
}

function bestOfficialC(club, targetGroup, rows) {
  let best = null;
  for (const r of rows) {
    const alt = nameScore(r.alt, club);
    const title = nameScore(r.title, club);
    const near = nameScore(r.nearText, club);
    let score = Math.max(alt + (alt ? 40 : 0), title + (title ? 25 : 0), near + (near ? 15 : 0));
    if (targetGroup && norm(r.groupName) === norm(targetGroup)) score += 25;
    if (/logo|stemma|club|team/i.test(`${r.alt} ${r.title} ${r.src}`)) score += 8;
    if (/sponsor|banner|partner|social|youtube|instagram|facebook|header|footer/i.test(`${r.src} ${r.alt} ${r.title}`)) score -= 80;
    const ratio = r.width && r.height ? r.width / Math.max(1, r.height) : 1;
    if (ratio >= 0.4 && ratio <= 2.4) score += 8;
    if (!best || score > best.score) best = { ...r, score };
  }
  return best && best.score >= 115 ? best : null;
}

async function getBytes(url) {
  const r = await fetch(url, {
    headers: { Accept: 'image/*,*/*;q=0.8', 'User-Agent': UA, Referer: SOURCE_URL },
    signal: AbortSignal.timeout(30000), redirect: 'follow'
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length < 200) throw new Error('immagine troppo piccola');
  const m = await sharp(b, { failOn: 'none' }).metadata();
  if (!m.width || !m.height) throw new Error('formato immagine non valido');
  return b;
}

function rgbInfo(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return { sat: max ? (max - min) / max : 0, light: (max + min) / 510 };
}

async function palette(buf) {
  const { data, info } = await sharp(buf, { failOn: 'none' })
    .resize(160, 160, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map();
  let total = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 100) continue;
    const { sat, light } = rgbInfo(r, g, b);
    if (light > 0.96 && sat < 0.12) continue;
    total++;
    const q = [r, g, b].map(v => Math.min(255, Math.round(v / 16) * 16));
    const key = q.join(',');
    bins.set(key, (bins.get(key) || 0) + 1);
  }

  let colors = [...bins].map(([key, count]) => {
    const [r, g, b] = key.split(',').map(Number);
    const { sat, light } = rgbInfo(r, g, b);
    const share = total ? count / total : 0;
    const mid = light > 0.08 && light < 0.92 ? 1 : 0.55;
    return { r, g, b, count, share, sat, light, score: count * (0.25 + sat * 3.2) * mid };
  }).sort((a, b) => b.score - a.score);

  if (!colors.length) colors = [{ r: 17, g: 17, b: 17, count: 1, share: 1, sat: 0, light: 0.07, score: 1 }];
  const colorful = colors.filter(c => c.sat >= 0.18 && c.share >= 0.002);
  const p = colorful[0] || colors[0];
  const s = colorful.find(c => c !== p && c.share >= 0.003 && Math.hypot(c.r - p.r, c.g - p.g, c.b - p.b) >= 70)
    || colors.find(c => c !== p && c.share >= 0.008 && Math.hypot(c.r - p.r, c.g - p.g, c.b - p.b) >= 85)
    || (p.light > 0.55 ? { r: 17, g: 17, b: 17 } : { r: 255, g: 255, b: 255 });
  const hex = x => '#' + [x.r, x.g, x.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  return {
    primary: hex(p),
    secondary: hex(s),
    candidates: colors.slice(0, 10).map(c => ({ color: hex(c), share: Number(c.share.toFixed(4)), saturation: Number(c.sat.toFixed(3)) }))
  };
}

const clubs = JSON.parse(await readFile(input, 'utf8'));
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { manifest = {}; }
await mkdir(logoDir, { recursive: true });

const targets = clubs.filter(c => serieCSeason(c) && !manifest[c.id]);
console.log(`\nRepair Serie C ufficiale: ${targets.length} società da completare.`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, locale: 'it-IT', userAgent: UA });
const page = await context.newPage();
let rows = [];
try {
  rows = await scrapeSerieC(page);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

let repaired = 0;
for (let i = 0; i < targets.length; i++) {
  const club = targets[i];
  const s = serieCSeason(club);
  const label = club.shortName || club.officialName || club.id;
  process.stdout.write(`[C ${i + 1}/${targets.length}] ${label} (${s?.groupName || 'girone n/d'}): `);
  try {
    const hit = bestOfficialC(club, s?.groupName || null, rows);
    if (!hit) {
      console.log('NON TROVATO');
      continue;
    }
    const b = await getBytes(hit.src);
    const pal = await palette(b);
    await sharp(b, { failOn: 'none' })
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(resolve(logoDir, `${club.id}.webp`));

    club.logoPath = `/assets/club-logos/${club.id}.webp`;
    club.logoSourceUrl = hit.src;
    club.logoProvider = 'SerieC.com';
    club.logoMatchedName = hit.alt || hit.nearText || hit.title || null;
    club.colorPrimary = pal.primary;
    club.colorSecondary = pal.secondary;
    club.colorsSource = 'adapted';
    club.colorsNote = 'Palette ricavata automaticamente dallo stemma ufficiale Serie C; tema UI adattato dal client per contrasto.';
    club.colorsVerifiedAt = new Date().toISOString();
    club.logoPaletteCandidates = pal.candidates;

    manifest[club.id] = {
      name: label,
      competition: mainCompetition(club),
      groupName: s?.groupName || null,
      path: club.logoPath,
      source: 'SerieC.com',
      sourcePage: SOURCE_URL,
      sourceUrl: hit.src,
      matchedName: club.logoMatchedName,
      score: hit.score,
      colorPrimary: pal.primary,
      colorSecondary: pal.secondary,
      paletteCandidates: pal.candidates,
      scrapedAt: new Date().toISOString()
    };
    repaired++;
    console.log(`OK [SerieC.com] -> ${pal.primary} / ${pal.secondary}`);
  } catch (e) {
    console.log(`ERRORE: ${e.message}`);
  }
}

const missing = clubs
  .filter(c => !manifest[c.id])
  .map(c => ({ id: c.id, name: c.shortName || c.officialName || c.id, competition: mainCompetition(c), groupName: serieCSeason(c)?.groupName || null }));

await writeFile(input, JSON.stringify(clubs, null, 2) + '\n');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(missingPath, JSON.stringify(missing, null, 2) + '\n');

const cTargets = clubs.filter(c => serieCSeason(c));
const cCovered = cTargets.filter(c => manifest[c.id]).length;
console.log(`\nRepair completato: ${repaired} nuovi loghi.`);
console.log(`Copertura società con team Serie C: ${cCovered}/${cTargets.length}`);
console.log(`Copertura totale catalogo: ${Object.keys(manifest).length}/${clubs.length}; mancanti ${missing.length}`);

const coverage = clubs.length ? Object.keys(manifest).length / clubs.length : 0;
const cCoverage = cTargets.length ? cCovered / cTargets.length : 1;
if (coverage < 0.90 || cCoverage < 0.90) process.exit(2);
