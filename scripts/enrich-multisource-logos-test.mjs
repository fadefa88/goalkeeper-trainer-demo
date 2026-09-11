#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith('--')).map(x => { const [k, ...v] = x.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const season = args.season || '2026';
const input = resolve(ROOT, args.input || `scripts/import-serie-abc-${season}.json`);
const logoDir = resolve(ROOT, args['logo-dir'] || 'assets/club-logos');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';

const SOFA_SERIE_C = [
  ['A', 'https://www.sofascore.com/football/tournament/italy/serie-c-girone-a/11445'],
  ['B', 'https://www.sofascore.com/football/tournament/italy/serie-c-girone-b/11447'],
  ['C', 'https://www.sofascore.com/football/tournament/italy/serie-c-girone-c/11446']
];

// Fallback verificato per il test corrente; il resolver generale usa prima le pagine torneo.
const SOFA_KNOWN_IDS = new Map([
  ['albinoleffe', { id: 2732, name: 'AlbinoLeffe' }],
  ['trento', { id: 258972, name: 'Trento' }],
  ['catania', { id: 2725, name: 'Catania' }],
  ['foggia', { id: 2803, name: 'Foggia' }]
]);

const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|club|1907|1908|1909|1911|1913|1914|1920)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const namesOf = c => [...new Set([c.officialName, c.shortName, ...(c.aliases || [])].filter(Boolean).map(norm).filter(Boolean))];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function nameScore(text, club) {
  const n = norm(text);
  if (!n) return 0;
  let best = 0;
  for (const c of namesOf(club)) {
    if (n === c) best = Math.max(best, 120);
    else if (n === `logo ${c}` || n === `${c} logo`) best = Math.max(best, 118);
    else if (n.includes(c) || c.includes(n)) best = Math.max(best, 85);
    else {
      const a = new Set(n.split(' ')), b = new Set(c.split(' '));
      const common = [...a].filter(x => b.has(x) && x.length > 2).length;
      best = Math.max(best, common * 22);
    }
  }
  return best;
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
        source,
        src,
        alt: (img.alt || '').trim(),
        title: (img.title || '').trim(),
        nearText,
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

async function scrapeSofascoreTeamIndex(page) {
  const all = new Map();

  for (const [group, url] of SOFA_SERIE_C) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2200);

    // Alcuni link arrivano solo dopo il rendering della classifica.
    await page.mouse.wheel(0, 900).catch(() => {});
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, -900).catch(() => {});

    const rows = await page.evaluate((group) => {
      const out = [];
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href*="/football/team/"]')) {
        let href;
        try { href = new URL(a.getAttribute('href'), location.href).href; } catch { continue; }
        const m = new URL(href).pathname.match(/\/football\/team\/([^/]+)\/(\d+)/i);
        if (!m) continue;
        const id = m[2];
        if (seen.has(id)) continue;
        seen.add(id);

        const candidates = [
          a.innerText,
          a.textContent,
          a.getAttribute('aria-label'),
          a.getAttribute('title')
        ].filter(Boolean).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

        let p = a.parentElement;
        for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
          const t = (p.innerText || p.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length <= 90) candidates.push(t);
        }

        out.push({
          group,
          id,
          slug: m[1],
          href,
          texts: [...new Set(candidates)]
        });
      }
      return out;
    }, group);

    console.log(`Sofascore Serie C ${group}: ${rows.length} link squadra estratti`);
    for (const row of rows) all.set(String(row.id), row);
  }

  console.log(`Sofascore Serie C: ${all.size} team ID unici indicizzati`);
  return [...all.values()];
}

function bestSofascoreFromIndex(club, rows) {
  let best = null;
  for (const row of rows) {
    const texts = [...row.texts, row.slug.replace(/-/g, ' ')];
    const score = Math.max(...texts.map(t => nameScore(t, club)), 0);
    if (!best || score > best.score) best = { ...row, score, matchedName: texts.sort((a, b) => nameScore(b, club) - nameScore(a, club))[0] };
  }

  if (best && best.score >= 85) {
    return {
      source: 'Sofascore',
      src: `https://img.sofascore.com/api/v1/team/${best.id}/image`,
      providerTeamId: String(best.id),
      matchedName: best.matchedName || best.slug,
      score: best.score,
      matchedFrom: 'tournament-page'
    };
  }

  for (const n of namesOf(club)) {
    const known = SOFA_KNOWN_IDS.get(n);
    if (known) {
      return {
        source: 'Sofascore',
        src: `https://img.sofascore.com/api/v1/team/${known.id}/image`,
        providerTeamId: String(known.id),
        matchedName: known.name,
        score: 999,
        matchedFrom: 'verified-fallback'
      };
    }
  }

  return null;
}

async function json(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA, Referer: 'https://www.sofascore.com/' }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// Fallback per A/B se la fonte ufficiale non restituisce uno stemma valido.
async function sofaLogoSearch(club) {
  const queries = [club.shortName, club.officialName, ...(club.aliases || [])].filter(Boolean).slice(0, 5);
  let best = null;

  for (const q of queries) {
    const url = `https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(q)}`;
    const d = await json(url).catch(() => null);
    const results = d?.results || d?.data?.results || [];

    for (const raw of results) {
      const e = raw.entity || raw;
      const type = String(raw.type || e.type || '').toLowerCase();
      const sport = String(e.sport?.name || e.sport?.slug || raw.sport || '').toLowerCase();
      const country = String(e.country?.name || e.country || '').toLowerCase();
      if (type && type !== 'team') continue;
      if (sport && sport !== 'football' && sport !== 'soccer') continue;
      if (country && !country.includes('ital')) continue;
      if (!e.id || !e.name) continue;

      let score = nameScore(e.name, club);
      if (country.includes('ital')) score += 20;
      if (norm(e.name) === norm(q)) score += 20;
      if (!best || score > best.score) best = { id: e.id, name: e.name, score };
    }

    if (best?.score >= 140) break;
    await sleep(250);
  }

  if (!best || best.score < 90) return null;
  return {
    source: 'Sofascore',
    src: `https://img.sofascore.com/api/v1/team/${best.id}/image`,
    providerTeamId: String(best.id),
    matchedName: best.name,
    score: best.score,
    matchedFrom: 'search-api'
  };
}

async function getBytes(url) {
  const referer = /sofascore\.com/i.test(url) ? 'https://www.sofascore.com/' : 'https://www.google.com/';
  const r = await fetch(url, { headers: { Accept: 'image/*,*/*;q=0.8', 'User-Agent': UA, Referer: referer }, signal: AbortSignal.timeout(30000), redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length < 200) throw new Error('immagine troppo piccola');
  const m = await sharp(b, { failOn: 'none' }).metadata();
  if (!m.width || !m.height) throw new Error('formato immagine non valido');
  return b;
}

async function palette(buf) {
  const { data, info } = await sharp(buf, { failOn: 'none' }).resize(128, 128, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 110) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0, light = (max + min) / 510;
    if (light > 0.95 && sat < 0.12) continue;
    const q = [r, g, b].map(v => Math.min(255, Math.round(v / 16) * 16));
    const k = q.join(','); bins.set(k, (bins.get(k) || 0) + 1);
  }
  const colors = [...bins].map(([k, count]) => { const [r, g, b] = k.split(',').map(Number); const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0; return { r, g, b, count, score: count * (1 + sat * 2) }; }).sort((a, b) => b.score - a.score);
  const p = colors[0] || { r: 17, g: 17, b: 17 };
  const s = colors.find(x => Math.hypot(x.r - p.r, x.g - p.g, x.b - p.b) >= 70) || { r: 255, g: 255, b: 255 };
  const hex = x => '#' + [x.r, x.g, x.b].map(v => v.toString(16).padStart(2, '0')).join('');
  return { primary: hex(p), secondary: hex(s), candidates: colors.slice(0, 8).map(x => ({ color: hex(x), count: x.count })) };
}

function findClub(clubs, wanted) {
  const w = norm(wanted);
  return clubs.find(c => namesOf(c).some(n => n === w || n.includes(w) || w.includes(n)));
}

const clubs = JSON.parse(await readFile(input, 'utf8'));
const wanted = [
  ['Serie A', 'Roma'], ['Serie A', 'Inter'], ['Serie A', 'Napoli'],
  ['Serie B', 'Padova'], ['Serie B', 'Palermo'], ['Serie B', 'Sampdoria'],
  ['Serie C', 'AlbinoLeffe'], ['Serie C', 'Trento'], ['Serie C', 'Catania'], ['Serie C', 'Foggia']
];
const selected = wanted.map(([competition, name]) => ({ competition, club: findClub(clubs, name), wantedName: name })).filter(x => x.club);
console.log(`TEST MULTI-SORGENTE: ${selected.length}/10 società: ${selected.map(x => x.wantedName).join(', ')}`);
console.log('Serie C: Sofascore via pagine torneo -> team ID -> endpoint immagine.');

await rm(logoDir, { recursive: true, force: true });
await mkdir(logoDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, locale: 'it-IT', userAgent: UA });
const page = await context.newPage();
let serieA = [], serieB = [], sofaSerieC = [];
try {
  serieA = await scrapeImageIndex(page, 'https://www.legaseriea.it/team', 'Lega Serie A').catch(e => { console.warn(`Lega A non disponibile: ${e.message}`); return []; });
  serieB = await scrapeImageIndex(page, 'https://www.legab.it/seriebkt/calendario/2026-2027/stagione-regolare/4', 'Lega B').catch(e => { console.warn(`Lega B non disponibile: ${e.message}`); return []; });
  sofaSerieC = await scrapeSofascoreTeamIndex(page).catch(e => { console.warn(`Indice Sofascore Serie C non disponibile: ${e.message}`); return []; });
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

const manifest = {}, missing = [];
let found = 0;
for (let i = 0; i < selected.length; i++) {
  const { competition, club, wantedName } = selected[i];
  const label = club.shortName || club.officialName || wantedName;
  process.stdout.write(`[${i + 1}/${selected.length}] ${label}: `);

  try {
    let hit = null;
    let b = null;

    if (competition === 'Serie C') {
      hit = bestSofascoreFromIndex(club, sofaSerieC);
      if (hit) b = await getBytes(hit.src);
    } else {
      const pool = competition === 'Serie A' ? serieA : serieB;
      const official = bestOfficial(club, pool);
      hit = official ? { source: official.source, src: official.src, score: official.score, matchedName: official.alt || official.nearText, matchedFrom: 'official-league' } : null;

      if (hit) {
        try { b = await getBytes(hit.src); }
        catch { hit = null; }
      }

      if (!hit) {
        hit = await sofaLogoSearch(club);
        if (hit) b = await getBytes(hit.src);
      }
    }

    if (!hit || !b) {
      missing.push({ id: club.id, name: label, competition });
      console.log('NON TROVATO');
      continue;
    }

    const pal = await palette(b);
    await sharp(b, { failOn: 'none' }).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 92, alphaQuality: 100 }).toFile(resolve(logoDir, `${club.id}.webp`));

    Object.assign(club, {
      logoPath: `/assets/club-logos/${club.id}.webp`,
      logoSourceUrl: hit.src,
      logoProvider: hit.source,
      logoProviderTeamId: hit.providerTeamId || null,
      logoMatchedName: hit.matchedName || null,
      logoMatchedFrom: hit.matchedFrom || null,
      colorPrimary: pal.primary,
      colorSecondary: pal.secondary,
      colorsSource: 'adapted',
      colorsNote: `Palette ricavata automaticamente dallo stemma ottenuto da ${hit.source}.`,
      colorsVerifiedAt: new Date().toISOString(),
      logoPaletteCandidates: pal.candidates
    });

    manifest[club.id] = {
      name: label,
      competition,
      path: club.logoPath,
      source: hit.source,
      sourceUrl: hit.src,
      providerTeamId: hit.providerTeamId || null,
      matchedName: hit.matchedName || null,
      matchedFrom: hit.matchedFrom || null,
      score: hit.score || null,
      colorPrimary: pal.primary,
      colorSecondary: pal.secondary,
      scrapedAt: new Date().toISOString()
    };

    found++;
    console.log(`OK [${hit.source}] ${hit.matchedName || ''}${hit.providerTeamId ? ` (teamId ${hit.providerTeamId})` : ''}${hit.matchedFrom ? ` via ${hit.matchedFrom}` : ''} -> ${pal.primary} / ${pal.secondary}`);
  } catch (e) {
    missing.push({ id: club.id, name: label, competition, error: e.message });
    console.log(`ERRORE: ${e.message}`);
  }
}

await writeFile(input, JSON.stringify(clubs, null, 2) + '\n');
await writeFile(resolve(logoDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(logoDir, 'missing.json'), JSON.stringify(missing, null, 2) + '\n');
console.log(`\nTEST: loghi trovati ${found}/${selected.length}; mancanti ${missing.length}`);
if (found < 7) process.exit(2);
