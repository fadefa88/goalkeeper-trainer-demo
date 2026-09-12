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
const nowIso = () => new Date().toISOString();

const SERIE_A_API_BASE = 'https://api-sdp.legaseriea.it/v1/serie-a/football';
const SERIE_A_COMPETITION_ID = 'serie-a::Football_Competition::ec93b94f74294dc98ab5bcfd67fc0d88';

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

const IT_MONTHS = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12
};

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

  match = value.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/);
  if (match) {
    const [, d, m, y] = match;
    return Math.floor(new Date(Number(y), Number(m) - 1, Number(d), 12, 0).getTime() / 1000);
  }

  match = value.match(/\b(\d{1,2})[.\/](\d{1,2})[.]?\s*(\d{1,2}):(\d{2})\b/);
  if (match) {
    const [, d, m, hh, mm] = match;
    const month = Number(m);
    const year = month >= 7 ? startYear : startYear + 1;
    return Math.floor(new Date(year, month - 1, Number(d), Number(hh), Number(mm)).getTime() / 1000);
  }

  match = value.match(/\b(\d{1,2})[.\/](\d{1,2})[.]?\b/);
  if (match) {
    const [, d, m] = match;
    const month = Number(m);
    const year = month >= 7 ? startYear : startYear + 1;
    return Math.floor(new Date(year, month - 1, Number(d), 12, 0).getTime() / 1000);
  }

  return 0;
}

function parseItalianDate(text, startYear, { allowTime = true } = {}) {
  const value = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const monthPattern = Object.keys(IT_MONTHS).join('|');
  const dateMatch = value.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`, 'i'));
  if (!dateMatch) return 0;

  const day = Number(dateMatch[1]);
  const month = IT_MONTHS[dateMatch[2].toLowerCase()];
  const year = dateMatch[3] ? Number(dateMatch[3]) : (month >= 7 ? startYear : startYear + 1);

  let hh = 12;
  let mm = 0;
  if (allowTime) {
    const timeMatch = value.match(/\bore\s*:?\s*(\d{1,2})[:.](\d{2})\b/i)
      || value.match(/\b(\d{1,2})[:.](\d{2})\b/);
    if (timeMatch) {
      const candidateH = Number(timeMatch[1]);
      const candidateM = Number(timeMatch[2]);
      if (candidateH >= 0 && candidateH <= 23 && candidateM >= 0 && candidateM <= 59) {
        hh = candidateH;
        mm = candidateM;
      }
    }
  }

  return Math.floor(new Date(year, month - 1, day, hh, mm).getTime() / 1000);
}

function normalizeStatus(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (value === 'FINISHED' || value === 'FULL_TIME' || value === 'FT') return 'finished';
  if (value.includes('LIVE') || value.includes('PLAYING') || value.includes('IN_PROGRESS')) return 'inprogress';
  if (value.includes('POSTPON') || value.includes('CANCEL') || value.includes('SUSPEND')) return 'postponed';
  return 'notstarted';
}

function dedupeMatches(rows) {
  const byKey = new Map();
  for (const match of rows) {
    const key = `${norm(match.homeTeam)}|${norm(match.awayTeam)}|${match.round || ''}`;
    const old = byKey.get(key);
    if (!old || (old.status !== 'finished' && match.status === 'finished')) byKey.set(key, match);
  }
  return [...byKey.values()].sort((a, b) => a.startTimestamp - b.startTimestamp);
}

async function fetchJson(url, tries = 4) {
  let lastError = null;
  for (let attempt = 0; attempt <= tries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          accept: 'application/json'
        },
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (res.ok) return await res.json();
      lastError = new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < tries) await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
  }
  throw lastError || new Error(`Fetch fallita: ${url}`);
}

async function scrapeSerieAOfficial() {
  const comp = encodeURIComponent(SERIE_A_COMPETITION_ID);
  const seasonsUrl = `${SERIE_A_API_BASE}/competitions/${comp}/seasons?locale=en-GB`;
  const seasonsPayload = await fetchJson(seasonsUrl);
  const season = (seasonsPayload?.seasons || []).find(s => String(s.seasonName || '') === seasonLabel);
  if (!season?.seasonId) throw new Error(`Serie A ufficiale: stagione ${seasonLabel} non trovata nell'API Lega Serie A.`);

  const seasonId = encodeURIComponent(season.seasonId);
  const matchesPayload = await fetchJson(`${SERIE_A_API_BASE}/seasons/${seasonId}/matches?locale=en-GB`);
  const sourceMatches = Array.isArray(matchesPayload?.matches) ? matchesPayload.matches : [];

  const matches = sourceMatches.map(m => {
    const homeTeam = m.home?.mediaName || m.home?.officialName || m.home?.shortName || '';
    const awayTeam = m.away?.mediaName || m.away?.officialName || m.away?.shortName || '';
    const startTimestamp = m.matchDateUtc ? Math.floor(new Date(m.matchDateUtc).getTime() / 1000) : 0;
    const roundRaw = String(m.matchSet?.providerId || '').split(':').pop();
    const roundNumber = Number(roundRaw);
    const status = normalizeStatus(m.status);

    return {
      provider: 'diretta',
      providerMatchId: String(m.matchId || m.providerId || `serie-a-${roundRaw}-${slug(homeTeam)}-${slug(awayTeam)}`),
      season: seasonLabel,
      competition: 'Serie A',
      startTimestamp,
      status,
      statusDescription: status === 'finished' ? 'Finale' : 'Programmazione ufficiale Lega Serie A',
      round: Number.isFinite(roundNumber) && roundNumber > 0 ? `Giornata ${roundNumber}` : '',
      homeTeam,
      awayTeam,
      homeScore: status === 'finished' && m.providerHomeScore != null ? Number(m.providerHomeScore) : null,
      awayScore: status === 'finished' && m.providerAwayScore != null ? Number(m.providerAwayScore) : null,
      venue: m.stadiumName || null,
      dataSource: 'Lega Serie A SDP',
      verifiedAt: nowIso()
    };
  }).filter(m => m.homeTeam && m.awayTeam && m.startTimestamp > 0);

  const unique = dedupeMatches(matches);
  if (unique.length !== 380) {
    throw new Error(`Serie A ufficiale: ricevute ${unique.length}/380 partite dall'API Lega Serie A; import annullato.`);
  }

  console.log(`Serie A ufficiale: ${unique.length}/380 partite caricate dalla Lega Serie A.`);
  return unique;
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

async function scrapeSerieBRound(page, round) {
  const url = `https://www.legab.it/seriebkt/calendario/${seasonStart}-${seasonStart + 1}/stagione-regolare/${round}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await acceptCookies(page);
  await page.waitForTimeout(700);

  const rows = await page.evaluate(() => {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const links = [...document.querySelectorAll('a')].filter(a => /vai alla scheda del match/i.test(clean(a.textContent)));
    const out = [];

    for (const link of links) {
      let node = link;
      let card = null;
      let datedCard = null;
      const monthRe = /\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/i;
      for (let depth = 0; depth < 10 && node; depth++, node = node.parentElement) {
        const logos = [...node.querySelectorAll?.('img[alt*="Logo "]') || []];
        if (logos.length >= 2 && !card) card = node;
        if (logos.length >= 2 && monthRe.test(clean(node.innerText))) {
          datedCard = node;
          break;
        }
      }
      card = datedCard || card;
      if (!card) continue;

      const logos = [...card.querySelectorAll('img[alt*="Logo "]')];
      const names = logos
        .map(img => clean(img.getAttribute('alt')).replace(/^Logo\s+/i, '').trim())
        .filter(Boolean);
      if (names.length < 2) continue;

      const aria = [...card.querySelectorAll('[aria-label]')]
        .map(el => clean(el.getAttribute('aria-label')))
        .filter(Boolean)
        .join(' | ');

      let dateContext = clean(card.innerText);
      if (!monthRe.test(dateContext)) {
        let cursor = card;
        for (let up = 0; up < 4 && cursor && !monthRe.test(dateContext); up++, cursor = cursor.parentElement) {
          let sibling = cursor.previousElementSibling;
          for (let back = 0; back < 5 && sibling; back++, sibling = sibling.previousElementSibling) {
            const candidate = clean(sibling.innerText || sibling.textContent);
            if (monthRe.test(candidate)) {
              dateContext = `${candidate} ${dateContext}`;
              break;
            }
          }
        }
      }

      out.push({
        homeTeam: names[0],
        awayTeam: names[1],
        text: dateContext,
        aria,
        href: link.href || ''
      });
    }

    return out;
  });

  const matches = [];
  for (const row of rows) {
    const visibleHasVs = /\bvs\b/i.test(row.text);
    const combined = `${row.text} ${row.aria}`;
    const startTimestamp = parseItalianDate(combined, seasonStart, { allowTime: !visibleHasVs });
    if (!startTimestamp) continue;

    const hrefParts = String(row.href || '').split('/').filter(Boolean);
    const hrefId = hrefParts[hrefParts.length - 1] || '';
    matches.push({
      provider: 'diretta',
      providerMatchId: hrefId || `lega-b-${seasonStart}-r${round}-${slug(row.homeTeam)}-${slug(row.awayTeam)}`,
      season: seasonLabel,
      competition: 'Serie B',
      startTimestamp,
      status: 'notstarted',
      statusDescription: visibleHasVs ? 'Orario da definire' : 'Programmazione ufficiale Lega B',
      round: `Giornata ${round}`,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      homeScore: null,
      awayScore: null,
      venue: null,
      dataSource: 'Lega B',
      verifiedAt: nowIso()
    });
  }

  const unique = dedupeMatches(matches);
  if (unique.length !== 10) {
    const preview = String(await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 900);
    throw new Error(`Serie B ufficiale, giornata ${round}: estratte ${unique.length}/10 gare. Pagina: ${url}. Preview: ${preview}`);
  }

  return unique;
}

async function scrapeSerieBOfficial(page) {
  const all = [];
  for (let round = 1; round <= 38; round++) {
    const matches = await scrapeSerieBRound(page, round);
    all.push(...matches);
    if (round === 1 || round % 5 === 0 || round === 38) {
      console.log(`Serie B ufficiale: ${round}/38 giornate lette (${all.length} partite).`);
    }
  }

  const unique = dedupeMatches(all);
  if (unique.length !== 380) {
    throw new Error(`Serie B ufficiale: estratte ${unique.length}/380 partite; import annullato.`);
  }

  console.log(`Serie B ufficiale: ${unique.length}/380 partite caricate da Lega B.`);
  return unique;
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
        await page.waitForTimeout(250);
        clicked = true;
        break;
      } catch {}
    }
    if (!clicked) break;
  }
}

async function scrapeDirettaPage(page, url, competition) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await acceptCookies(page);
  await page.waitForTimeout(1000);
  await expandAllMatches(page);

  const rows = await page.evaluate(() => {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const HOME_SELECTORS = [
      '.event__participant--home',
      '[class*="participant--home"]',
      '[class*="homeParticipant"]',
      '[class*="participant"][class*="home"]'
    ];
    const AWAY_SELECTORS = [
      '.event__participant--away',
      '[class*="participant--away"]',
      '[class*="awayParticipant"]',
      '[class*="participant"][class*="away"]'
    ];
    const text = (root, selectors) => {
      for (const selector of selectors) {
        const node = root?.querySelector?.(selector);
        const value = clean(node?.textContent);
        if (value) return value;
      }
      return '';
    };
    const numberText = value => {
      const m = String(value || '').match(/-?\d+(?:[.,]\d+)?/);
      return m ? Number(m[0].replace(',', '.')) : null;
    };

    const candidateRows = new Set(document.querySelectorAll('.event__match, [class*="event__match"]'));
    for (const homeNode of document.querySelectorAll(HOME_SELECTORS.join(','))) {
      let node = homeNode;
      for (let depth = 0; depth < 8 && node; depth++, node = node.parentElement) {
        if (text(node, HOME_SELECTORS) && text(node, AWAY_SELECTORS)) {
          candidateRows.add(node);
          break;
        }
      }
    }

    const out = [];
    const seen = new Set();
    for (const row of candidateRows) {
      const home = text(row, HOME_SELECTORS);
      const away = text(row, AWAY_SELECTORS);
      if (!home || !away) continue;

      const attrs = [...row.attributes].map(a => [a.name, a.value]);
      const rawTimestamp = attrs.find(([name, value]) => /(?:start|timestamp|event.*time|time.*event)/i.test(name) && /^\d{10,13}$/.test(value))?.[1] || '';
      const timeText = text(row, ['.event__time', '[class*="event__time"]', '[class*="time"]']);
      const statusText = text(row, ['.event__stage', '[class*="event__stage"]', '[class*="status"]']);
      const homeScoreText = text(row, ['.event__score--home', '[class*="homeScore"]', '[class*="score--home"]']);
      const awayScoreText = text(row, ['.event__score--away', '[class*="awayScore"]', '[class*="score--away"]']);
      const link = row.querySelector?.('a[href*="/partita/"], a[href*="/match/"], a.eventRowLink');
      const href = link?.href || '';
      const idFromRow = String(row.id || '').replace(/^g_\d_/, '').trim();
      const hrefParts = href ? href.split('/').filter(Boolean) : [];
      const idFromHref = hrefParts.length ? hrefParts[hrefParts.length - 1] : '';
      const providerMatchId = idFromRow || idFromHref;
      const rowText = clean(row.textContent);
      const key = providerMatchId || `${home}|${away}|${timeText}|${rowText.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        providerMatchId,
        homeTeam: home,
        awayTeam: away,
        rawTimestamp,
        timeText,
        statusText,
        homeScore: numberText(homeScoreText),
        awayScore: numberText(awayScoreText),
        className: String(row.className || ''),
        ariaLabel: row.getAttribute?.('aria-label') || '',
        rowText
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
    return {
      provider: 'diretta',
      providerMatchId: row.providerMatchId || `${slug(competition)}-${startTimestamp}-${slug(row.homeTeam)}-${slug(row.awayTeam)}`,
      season: seasonLabel,
      competition,
      startTimestamp,
      status: postponed ? 'postponed' : live ? 'inprogress' : finished ? 'finished' : 'notstarted',
      statusDescription: row.statusText || (finished ? 'Finale' : postponed ? 'Rinviata' : 'Da giocare'),
      round: '',
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      homeScore: Number.isFinite(row.homeScore) ? row.homeScore : null,
      awayScore: Number.isFinite(row.awayScore) ? row.awayScore : null,
      venue: null,
      dataSource: 'Diretta.it',
      verifiedAt: nowIso()
    };
  }).filter(match => match.startTimestamp > 0);
}

async function scrapeDirettaOverlay(page, league) {
  const calendar = await scrapeDirettaPage(page, league.calendarUrl, league.competition);
  const results = await scrapeDirettaPage(page, league.resultsUrl, league.competition);
  const matches = dedupeMatches([...calendar, ...results]);
  if (matches.length < 100) {
    console.warn(`${league.competition}: overlay Diretta quasi vuoto (${matches.length} gare); userò comunque il calendario ufficiale completo.`);
  } else {
    console.log(`${league.competition}: ${matches.length} gare Diretta disponibili per aggiornare orari/risultati.`);
  }
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
    } else if (!second || score > second.score) {
      second = row;
    }
  }
  if (!best || best.score < 80) return null;
  if (best.score < 120 && second && best.score === second.score) return null;
  return best.club;
}

function matchClubKey(clubs, competition, match) {
  const homeClub = resolveClub(clubs, competition, match.homeTeam);
  const awayClub = resolveClub(clubs, competition, match.awayTeam);
  if (!homeClub || !awayClub) return null;
  return {
    key: `${homeClub.id}|${awayClub.id}`,
    homeClub,
    awayClub
  };
}

function mergeOfficialWithDiretta(clubs, competition, officialRows, direttaRows) {
  const overlayByClub = new Map();
  for (const row of direttaRows) {
    const resolved = matchClubKey(clubs, competition, row);
    if (resolved) overlayByClub.set(resolved.key, row);
  }

  let overlaysApplied = 0;
  const merged = officialRows.map(base => {
    const resolved = matchClubKey(clubs, competition, base);
    if (!resolved) return base;
    const overlay = overlayByClub.get(resolved.key);
    if (!overlay) return base;

    overlaysApplied++;
    const exactTime = overlay.startTimestamp > 0 ? overlay.startTimestamp : base.startTimestamp;
    const overlayHasScore = overlay.homeScore != null && overlay.awayScore != null;

    return {
      ...base,
      startTimestamp: exactTime,
      status: overlay.status || base.status,
      statusDescription: overlay.statusDescription || base.statusDescription,
      homeScore: overlayHasScore ? overlay.homeScore : base.homeScore,
      awayScore: overlayHasScore ? overlay.awayScore : base.awayScore,
      venue: base.venue || overlay.venue || null,
      dataSource: `${base.dataSource} + Diretta.it`,
      verifiedAt: overlay.verifiedAt || base.verifiedAt
    };
  });

  console.log(`${competition}: overlay Diretta applicato a ${overlaysApplied}/${officialRows.length} gare ufficiali.`);
  return merged;
}

function attachCalendars(clubs, calendars) {
  for (const club of clubs) {
    for (const team of club.teams || []) delete team.matches;
  }

  for (const league of CALENDAR_LEAGUES) {
    const rows = calendars.get(league.competition) || [];
    if (rows.length !== 380) {
      throw new Error(`${league.competition}: calendario finale ${rows.length}/380; import annullato.`);
    }

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

    if (mapped !== 380) {
      throw new Error(`${league.competition}: associate ${mapped}/380 partite. Squadre non risolte: ${[...unresolved].join(', ')}`);
    }

    const teams = clubs.map(club => competitionTeam(club, league.competition)).filter(Boolean);
    const badCoverage = teams.filter(team => (team.matches || []).length !== 38);
    if (badCoverage.length) {
      throw new Error(`${league.competition}: ${badCoverage.length} squadre non hanno esattamente 38 gare associate.`);
    }

    console.log(`${league.competition}: 380/380 gare associate; 38 gare per ciascuna squadra.`);
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

console.log('\nFase 3: calendario completo Serie A/B da fonti ufficiali + overlay Diretta...');
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
  const officialSerieA = await scrapeSerieAOfficial();
  const officialSerieB = await scrapeSerieBOfficial(page);

  const calendars = new Map();
  for (const league of CALENDAR_LEAGUES) {
    const official = league.competition === 'Serie A' ? officialSerieA : officialSerieB;
    const overlay = await scrapeDirettaOverlay(page, league);
    calendars.set(league.competition, mergeOfficialWithDiretta(clubs, league.competition, official, overlay));
  }

  attachCalendars(clubs, calendars);

  await writeFile(catalogPath, `${JSON.stringify(clubs, null, 2)}\n`, 'utf8');
  const totalAssignments = clubs
    .flatMap(club => club.teams || [])
    .reduce((sum, team) => sum + (team.matches || []).length, 0);

  console.log(`Calendari A/B completi salvati nel catalogo: ${totalAssignments} assegnazioni partita-squadra.`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
