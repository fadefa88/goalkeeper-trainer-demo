#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IT = 'https://it.wikipedia.org/w/api.php';
const WC = 'https://commons.wikimedia.org/w/api.php';
const UA = 'goalkeeper-trainer-demo/1.1 (https://github.com/fadefa88/goalkeeper-trainer-demo)';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(x => x.startsWith('--'))
    .map(x => {
      const [k, ...v] = x.slice(2).split('=');
      return [k, v.length ? v.join('=') : true];
    })
);

const season = args.season || '2026';
const input = resolve(ROOT, args.input || `scripts/import-serie-abc-${season}.json`);
const logoDir = resolve(ROOT, args['logo-dir'] || 'assets/club-logos');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const uniq = a => [...new Set(a.filter(Boolean).map(x => String(x).trim()).filter(Boolean))];
const strip = s => String(s || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();
const norm = s => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|club|1907|1908|1909|1911|1913|1914|1920)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');
const namesOf = c => uniq([c.officialName, c.shortName, ...(c.aliases || [])]);

const hostState = new Map();
async function gate(url) {
  const host = new URL(url).host;
  const last = hostState.get(host) || 0;
  const wait = Math.max(0, 850 - (Date.now() - last));
  if (wait) await sleep(wait);
  hostState.set(host, Date.now());
}

function retryAfterMs(response, attempt) {
  const raw = response.headers.get('retry-after');
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.min(60000, Math.max(1500, seconds * 1000));
    const at = Date.parse(raw);
    if (Number.isFinite(at)) return Math.min(60000, Math.max(1500, at - Date.now()));
  }
  return Math.min(45000, 1500 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 700));
}

async function apiJson(base, params, tries = 7) {
  const u = new URL(base);
  const merged = { format: 'json', formatversion: 2, maxlag: 5, ...params };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }

  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    await gate(u);
    try {
      const r = await fetch(u, {
        headers: {
          Accept: 'application/json',
          'User-Agent': UA,
          'Api-User-Agent': UA
        },
        signal: AbortSignal.timeout(45000)
      });
      if (r.ok) return r.json();

      last = new Error(`${r.status} ${r.statusText}`);
      if (r.status === 429 || r.status === 503 || r.status === 502 || r.status === 504) {
        const wait = retryAfterMs(r, attempt);
        console.log(`    API ${r.status}: attendo ${Math.ceil(wait / 1000)}s e riprovo (${attempt}/${tries})`);
        await sleep(wait);
        continue;
      }
      throw last;
    } catch (e) {
      last = e;
      if (attempt >= tries) break;
      const wait = Math.min(20000, 1200 * (2 ** (attempt - 1)));
      await sleep(wait);
    }
  }
  throw last;
}

async function fetchBytes(url, tries = 6) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: 'image/*', 'User-Agent': UA },
        signal: AbortSignal.timeout(45000)
      });
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        await sharp(b, { failOn: 'none' }).metadata();
        return b;
      }
      last = new Error(`${r.status} ${r.statusText}`);
      if (r.status !== 429 && r.status < 500) throw last;
      await sleep(retryAfterMs(r, attempt));
    } catch (e) {
      last = e;
      if (attempt < tries) await sleep(Math.min(15000, 1000 * (2 ** (attempt - 1))));
    }
  }
  throw last;
}

function nameScore(value, names) {
  const n = norm(value);
  let best = 0;
  for (const raw of names) {
    const c = norm(raw);
    if (!c) continue;
    if (n === c) best = Math.max(best, 100);
    else if (n.includes(c) || c.includes(n)) best = Math.max(best, 68);
    else {
      const a = new Set(n.split(' '));
      const b = new Set(c.split(' '));
      const common = [...a].filter(x => x.length > 2 && b.has(x)).length;
      best = Math.max(best, common * 18);
    }
  }
  return best;
}

function footballScore(text) {
  const t = String(text || '').toLowerCase();
  let s = 0;
  if (/societ[aà] calcistica|club calcistico|squadra di calcio|football club|calcio italiano|serie [abc]|lega pro/.test(t)) s += 55;
  if (/comune|frazione|quartiere|persona|album|film|azienda/.test(t)) s -= 50;
  return s;
}

function pageImageScore(fileTitle, clubNames) {
  const title = String(fileTitle || '');
  let s = nameScore(title, clubNames);
  if (/logo|stemma|crest|badge|emblem/i.test(title)) s += 70;
  if (/stadio|stadium|squadra|team|rosa|kit|maglia|player|giocatore|mappa|map|bandiera|flag/i.test(title)) s -= 100;
  return s;
}

async function searchWikipediaPage(club) {
  const names = namesOf(club);
  const queries = uniq([
    names[0] && `${names[0]} calcio`,
    names[1] && `${names[1]} calcio`,
    names[0]
  ]).slice(0, 2);

  let best = null;
  for (const q of queries) {
    const d = await apiJson(IT, {
      action: 'query',
      generator: 'search',
      gsrsearch: q,
      gsrnamespace: 0,
      gsrlimit: 6,
      prop: 'pageimages|pageprops|extracts',
      piprop: 'name|thumbnail|original',
      pithumbsize: 512,
      exintro: 1,
      explaintext: 1,
      exchars: 500
    });

    for (const p of d.query?.pages || []) {
      const score = nameScore(p.title, names) + footballScore(p.extract) + (p.pageimage ? 8 : 0);
      const imageScore = p.pageimage ? pageImageScore(p.pageimage, names) : -999;
      const candidate = {
        title: p.title,
        wikidataId: p.pageprops?.wikibase_item || null,
        pageimage: p.pageimage || null,
        thumbUrl: p.thumbnail?.source || null,
        originalUrl: p.original?.source || null,
        score,
        imageScore,
        extract: p.extract || ''
      };
      if (!best || candidate.score > best.score) best = candidate;
    }

    if (best?.score >= 130 && best?.pageimage) break;
  }

  return best && best.score >= 90 ? best : null;
}

async function articleLogoFallback(page, club) {
  if (!page?.title) return null;
  const names = namesOf(club);
  const d = await apiJson(IT, {
    action: 'query',
    prop: 'images',
    imlimit: 'max',
    titles: page.title
  }).catch(() => null);
  const p = d?.query?.pages?.[0];
  const ranked = (p?.images || [])
    .map(x => ({ title: x.title, score: pageImageScore(x.title, names) }))
    .filter(x => x.score >= 75)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.title || null;
}

async function commonsFallback(club) {
  const names = namesOf(club);
  const queries = uniq([
    names[0] && `${names[0]} logo`,
    names[0] && `${names[0]} stemma`,
    names[1] && `${names[1]} logo`
  ]).slice(0, 2);

  let best = null;
  for (const q of queries) {
    const d = await apiJson(WC, {
      action: 'query',
      generator: 'search',
      gsrsearch: q,
      gsrnamespace: 6,
      gsrlimit: 8,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: 512
    }).catch(() => null);
    for (const p of d?.query?.pages || []) {
      const score = pageImageScore(p.title, names);
      const i = p.imageinfo?.[0];
      if (score < 90 || (!i?.thumburl && !i?.url)) continue;
      const hit = {
        fileTitle: p.title,
        downloadUrl: i.thumburl || i.url,
        originalUrl: i.url || null,
        source: 'commons-search',
        score
      };
      if (!best || hit.score > best.score) best = hit;
    }
    if (best?.score >= 150) break;
  }
  return best;
}

function metaValue(m, key) {
  return strip(m?.[key]?.value) || null;
}

async function batchImageInfo(titles) {
  const result = new Map();
  const unique = uniq(titles).map(t => t.startsWith('File:') ? t : `File:${t}`);
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const d = await apiJson(IT, {
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: 512,
      iiextmetadatalanguage: 'it',
      iiextmetadatafilter: 'LicenseShortName|LicenseUrl|UsageTerms|Attribution|Artist|Credit',
      titles: chunk.join('|')
    });

    for (const p of d.query?.pages || []) {
      const info = p.imageinfo?.[0];
      if (!info?.url && !info?.thumburl) continue;
      const m = info.extmetadata || {};
      result.set(p.title.replace(/^File:/, ''), {
        fileTitle: p.title,
        downloadUrl: info.thumburl || info.url,
        originalUrl: info.url || null,
        sourceUrl: info.descriptionurl || info.url || null,
        license: metaValue(m, 'LicenseShortName') || metaValue(m, 'UsageTerms'),
        licenseUrl: metaValue(m, 'LicenseUrl'),
        attribution: metaValue(m, 'Attribution') || metaValue(m, 'Artist') || metaValue(m, 'Credit')
      });
    }
  }
  return result;
}

async function palette(buf) {
  const { data, info } = await sharp(buf, { failOn: 'none' })
    .resize(128, 128, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bins = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 110) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max ? ((max - min) / max) : 0;
    const light = (max + min) / 510;
    if (light > 0.96 && sat < 0.1) continue;
    const q = [r, g, b].map(v => Math.min(255, Math.round(v / 16) * 16));
    const k = q.join(',');
    bins.set(k, (bins.get(k) || 0) + 1);
  }

  const colors = [...bins].map(([k, count]) => {
    const [r, g, b] = k.split(',').map(Number);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max ? ((max - min) / max) : 0;
    return { r, g, b, count, score: count * (1 + sat * 2) };
  }).sort((a, b) => b.score - a.score);

  const p = colors[0] || { r: 17, g: 17, b: 17 };
  const s = colors.find(x => Math.hypot(x.r - p.r, x.g - p.g, x.b - p.b) >= 70) || { r: 255, g: 255, b: 255 };
  const hex = x => '#' + [x.r, x.g, x.b].map(v => v.toString(16).padStart(2, '0')).join('');

  return {
    primary: hex(p),
    secondary: hex(s),
    candidates: colors.slice(0, 8).map(x => ({ color: hex(x), count: x.count }))
  };
}

const clubs = JSON.parse(await readFile(input, 'utf8'));
await rm(logoDir, { recursive: true, force: true });
await mkdir(logoDir, { recursive: true });

console.log('Fase 1/3: risoluzione pagine Wikipedia e file logo...');
const resolved = [];
for (let i = 0; i < clubs.length; i++) {
  const club = clubs[i];
  const label = club.shortName || club.officialName || club.id;
  process.stdout.write(`[${i + 1}/${clubs.length}] ${label}: `);
  try {
    const page = await searchWikipediaPage(club);
    if (!page) {
      resolved.push({ club, page: null, fileTitle: null });
      console.log('pagina non trovata');
      continue;
    }

    let fileTitle = page.pageimage && page.imageScore >= 65 ? page.pageimage : null;
    let source = fileTitle ? 'itwiki-pageimage' : null;
    if (!fileTitle) {
      fileTitle = await articleLogoFallback(page, club);
      if (fileTitle) source = 'itwiki-image';
    }

    resolved.push({ club, page, fileTitle, source });
    console.log(fileTitle ? `${page.title} -> ${fileTitle}` : `${page.title} -> nessun logo articolo`);
  } catch (e) {
    resolved.push({ club, page: null, fileTitle: null, error: e.message });
    console.log(`ERRORE: ${e.message}`);
  }
}

console.log('\nFase 2/3: metadata immagini in batch...');
const infoByFile = await batchImageInfo(resolved.map(x => x.fileTitle).filter(Boolean)).catch(e => {
  console.warn(`Metadata batch falliti: ${e.message}`);
  return new Map();
});

const manifest = {};
const missing = [];
let found = 0;

console.log('\nFase 3/3: download, fallback Commons e palette...');
for (let i = 0; i < resolved.length; i++) {
  const row = resolved[i];
  const c = row.club;
  const label = c.shortName || c.officialName || c.id;
  process.stdout.write(`[${i + 1}/${resolved.length}] ${label}: `);

  try {
    let hit = row.fileTitle ? infoByFile.get(row.fileTitle.replace(/^File:/, '')) : null;
    if (hit) hit = { ...hit, source: row.source || 'itwiki-pageimage' };

    if (!hit) {
      const fallback = await commonsFallback(c);
      if (fallback) {
        const one = await batchImageInfo([fallback.fileTitle]);
        const meta = one.get(fallback.fileTitle.replace(/^File:/, ''));
        hit = meta ? { ...meta, source: 'commons-search' } : fallback;
      }
    }

    if (!hit?.downloadUrl) {
      missing.push({ id: c.id, name: label, wikipediaTitle: row.page?.title || null, error: row.error || null });
      console.log('non trovato');
      continue;
    }

    const b = await fetchBytes(hit.downloadUrl);
    const pal = await palette(b);
    await sharp(b, { failOn: 'none' })
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(resolve(logoDir, `${c.id}.webp`));

    Object.assign(c, {
      logoPath: `/assets/club-logos/${c.id}.webp`,
      logoSourceUrl: hit.sourceUrl || hit.originalUrl || hit.downloadUrl,
      logoProvider: hit.source,
      wikidataId: row.page?.wikidataId || null,
      wikipediaTitle: row.page?.title || null,
      logoFileTitle: hit.fileTitle || row.fileTitle || null,
      logoLicense: hit.license || null,
      logoLicenseUrl: hit.licenseUrl || null,
      logoAttribution: hit.attribution || null,
      colorPrimary: pal.primary,
      colorSecondary: pal.secondary,
      colorsSource: 'adapted',
      colorsNote: 'Palette ricavata automaticamente dallo stemma risolto tramite Wikipedia/Wikimedia.',
      colorsVerifiedAt: new Date().toISOString(),
      logoPaletteCandidates: pal.candidates
    });

    manifest[c.id] = {
      name: label,
      path: c.logoPath,
      source: hit.source,
      wikidataId: row.page?.wikidataId || null,
      wikipediaTitle: row.page?.title || null,
      fileTitle: hit.fileTitle || row.fileTitle || null,
      sourceUrl: c.logoSourceUrl,
      license: hit.license || null,
      licenseUrl: hit.licenseUrl || null,
      attribution: hit.attribution || null,
      colorPrimary: pal.primary,
      colorSecondary: pal.secondary,
      scrapedAt: new Date().toISOString()
    };

    found++;
    console.log(`OK [${hit.source}] -> ${pal.primary} / ${pal.secondary}`);
  } catch (e) {
    missing.push({ id: c.id, name: label, wikipediaTitle: row.page?.title || null, error: e.message });
    console.log(`ERRORE: ${e.message}`);
  }
}

await writeFile(input, JSON.stringify(clubs, null, 2) + '\n');
await writeFile(resolve(logoDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(logoDir, 'missing.json'), JSON.stringify(missing, null, 2) + '\n');

console.log(`\nLogo Wikimedia trovati: ${found}/${clubs.length}`);
console.log(`Logo mancanti: ${missing.length}`);
if (found < Math.min(60, Math.ceil(clubs.length * 0.6))) process.exit(2);
