#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const passArgs = process.argv.slice(2);
const args = Object.fromEntries(passArgs.filter(x => x.startsWith('--')).map(x => {
  const [k, ...v] = x.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const seasonStart = Number(args.season || '2026');
const seasonLabel = `${seasonStart}/${seasonStart + 1}`;
const catalogPath = resolve(ROOT, args.input || `scripts/import-serie-abc-${seasonStart}.json`);

const CALENDAR_LEAGUES = [
  {
    competition: 'Serie A',
    calendarUrl: 'https://www.diretta.it/serie-a/calendario/',
    resultsUrl: 'https://www.diretta.it/serie-a/risultati/'
  },
  {
    competition: 'Serie B',
    calendarUrl: 'https://www.diretta.it/serie-b/calendario/',
    resultsUrl: 'https://www.diretta.it/serie-b/risultati/'
  }
];

function norm(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|club|1907|1908|1909|1911|1913|1914|1920)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function slug(value) {
  return norm(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'match';
}

function parseTimestamp(rawTimestamp, text, startYear) {
  const raw = String(rawTimestamp || '').trim();
  if (/^\d{10}$/.test(raw)) return Number(raw);
  if (/^\d{13}$/.test(raw)) return Math.floor(Number(raw) / 1000);

  const value = String(text || '').replace(/\s+/g, ' ').trim();
  let match = value.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\D+(\d{1,2}):(\d{2})\b/);
  if (match) {
    const [, d, m, y, hh, mm] = match;
    return Math.floor(new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)).getTime() / 1000);
  }

  match = value.match(/\b(\d{1,2})\.(\d{1,2})\.\s*(\d{1,2}):(\d{2})\b/);
  if (match) {
    const [, d, m, hh, mm] = match;
    const month = Number(m);
    const year = month >= 7 ? startYear : startYear + 1;
    return Math.floor(new Date(year, month - 1, Number(d), Number(hh), Number(mm)).getTime() / 1000);
  }

  return 0;
}

async function acceptCookies(page) {
  for (const label of ['Accetta tutto', 'Accetta tutti', 'Accetta', 'Accept all', 'Accept']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
    if (await button.count()) {
      try {
        await button.click({ timeout: 1200 });
        await page.waitForTimeout(250);
        return;
      } catch {}
    }
  }
}

async function expandAllMatches(page) {
  for (let pass = 0; pass < 55; pass++) {
    const controls = page.getByText(/^(Mostra più incontri|Mostra altri incontri|Show more matches)$/i);
    const count = await controls.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      if (!await control.isVisible().catch(() => false)) continue;
      try {
        await control.click({ timeout: 2500 });
        await page.waitForTimeout(300);
        clicked = true;
        break;
      } catch {}
    }
    if (!clicked) break;
  }
}

async function scrapeMatchPage(page, url, competition) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await acceptCookies(page);
  await page.waitForTimeout(1000);
  await page.waitForSelector('.event__match, [class*="event__match"]', { timeout: 15000 }).catch(() => {});
  await expandAllMatches(page);

  const rows = await page.evaluate(() => {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const text = (root, selectors) => {
      for (const selector of selectors) {
        const node = root.querySelector(selector);
        const value = clean(node?.textContent);
        if (value) return value;
      }
      return '';
    };
    const numberText = value => {
      const m = String(value || '').match(/-?\d+(?:[.,]\d+)?/);
      return m ? Number(m[0].replace(',', '.')) : null;
    };

    const seen = new Set();
    const out = [];
    const matchRows = [...document.querySelectorAll('.event__match, [class*="event__match"]')];
    for (const row of matchRows) {
      const home = text(row, ['.event__participant--home', '[class*="homeParticipant"]', '[class*="participant--home"]']);
      const away = text(row, ['.event__participant--away', '[class*="awayParticipant"]', '[class*="participant--away"]']);
      if (!home || !away) continue;

      const attrs = [...row.attributes].map(a => [a.name, a.value]);
      const rawTimestamp = attrs.find(([name, value]) => /(?:start|timestamp|event.*time|time.*event)/i.test(name) && /^\d{10,13}$/.test(value))?.[1] || '';
      const timeText = text(row, ['.event__time', '[class*="event__time"]', '[class*="time"]']);
      const statusText = text(row, ['.event__stage', '[class*="event__stage"]', '[class*="status"]']);
      const round = text(row, ['.event__round', '[class*="event__round"]']);
      const homeScoreText = text(row, ['.event__score--home', '[class*="homeScore"]', '[class*="score--home"]']);
      const awayScoreText = text(row, ['.event__score--away', '[class*="awayScore"]', '[class*="score--away"]']);
      const link = row.querySelector('a[href*="/partita/"], a[href*="/match/"], a.eventRowLink');
      const href = link?.href || '';
      const idFromRow = String(row.id || '').replace(/^g_\d_/, '').trim();
      const idFromHref = href ? href.split('/').filter(Boolean).pop() || '' : '';
      const providerMatchId = idFromRow || idFromHref;
      const key = providerMatchId || `${home}|${away}|${timeText}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        providerMatchId,
        homeTeam: home,
        awayTeam: away,
        rawTimestamp,
        timeText,
        statusText,
        round,
        homeScore: numberText(homeScoreText),
        awayScore: numberText(awayScoreText),
        className: String(row.className || ''),
        ariaLabel: row.getAttribute('aria-label') || '',
        rowText: clean(row.textContent)
      });
    }
    return out;
  });

  return rows.map(row => {
    const startTimestamp = parseTimestamp(row.rawTimestamp, `${row.timeText} ${row.ariaLabel} ${row.rowText}`, seasonStart);
    const hasScore = Number.isFinite(row.homeScore) && Number.isFinite(row.awayScore);
    const classText = `${row.className} ${row.statusText}`.toLowerCase();
    const live = /live|in corso|playing/.test(classText);
    const postponed = /rinviat|postpon|annull|cancel/.test(classText);
    const finished = hasScore && !live;
    const status = postponed ? 'postponed' : live ? 'inprogress' : finished ? 'finished' : 'notstarted';
    return {
      provider: 'diretta',
      providerMatchId: row.providerMatchId || `${slug(competition)}-${startTimestamp}-${slug(row.homeTeam)}-${slug(row.awayTeam)}`,
      season: seasonLabel,
      competition,
      startTimestamp,
      status,
      statusDescription: row.statusText || (finished ? 'Finale' : postponed ? 'Rinviata' : 'Da giocare'),
      round: row.round || '',
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      homeScore: Number.isFinite(row.homeScore) ? row.homeScore : null,
      awayScore: Number.isFinite(row.awayScore) ? row.awayScore : null,
      venue: null,
      dataSource: 'Diretta.it',
      verifiedAt: new Date().toISOString()
    };
  }).filter(match => match.startTimestamp > 0);
}

function dedupeMatches(rows) {
  const byKey = new Map();
  for (const match of rows) {
    const key = match.providerMatchId || `${match.startTimestamp}|${norm(match.homeTeam)}|${norm(match.awayTeam)}`;
    const old = byKey.get(key);
    if (!old || (old.status !== 'finished' && match.status === 'finished')) byKey.set(key, match);
  }
  return [...byKey.values()].sort((a, b) => a.startTimestamp - b.startTimestamp);
}

async function scrapeLeagueCalendar(page, league) {
  const calendar = await scrapeMatchPage(page, league.calendarUrl, league.competition);
  const results = await scrapeMatchPage(page, league.resultsUrl, league.competition);
  const matches = dedupeMatches([...calendar, ...results]);
  if (matches.length < 300) {
    throw new Error(`${league.competition}: estratte solo ${matches.length} partite con data valida (attese almeno 300). Import calendario annullato.`);
  }
  console.log(`${league.competition}: ${matches.length} partite calendario/risultati estratte da Diretta.it`);
  return matches;
}

function competitionTeam(club, competition) {
  return (club.teams || []).find(team =>
    team.teamType === 'prima_squadra' &&
    (team.seasons || []).some(season => norm(season.competition) === norm(competition) && String(season.season) === seasonLabel)
  ) || null;
}

function clubNameScore(club, teamName) {
  const target = norm(teamName);
  if (!target) return 0;
  const candidates = [club.officialName, club.shortName, ...(club.aliases || [])].map(norm).filter(Boolean);
  let best = 0;
  for (const candidate of candidates) {
    if (candidate === target) best = Math.max(best, 120);
    else if (candidate.includes(target) || target.includes(candidate)) best = Math.max(best, 88);
    else {
      const a = new Set(candidate.split(' ').filter(x => x.length > 2));
      const b = new Set(target.split(' ').filter(x => x.length > 2));
      const shared = [...a].filter(x => b.has(x)).length;
      if (shared) best = Math.max(best, Math.round(shared / Math.max(1, Math.min(a.size, b.size)) * 80));
    }
  }
  return best;
}

function resolveClub(clubs, competition, teamName) {
  const candidates = clubs.filter(club => competitionTeam(club, competition));
  let best = null;
  let second = null;
  for (const club of candidates) {
    const score = clubNameScore(club, teamName);
    const row = { club, score };
    if (!best || score > best.score) {
      second = best;
      best = row;
    } else if (!second || score > second.score) second = row;
  }
  if (!best || best.score < 80) return null;
  if (best.score < 120 && second && best.score === second.score) return null;
  return best.club;
}

function attachCalendars(clubs, calendars) {
  for (const club of clubs) {
    for (const team of club.teams || []) delete team.matches;
  }

  for (const league of CALENDAR_LEAGUES) {
    const rows = calendars.get(league.competition) || [];
    let mapped = 0;
    const unresolved = new Set();
    for (const match of rows) {
      const homeClub = resolveClub(clubs, league.competition, match.homeTeam);
      const awayClub = resolveClub(clubs, league.competition, match.awayTeam);
      if (!homeClub || !awayClub) {
        if (!homeClub) unresolved.add(match.homeTeam);
        if (!awayClub) unresolved.add(match.awayTeam);
        continue;
      }
      const homeTeam = competitionTeam(homeClub, league.competition);
      const awayTeam = competitionTeam(awayClub, league.competition);
      if (!homeTeam || !awayTeam) continue;
      homeTeam.matches = Array.isArray(homeTeam.matches) ? homeTeam.matches : [];
      awayTeam.matches = Array.isArray(awayTeam.matches) ? awayTeam.matches : [];
      homeTeam.matches.push({ ...match, isHome: true });
      awayTeam.matches.push({ ...match, isHome: false });
      mapped++;
    }

    if (mapped < Math.floor(rows.length * 0.95)) {
      throw new Error(`${league.competition}: associate solo ${mapped}/${rows.length} partite. Squadre non risolte: ${[...unresolved].slice(0, 12).join(', ')}`);
    }

    const teams = clubs.map(club => competitionTeam(club, league.competition)).filter(Boolean);
    const weak = teams.filter(team => (team.matches || []).length < 25);
    if (weak.length) {
      throw new Error(`${league.competition}: ${weak.length} squadre hanno meno di 25 partite associate; annullo per evitare un import parziale.`);
    }
    console.log(`${league.competition}: ${mapped}/${rows.length} partite associate alle squadre del catalogo`);
  }
}

console.log('Fase 1: Serie A/B + tentativo Sofascore Serie C...');
const base = spawnSync(node, [resolve(ROOT, 'scripts/enrich-multisource-logos-v2.mjs'), ...passArgs], {
  stdio: 'inherit'
});
if (base.status && base.status !== 0) {
  console.warn(`Resolver base terminato con codice ${base.status}; continuo con repair ufficiale Serie C.`);
}

console.log('\nFase 2: repair Serie C da seriec.com/clubs...');
const repair = spawnSync(node, [resolve(ROOT, 'scripts/repair-seriec-official.mjs'), ...passArgs], {
  stdio: 'inherit'
});
if (repair.status && repair.status !== 0) process.exit(repair.status);

console.log('\nFase 3: calendario Serie A/B da Diretta.it...');
const clubs = JSON.parse(await readFile(catalogPath, 'utf8'));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'it-IT',
  timezoneId: 'Europe/Rome',
  viewport: { width: 1440, height: 1200 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
});
const page = await context.newPage();
try {
  const calendars = new Map();
  for (const league of CALENDAR_LEAGUES) {
    calendars.set(league.competition, await scrapeLeagueCalendar(page, league));
  }
  attachCalendars(clubs, calendars);
  await writeFile(catalogPath, `${JSON.stringify(clubs, null, 2)}\n`, 'utf8');
  const totalAssignments = clubs.flatMap(club => club.teams || []).reduce((sum, team) => sum + (team.matches || []).length, 0);
  console.log(`Calendari A/B salvati nel catalogo: ${totalAssignments} assegnazioni partita-squadra`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
