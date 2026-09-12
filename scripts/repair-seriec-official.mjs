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
const seasonStart = Number(season);
const seasonLabel = `${seasonStart}/${seasonStart + 1}`;
const input = resolve(ROOT, args.input || `scripts/import-serie-abc-${season}.json`);
const logoDir = resolve(ROOT, args['logo-dir'] || 'assets/club-logos');
const manifestPath = resolve(logoDir, 'manifest.json');
const missingPath = resolve(logoDir, 'missing.json');
const SOURCE_URL = 'https://www.seriec.com/clubs';
const CALENDAR_URL = 'https://www.seriec.com/calendario';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const calendarOnly = ['1', 'true', 'yes', 'on'].includes(String(args['calendar-only'] || '').toLowerCase()) || args['calendar-only'] === true;

const GROUPS = [
  { name: 'Girone A', letter: 'a' },
  { name: 'Girone B', letter: 'b' },
  { name: 'Girone C', letter: 'c' }
];

const SHORT_MONTHS = {
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6,
  lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12
};

const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|club|team|1907|1908|1909|1911|1913|1914|1920)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

const slug = s => norm(s).replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'match';

const namesOf = c => [...new Set([c.officialName, c.shortName, ...(c.aliases || [])]
  .filter(Boolean).map(norm).filter(Boolean))];

function nameScore(text, club) {
  const n = norm(text);
  if (!n) return 0;
  let best = 0;
  for (const c of namesOf(club)) {
    if (n === c) best = Math.max(best, 140);
    else if (n.length >= 5 && c.length >= 5 && (` ${n} `.includes(` ${c} `) || ` ${c} `.includes(` ${n} `))) best = Math.max(best, 95);
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

async function acceptCookies(page) {
  for (const label of ['Accetta tutto', 'Accetta tutti', 'Accetta', 'Accept all', 'Accept']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
    if (!await button.count()) continue;
    try {
      await button.click({ timeout: 1200 });
      await page.waitForTimeout(250);
      return;
    } catch {}
  }
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

  for (const groupName of GROUPS.map(x => x.name)) {
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

function parseCalendarDate(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const m = text.match(/\b(?:lun|mar|mer|gio|ven|sab|dom)?\s*(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)(?:\s+(\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?\b/i);
  if (!m) return 0;
  const day = Number(m[1]);
  const month = SHORT_MONTHS[m[2].toLowerCase()];
  const year = m[3] ? Number(m[3]) : (month >= 7 ? seasonStart : seasonStart + 1);
  const hour = m[4] ? Number(m[4]) : 12;
  const minute = m[5] ? Number(m[5]) : 0;
  return Math.floor(new Date(year, month - 1, day, hour, minute).getTime() / 1000);
}

function serieCTeamSeason(team, groupName) {
  return (team.seasons || []).find(s =>
    norm(s.competition) === 'serie c' &&
    String(s.season || '') === seasonLabel &&
    norm(s.groupName) === norm(groupName)
  ) || null;
}

function teamScore(club, team, rawName) {
  const target = norm(rawName);
  if (!target) return 0;
  const labels = [team.label, club.shortName, club.officialName, ...(club.aliases || [])]
    .filter(Boolean).map(norm).filter(Boolean);
  let best = 0;
  for (const label of labels) {
    if (label === target) best = Math.max(best, label === norm(team.label) ? 180 : 150);
    else if (label.length >= 5 && target.length >= 5 && (` ${label} `.includes(` ${target} `) || ` ${target} `.includes(` ${label} `))) best = Math.max(best, 105);
    else {
      const a = new Set(label.split(' ').filter(x => x.length > 2));
      const b = new Set(target.split(' ').filter(x => x.length > 2));
      const shared = [...a].filter(x => b.has(x)).length;
      if (shared) best = Math.max(best, Math.round(shared / Math.max(1, Math.min(a.size, b.size)) * 85));
    }
  }
  const reserveTarget = /\b(u23|under 23|next gen)\b/i.test(String(rawName || ''));
  const reserveTeam = team.teamType !== 'prima_squadra' || /u23|under 23|next gen/i.test(`${team.ageGroup || ''} ${team.label || ''}`);
  if (reserveTarget && reserveTeam) best += 35;
  if (reserveTarget && !reserveTeam) best -= 70;
  return best;
}

function resolveSerieCTeam(clubs, groupName, rawName) {
  const candidates = [];
  for (const club of clubs) {
    for (const team of club.teams || []) {
      if (!serieCTeamSeason(team, groupName)) continue;
      candidates.push({ club, team, score: teamScore(club, team, rawName) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.score < 70) return null;
  if (second && best.score === second.score && best.score < 150) return null;
  return best;
}

async function clickGroup(page, groupName) {
  const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = new RegExp(`^\\s*${escaped}\\s*$`, 'i');
  const candidates = page.locator('button, [role="tab"], [role="button"]').filter({ hasText: exact });
  const count = await candidates.count();

  for (let i = 0; i < count; i++) {
    const target = candidates.nth(i);
    if (!await target.isVisible().catch(() => false)) continue;
    try {
      await target.click({ timeout: 2500 });
      await page.waitForTimeout(900);
      const current = new URL(page.url());
      if (current.pathname.replace(/\/$/, '') !== '/calendario') {
        throw new Error(`click tab ha navigato a ${current.pathname}`);
      }
      console.log(`Serie C ${groupName}: tab calendario selezionato.`);
      return true;
    } catch (err) {
      console.warn(`Serie C ${groupName}: controllo tab ignorato (${err?.message || err}).`);
    }
  }
  return false;
}

async function scrapeCalendarGroup(page, group) {
  const clicked = await clickGroup(page, group.name);
  if (!clicked) throw new Error(`Serie C ${group.name}: tab non trovato su ${CALENDAR_URL}`);
  await page.waitForTimeout(600);

  const rows = await page.evaluate(() => {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const dateRe = /\b(?:Lun|Mar|Mer|Gio|Ven|Sab|Dom)?\s*\d{1,2}\s+(?:Gen|Feb|Mar|Apr|Mag|Giu|Lug|Ago|Set|Ott|Nov|Dic)(?:\s+\d{4})?(?:\s+\d{1,2}:\d{2})?\b/i;
    const genericAlt = /^(?:serie c|lega pro|sky|now|rai|logo|facebook|instagram|youtube|linkedin|x)$/i;
    const visible = el => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const teamImages = root => [...root.querySelectorAll('img[alt]')].filter(img => {
      const alt = clean(img.alt);
      if (!alt || genericAlt.test(alt)) return false;
      if (/partner|sponsor|banner|serie c|lega pro|sky|now|rai/i.test(alt)) return false;
      return true;
    });

    const roots = new Set();
    const dateNodes = [...document.querySelectorAll('body *')].filter(el => {
      if (!visible(el) || el.children.length > 3) return false;
      const text = clean(el.textContent);
      return text.length <= 45 && dateRe.test(text);
    });

    for (const dateNode of dateNodes) {
      let node = dateNode;
      let chosen = null;
      for (let depth = 0; depth < 9 && node; depth++, node = node.parentElement) {
        const text = clean(node.innerText || node.textContent);
        if (text.length > 700) break;
        const imgs = teamImages(node);
        if (imgs.length === 2 && dateRe.test(text)) {
          chosen = node;
          break;
        }
      }
      if (chosen) roots.add(chosen);
    }

    const markers = [...document.querySelectorAll('body *')].filter(el => {
      if (!visible(el) || el.children.length > 4) return false;
      return /^Giornata\s+\d+$/i.test(clean(el.textContent));
    });

    const out = [];
    const seen = new Set();
    for (const root of roots) {
      const text = clean(root.innerText || root.textContent);
      const dateMatch = text.match(dateRe);
      const imgs = teamImages(root);
      if (!dateMatch || imgs.length !== 2) continue;
      const homeTeam = clean(imgs[0].alt);
      const awayTeam = clean(imgs[1].alt);
      if (!homeTeam || !awayTeam) continue;

      let round = '';
      for (const marker of markers) {
        const relation = marker.compareDocumentPosition(root);
        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) round = clean(marker.textContent);
        else if (relation & Node.DOCUMENT_POSITION_PRECEDING) break;
      }

      const scoreMatch = text.match(/\b(\d+)\s*-\s*(\d+)\b/);
      const key = `${dateMatch[0]}|${homeTeam}|${awayTeam}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        dateText: dateMatch[0],
        round,
        homeTeam,
        awayTeam,
        homeScore: scoreMatch ? Number(scoreMatch[1]) : null,
        awayScore: scoreMatch ? Number(scoreMatch[2]) : null,
        text
      });
    }
    return out;
  });

  const matches = rows.map((row, index) => {
    const startTimestamp = parseCalendarDate(row.dateText);
    const finished = Number.isFinite(row.homeScore) && Number.isFinite(row.awayScore);
    const roundNumber = Number(String(row.round || '').match(/\d+/)?.[0] || 0);
    return {
      provider: 'diretta',
      providerMatchId: `seriec-${group.letter}-${roundNumber || index + 1}-${slug(row.homeTeam)}-${slug(row.awayTeam)}`,
      season: seasonLabel,
      competition: 'Serie C',
      startTimestamp,
      status: finished ? 'finished' : 'notstarted',
      statusDescription: finished ? 'Finale' : (/\d{1,2}:\d{2}/.test(row.dateText) ? row.dateText : 'Orario da definire'),
      round: row.round ? `${group.name} · ${row.round}` : group.name,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      homeScore: finished ? row.homeScore : null,
      awayScore: finished ? row.awayScore : null,
      venue: null,
      dataSource: 'SerieC.com',
      verifiedAt: new Date().toISOString()
    };
  }).filter(m => m.startTimestamp > 0);

  const dedup = new Map();
  for (const match of matches) {
    const key = `${match.round}|${norm(match.homeTeam)}|${norm(match.awayTeam)}`;
    dedup.set(key, match);
  }
  const unique = [...dedup.values()].sort((a, b) => a.startTimestamp - b.startTimestamp);
  if (unique.length !== 380) {
    const preview = String(await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1400);
    throw new Error(`Serie C ${group.name}: estratte ${unique.length}/380 gare ufficiali. Preview: ${preview}`);
  }
  console.log(`Serie C ${group.name}: ${unique.length}/380 gare ufficiali estratte da SerieC.com.`);
  return unique;
}

async function runCalendarSync() {
  if (!Number.isFinite(seasonStart)) throw new Error(`Stagione non valida: ${season}`);
  const clubs = JSON.parse(await readFile(input, 'utf8'));

  for (const club of clubs) {
    for (const team of club.teams || []) {
      if ((team.seasons || []).some(s => norm(s.competition) === 'serie c' && String(s.season || '') === seasonLabel)) {
        delete team.matches;
      }
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, locale: 'it-IT', timezoneId: 'Europe/Rome', userAgent: UA });
  const page = await context.newPage();
  try {
    await page.goto(CALENDAR_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await acceptCookies(page);
    await page.waitForTimeout(1800);
    const body = String(await page.locator('body').innerText().catch(() => ''));
    if (!body.includes('2026/2027') && !body.includes('2026/27')) {
      throw new Error(`Serie C: la pagina calendario non espone la stagione 2026/2027. Preview: ${body.replace(/\s+/g, ' ').slice(0, 900)}`);
    }

    for (const group of GROUPS) {
      const matches = await scrapeCalendarGroup(page, group);
      let mapped = 0;
      const unresolved = new Set();
      for (const match of matches) {
        const home = resolveSerieCTeam(clubs, group.name, match.homeTeam);
        const away = resolveSerieCTeam(clubs, group.name, match.awayTeam);
        if (!home || !away) {
          if (!home) unresolved.add(match.homeTeam);
          if (!away) unresolved.add(match.awayTeam);
          continue;
        }
        home.team.matches = Array.isArray(home.team.matches) ? home.team.matches : [];
        away.team.matches = Array.isArray(away.team.matches) ? away.team.matches : [];
        home.team.matches.push({ ...match, isHome: true });
        away.team.matches.push({ ...match, isHome: false });
        mapped++;
      }
      if (mapped !== 380) {
        throw new Error(`Serie C ${group.name}: associate ${mapped}/380 gare. Squadre non risolte: ${[...unresolved].join(', ')}`);
      }
      const teams = [];
      for (const club of clubs) {
        for (const team of club.teams || []) if (serieCTeamSeason(team, group.name)) teams.push({ club, team });
      }
      if (teams.length !== 20) {
        throw new Error(`Serie C ${group.name}: catalogo contiene ${teams.length}/20 formazioni per il girone.`);
      }
      const bad = teams.filter(x => (x.team.matches || []).length !== 38);
      if (bad.length) {
        const detail = bad.map(x => `${x.team.label || x.club.shortName || x.club.officialName}:${(x.team.matches || []).length}`).join(', ');
        throw new Error(`Serie C ${group.name}: ${bad.length} squadre non hanno 38 gare (${detail}).`);
      }
      console.log(`Serie C ${group.name}: 380/380 gare associate; 38 gare per ciascuna delle 20 squadre.`);
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  await writeFile(input, JSON.stringify(clubs, null, 2) + '\n');
  const assignments = clubs.flatMap(c => c.teams || []).reduce((sum, team) => {
    const isC = (team.seasons || []).some(s => norm(s.competition) === 'serie c' && String(s.season || '') === seasonLabel);
    return sum + (isC ? (team.matches || []).length : 0);
  }, 0);
  console.log(`Calendari Serie C completi salvati nel catalogo: ${assignments} assegnazioni partita-squadra.`);
}

async function runLogoRepair() {
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
  if (coverage < 0.90 || cCoverage < 0.90) process.exitCode = 2;
}

if (calendarOnly) {
  console.log('\nCalendari Serie C: sincronizzazione ufficiale 2026/27...');
  await runCalendarSync();
} else {
  await runLogoRepair();
}
