#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';

const SOURCES = {
  serieA: 'https://www.legaseriea.it/team',
  serieB: 'https://www.legab.it/seriebkt/calendario/2026-2027/stagione-regolare/4',
  serieC: [
    ['Girone A', 'https://www.sofascore.com/football/tournament/italy/serie-c-girone-a/11445'],
    ['Girone B', 'https://www.sofascore.com/football/tournament/italy/serie-c-girone-b/11447'],
    ['Girone C', 'https://www.sofascore.com/football/tournament/italy/serie-c-girone-c/11446']
  ]
};

const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|club|1907|1908|1909|1911|1913|1914|1920)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const namesOf = c => [...new Set([c.officialName, c.shortName, ...(c.aliases || [])].filter(Boolean).map(norm).filter(Boolean))];

function nameScore(text, club) {
  const n = norm(text);
  if (!n) return 0;
  let best = 0;
  for (const c of namesOf(club)) {
    if (n === c) best = Math.max(best, 120);
    else if (n === `logo ${c}` || n === `${c} logo`) best = Math.max(best, 118);
    else if (n.includes(c) || c.includes(n)) best = Math.max(best, 82);
    else {
      const a = new Set(n.split(' ')), b = new Set(c.split(' '));
      best = Math.max(best, [...a].filter(x => b.has(x) && x.length > 2).length * 22);
    }
  }
  return best;
}

function clubCompetition(club) {
  const seasons = (club.teams || []).flatMap(t => t.seasons || []);
  const comps = seasons.map(s => String(s.competition || '').toLowerCase());
  if (comps.some(x => x.includes('serie a'))) return { competition: 'Serie A', groupName: null };
  if (comps.some(x => x.includes('serie b'))) return { competition: 'Serie B', groupName: null };
  const c = seasons.find(s => String(s.competition || '').toLowerCase().includes('serie c'));
  if (c) return { competition: 'Serie C', groupName: c.groupName || null };
  return { competition: null, groupName: null };
}

async function scrapeImageIndex(page, url, source) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1800);
  const rows = await page.evaluate((source) => {
    const abs = v => { try { return new URL(v, location.href).href; } catch { return null; } };
    return [...document.images].map(img => {
      const src = abs(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'));
      let p = img;
      let nearText = '';
      for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
        const t = (p.innerText || p.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length <= 180) nearText = t;
      }
      return {
        source, src,
        alt: (img.alt || '').trim(), title: (img.title || '').trim(), nearText,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0
      };
    }).filter(x => x.src && /^https?:/i.test(x.src) && x.width >= 16 && x.height >= 16 && x.width <= 1200 && x.height <= 1200);
  }, source);
  console.log(`${source}: ${rows.length} immagini indicizzate`);
  return rows;
}

function bestOfficial(club, rows) {
  let best = null;
  for (const r of rows) {
    const alt = nameScore(r.alt.replace(/^logo\s+/i, ''), club);
    const title = nameScore(r.title, club);
    const near = nameScore(r.nearText, club);
    let score = Math.max(alt + (alt ? 45 : 0), title + (title ? 20 : 0), near);
    if (/logo|stemma|crest|badge/i.test(`${r.alt} ${r.title} ${r.src}`)) score += 18;
    if (/banner|sponsor|header|footer|social|store|ticket/i.test(`${r.src} ${r.alt}`)) score -= 40;
    const ratio = r.width / Math.max(1, r.height);
    if (ratio >= 0.45 && ratio <= 2.2) score += 8;
    if (!best || score > best.score) best = { ...r, score };
  }
  return best && best.score >= 100 ? best : null;
}

async function scrapeSofascoreSerieC(page) {
  const all = [];
  for (const [groupName, url] of SOURCES.serieC) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2200);
    await page.mouse.wheel(0, 1000).catch(() => {});
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, -1000).catch(() => {});

    const rows = await page.evaluate(({ groupName, sourceUrl }) => {
      const out = [], seen = new Set();
      for (const a of document.querySelectorAll('a[href*="/football/team/"]')) {
        let href;
        try { href = new URL(a.getAttribute('href'), location.href).href; } catch { continue; }
        const m = new URL(href).pathname.match(/\/football\/team\/([^/]+)\/(\d+)/i);
        if (!m || seen.has(m[2])) continue;
        seen.add(m[2]);
        const texts = [a.innerText, a.textContent, a.getAttribute('aria-label'), a.getAttribute('title')]
          .filter(Boolean).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
        let p = a.parentElement;
        for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
          const t = (p.innerText || p.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length <= 90) texts.push(t);
        }
        out.push({ groupName, id: m[2], slug: m[1], href, sourceUrl, texts: [...new Set(texts)] });
      }
      return out;
    }, { groupName, sourceUrl: url });

    console.log(`Sofascore ${groupName}: ${rows.length} team ID estratti`);
    all.push(...rows);
  }
  return all;
}

function bestSofaC(club, groupName, rows) {
  const groupNorm = norm(groupName);
  let best = null;
  for (const row of rows) {
    const texts = [...row.texts, row.slug.replace(/-/g, ' ')];
    let score = Math.max(...texts.map(t => nameScore(t, club)), 0);
    if (groupNorm && norm(row.groupName) === groupNorm) score += 30;
    if (!best || score > best.score) {
      const matchedName = [...texts].sort((a, b) => nameScore(b, club) - nameScore(a, club))[0];
      best = { ...row, score, matchedName };
    }
  }
  if (!best || best.score < 100) return null;
  return {
    source: 'Sofascore',
    src: `https://img.sofascore.com/api/v1/team/${best.id}/image`,
    providerTeamId: String(best.id),
    matchedName: best.matchedName || best.slug,
    sourcePage: best.sourceUrl,
    score: best.score
  };
}

async function getBytes(url) {
  const referer = /sofascore\.com/i.test(url) ? 'https://www.sofascore.com/' : 'https://www.google.com/';
  const r = await fetch(url, {
    headers: { Accept: 'image/*,*/*;q=0.8', 'User-Agent': UA, Referer: referer },
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
  const sat = max ? (max - min) / max : 0;
  const light = (max + min) / 510;
  return { sat, light };
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
    const k = q.join(',');
    bins.set(k, (bins.get(k) || 0) + 1);
  }

  let colors = [...bins].map(([k, count]) => {
    const [r, g, b] = k.split(',').map(Number);
    const { sat, light } = rgbInfo(r, g, b);
    const share = total ? count / total : 0;
    const midLight = light > 0.08 && light < 0.92 ? 1 : 0.55;
    const score = count * (0.25 + sat * 3.2) * midLight;
    return { r, g, b, count, share, sat, light, score };
  }).sort((a, b) => b.score - a.score);

  if (!colors.length) colors = [{ r: 17, g: 17, b: 17, count: 1, share: 1, sat: 0, light: 0.07, score: 1 }];
  const colorful = colors.filter(c => c.sat >= 0.18 && c.share >= 0.002);
  const p = colorful[0] || colors[0];
  const secondaryColorful = colorful.find(c => c !== p && c.share >= 0.003 && Math.hypot(c.r - p.r, c.g - p.g, c.b - p.b) >= 70);
  const secondaryNeutral = colors.find(c => c !== p && c.share >= 0.008 && Math.hypot(c.r - p.r, c.g - p.g, c.b - p.b) >= 85);
  const s = secondaryColorful || secondaryNeutral || (p.light > 0.55 ? { r: 17, g: 17, b: 17 } : { r: 255, g: 255, b: 255 });
  const hex = x => '#' + [x.r, x.g, x.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

  return {
    primary: hex(p), secondary: hex(s),
    candidates: colors.slice(0, 10).map(c => ({ color: hex(c), share: Number(c.share.toFixed(4)), saturation: Number(c.sat.toFixed(3)) }))
  };
}

function addProviderId(club, provider, providerId) {
  if (!providerId) return;
  club.providerIds = Array.isArray(club.providerIds) ? club.providerIds : [];
  if (!club.providerIds.some(p => p.provider === provider && String(p.providerId) === String(providerId))) {
    club.providerIds.push({ provider, providerId: String(providerId) });
  }
}

const clubs = JSON.parse(await readFile(input, 'utf8'));
await rm(logoDir, { recursive: true, force: true });
await mkdir(logoDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, locale: 'it-IT', userAgent: UA });
const page = await context.newPage();
let serieA = [], serieB = [], serieC = [];
try {
  serieA = await scrapeImageIndex(page, SOURCES.serieA, 'Lega Serie A');
  serieB = await scrapeImageIndex(page, SOURCES.serieB, 'Lega B');
  serieC = await scrapeSofascoreSerieC(page);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

const manifest = {}, missing = [];
const stats = { 'Serie A': { total: 0, found: 0 }, 'Serie B': { total: 0, found: 0 }, 'Serie C': { total: 0, found: 0 }, other: { total: 0, found: 0 } };

for (let i = 0; i < clubs.length; i++) {
  const club = clubs[i];
  const label = club.shortName || club.officialName || club.id;
  const { competition, groupName } = clubCompetition(club);
  const bucket = stats[competition] || stats.other;
  bucket.total++;
  process.stdout.write(`[${i + 1}/${clubs.length}] ${label} (${competition || 'n/d'}): `);

  try {
    let hit = null;
    if (competition === 'Serie A') {
      const x = bestOfficial(club, serieA);
      if (x) hit = { source: x.source, src: x.src, matchedName: x.alt || x.title || x.nearText, score: x.score, sourcePage: SOURCES.serieA };
    } else if (competition === 'Serie B') {
      const x = bestOfficial(club, serieB);
      if (x) hit = { source: x.source, src: x.src, matchedName: x.alt || x.title || x.nearText, score: x.score, sourcePage: SOURCES.serieB };
    } else if (competition === 'Serie C') {
      hit = bestSofaC(club, groupName, serieC);
    }

    if (!hit) {
      missing.push({ id: club.id, name: label, competition, groupName, reason: 'match non trovato' });
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
    club.logoProvider = hit.source;
    club.logoProviderTeamId = hit.providerTeamId || null;
    club.logoMatchedName = hit.matchedName || null;
    club.colorPrimary = pal.primary;
    club.colorSecondary = pal.secondary;
    club.colorsSource = 'adapted';
    club.colorsNote = `Palette ricavata automaticamente dallo stemma ${hit.source}; tema UI adattato dal client per contrasto.`;
    club.colorsVerifiedAt = new Date().toISOString();
    club.logoPaletteCandidates = pal.candidates;
    if (hit.source === 'Sofascore' && hit.providerTeamId) addProviderId(club, 'sofascore', hit.providerTeamId);

    manifest[club.id] = {
      name: label, competition, groupName: groupName || null,
      path: club.logoPath, source: hit.source, sourcePage: hit.sourcePage || null,
      sourceUrl: hit.src, providerTeamId: hit.providerTeamId || null,
      matchedName: hit.matchedName || null, score: hit.score || null,
      colorPrimary: pal.primary, colorSecondary: pal.secondary,
      paletteCandidates: pal.candidates, scrapedAt: new Date().toISOString()
    };
    bucket.found++;
    console.log(`OK [${hit.source}]${hit.providerTeamId ? ` teamId=${hit.providerTeamId}` : ''} -> ${pal.primary} / ${pal.secondary}`);
  } catch (e) {
    missing.push({ id: club.id, name: label, competition, groupName, reason: e.message });
    console.log(`ERRORE: ${e.message}`);
  }
}

await writeFile(input, JSON.stringify(clubs, null, 2) + '\n');
await writeFile(resolve(logoDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(logoDir, 'missing.json'), JSON.stringify(missing, null, 2) + '\n');

console.log('\nRiepilogo logo/palette:');
for (const [name, s] of Object.entries(stats)) if (s.total) console.log(`  ${name}: ${s.found}/${s.total}`);
console.log(`  Totale: ${Object.keys(manifest).length}/${clubs.length}; mancanti ${missing.length}`);

const covered = clubs.length ? Object.keys(manifest).length / clubs.length : 0;
const categoryOk = Object.values(stats).filter(s => s.total).every(s => s.found / s.total >= 0.85);
if (covered < 0.90 || !categoryOk) process.exit(2);
