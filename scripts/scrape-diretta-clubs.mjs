#!/usr/bin/env node
/**
 * Scraper catalogo club italiani da Diretta.it / Flashscore.
 *
 * Obiettivo:
 * - Serie A, Serie B, Serie C gironi A/B/C
 * - legge le partecipanti dalla classifica corrente
 * - scarica lo stemma di ogni club
 * - estrae una palette primary/secondary dallo stemma
 * - riconcilia i nomi con scripts/seed-clubs.json quando possibile
 * - accorpa le squadre U23/Next Gen alla società madre
 * - produce un JSON già compatibile con scripts/import-clubs.mjs
 *
 * Non aggira CAPTCHA, login o protezioni anti-bot. Se il sito blocca
 * l'automazione, lo script termina e va eseguito manualmente in modalità
 * --headful per verificare cosa viene mostrato dal sito.
 *
 * Installazione:
 *   npm install
 *   npx playwright install chromium
 *
 * Uso:
 *   npm run scrape:clubs
 *   node scripts/scrape-diretta-clubs.mjs --season=2026
 *   node scripts/scrape-diretta-clubs.mjs --season=2026 --headful
 *
 * Output predefiniti:
 *   scripts/import-serie-abc-2026.json
 *   assets/club-logos/<club-id>.webp
 *   assets/club-logos/manifest.json
 */

import { chromium } from "playwright";
import sharp from "sharp";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SEASON = "2026";
const DEFAULT_SOURCE = "Diretta.it";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LEAGUES = [
  {
    key: "serie-a",
    competition: "Serie A",
    category: "Serie A",
    groupName: null,
    url: "https://www.diretta.it/calcio/italia/serie-a/classifiche/",
    expectedTeams: 20
  },
  {
    key: "serie-b",
    competition: "Serie B",
    category: "Serie B",
    groupName: null,
    url: "https://www.diretta.it/calcio/italia/serie-b/classifiche/",
    expectedTeams: 20
  },
  {
    key: "serie-c-a",
    competition: "Serie C",
    category: "Serie C",
    groupName: "Girone A",
    url: "https://www.diretta.it/calcio/italia/serie-c-girone-a/classifiche/",
    expectedTeams: 20
  },
  {
    key: "serie-c-b",
    competition: "Serie C",
    category: "Serie C",
    groupName: "Girone B",
    url: "https://www.diretta.it/calcio/italia/serie-c-girone-b/classifiche/",
    expectedTeams: 20
  },
  {
    key: "serie-c-c",
    competition: "Serie C",
    category: "Serie C",
    groupName: "Girone C",
    url: "https://www.diretta.it/calcio/italia/serie-c-girone-c/classifiche/",
    expectedTeams: 20
  }
];

const RESERVE_RE = /\b(next\s*gen|u\s*23|under\s*23|u23|b\s*team|riserve)\b/i;
const CLUB_PREFIX_RE = /\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|1907|1908|1909|1911|1913|1914|1920)\b/gi;

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [key, ...rest] = raw.slice(2).split("=");
    out[key] = rest.length ? rest.join("=") : true;
  }
  return out;
}

function boolArg(value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true) return true;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(CLUB_PREFIX_RE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value) {
  return normalize(value)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "club";
}

function seasonLabel(startYear) {
  const y = Number(startYear);
  if (!Number.isFinite(y)) return `${startYear}`;
  return `${y}/${y + 1}`;
}

function reserveInfo(name) {
  const match = String(name || "").match(RESERVE_RE);
  if (!match) return null;
  const parentName = String(name)
    .replace(RESERVE_RE, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    parentName,
    label: String(name).trim(),
    ageGroup: "U23"
  };
}

function providerIdFromHref(href) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split("/").filter(Boolean);
    const teamPos = parts.findIndex((p) => p === "squadra");
    if (teamPos >= 0) {
      return parts[teamPos + 2] || parts[teamPos + 1] || url.pathname;
    }
    return url.pathname;
  } catch {
    return String(href || "");
  }
}

function sourceDate() {
  return new Date().toISOString().slice(0, 10);
}

async function loadSeed(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`Seed non leggibile (${path}): ${err.message}. Continuo senza riconciliazione.`);
    return [];
  }
}

function makeSeedIndex(seed) {
  const index = new Map();
  for (const club of seed) {
    const candidates = [club.officialName, club.shortName, ...(club.aliases || [])].filter(Boolean);
    for (const candidate of candidates) {
      const key = normalize(candidate);
      if (key && !index.has(key)) index.set(key, club);
    }
  }
  return index;
}

function findSeedClub(name, seedIndex) {
  const key = normalize(name);
  if (!key) return null;
  if (seedIndex.has(key)) return seedIndex.get(key);

  // Fallback prudente: solo inclusione per parole/frasi intere, mai similarità fuzzy.
  // Alias corti restano validi come match esatti sopra, ma non possono assorbire
  // nomi diversi (es. "Juve" -> "Juve Stabia", "Milan" -> "Alcione Milano").
  const matches = [];
  for (const [candidateKey, club] of seedIndex.entries()) {
    if (candidateKey.length < 5 || key.length < 5) continue;
    const candidatePhrase = ` ${candidateKey} `;
    const keyPhrase = ` ${key} `;
    if (candidatePhrase.includes(` ${key} `) || keyPhrase.includes(` ${candidateKey} `)) matches.push(club);
  }
  const unique = [...new Map(matches.map((m) => [m.id || m.officialName, m])).values()];
  return unique.length === 1 ? unique[0] : null;
}

async function acceptCookies(page) {
  const candidates = [
    "Accetta tutto",
    "Accetta tutti",
    "Accetta",
    "Accept all",
    "Accept"
  ];
  for (const label of candidates) {
    const button = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
    if (await button.count()) {
      try {
        await button.click({ timeout: 1500 });
        await page.waitForTimeout(400);
        return true;
      } catch {
        // Prova il prossimo testo.
      }
    }
  }
  return false;
}

async function scrapeLeague(page, league, expectedSeason, allowSeasonMismatch) {
  console.log(`\n[${league.competition}${league.groupName ? ` ${league.groupName}` : ""}] ${league.url}`);
  await page.goto(league.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await acceptCookies(page);

  // La tabella può arrivare dopo il DOM iniziale.
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('.ui-table__row, [class*="ui-table__row"]');
    const teamLinks = document.querySelectorAll('a[href*="/squadra/"]');
    return rows.length >= 10 || teamLinks.length >= 10;
  }, null, { timeout: 15000 }).catch(() => {});

  const pageText = (await page.locator("body").innerText().catch(() => "")) || "";
  if (!pageText.includes(expectedSeason)) {
    const msg = `La pagina non contiene la stagione attesa ${expectedSeason}.`;
    if (!allowSeasonMismatch) throw new Error(`${msg} Usa --allow-season-mismatch solo se hai verificato manualmente la pagina.`);
    console.warn(`ATTENZIONE: ${msg}`);
  }

  const teams = await page.evaluate(() => {
    const absolute = (value) => {
      try { return new URL(value, location.href).href; } catch { return value || null; }
    };

    const getImg = (root) => {
      const img = root?.querySelector?.("img");
      if (!img) return null;
      const src = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
      if (src && !src.startsWith("data:")) return absolute(src);
      const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
      if (srcset) {
        const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
        if (first && !first.startsWith("data:")) return absolute(first);
      }
      return null;
    };

    const results = [];
    const seen = new Set();
    const rowSelectors = [
      ".ui-table__row",
      '[class*="ui-table__row"]',
      '[class*="tableCellParticipant"]'
    ];

    let rows = [];
    for (const selector of rowSelectors) {
      const found = [...document.querySelectorAll(selector)];
      if (found.length > rows.length) rows = found;
    }

    for (const row of rows) {
      const anchor = row.querySelector('a[href*="/squadra/"]');
      if (!anchor) continue;
      const href = absolute(anchor.getAttribute("href"));
      const name = (anchor.textContent || "").replace(/\s+/g, " ").trim();
      if (!href || !name || name.length > 90) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const logoUrl = getImg(anchor) || getImg(row);
      results.push({ name, href, logoUrl });
    }

    // Fallback: alcune versioni del sito cambiano wrapper della riga.
    if (results.length < 10) {
      for (const anchor of document.querySelectorAll('a[href*="/squadra/"]')) {
        const href = absolute(anchor.getAttribute("href"));
        const name = (anchor.textContent || "").replace(/\s+/g, " ").trim();
        if (!href || !name || name.length > 90 || seen.has(href)) continue;
        const parent = anchor.closest('[class*="row"], [class*="participant"], [class*="table"]') || anchor.parentElement;
        const logoUrl = getImg(anchor) || getImg(parent);
        seen.add(href);
        results.push({ name, href, logoUrl });
      }
    }

    return results;
  });

  // Rimuove eventuali link duplicati/fuori classifica mantenendo il primo.
  const dedup = [];
  const seenName = new Set();
  for (const team of teams) {
    const key = team.name.toLowerCase().trim();
    if (!key || seenName.has(key)) continue;
    seenName.add(key);
    dedup.push(team);
  }

  if (dedup.length < 15 || dedup.length > 30) {
    throw new Error(`Estratte ${dedup.length} squadre: numero anomalo. Possibile cambio DOM o blocco anti-bot.`);
  }
  if (dedup.length !== league.expectedTeams) {
    console.warn(`ATTENZIONE: attese ${league.expectedTeams}, trovate ${dedup.length}. Il file verrà prodotto ma va revisionato.`);
  } else {
    console.log(`  -> ${dedup.length} squadre trovate`);
  }

  return dedup.map((team) => ({ ...team, league }));
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h, s, l };
}

function hex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function distance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function paletteFromRaw(data, info) {
  const { width, height, channels } = info;
  const bins = new Map();
  let opaque = 0;
  let whitePixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels >= 4 ? data[i + 3] : 255;
      if (a < 150) continue;
      opaque++;

      const hsl = rgbToHsl(r, g, b);
      if (hsl.l > 0.94 && hsl.s < 0.12) {
        whitePixels++;
        continue;
      }

      // Quantizzazione a 16 livelli per ridurre antialiasing e micro-variazioni.
      const qr = Math.min(255, Math.round(r / 16) * 16);
      const qg = Math.min(255, Math.round(g / 16) * 16);
      const qb = Math.min(255, Math.round(b / 16) * 16);
      const key = `${qr},${qg},${qb}`;
      bins.set(key, (bins.get(key) || 0) + 1);
    }
  }

  if (!opaque || bins.size === 0) {
    return { primary: "#111111", secondary: "#ffffff", candidates: [] };
  }

  const candidates = [...bins.entries()]
    .map(([key, count]) => {
      const [r, g, b] = key.split(",").map(Number);
      const hsl = rgbToHsl(r, g, b);
      const share = count / opaque;
      // Premia colori saturi, ma non penalizza troppo nero/grigio quando sono davvero dominanti.
      const chromaBoost = 1 + hsl.s * 1.7;
      const veryPalePenalty = hsl.l > 0.88 && hsl.s < 0.20 ? 0.25 : 1;
      const score = share * chromaBoost * veryPalePenalty;
      return { r, g, b, count, share, score, ...hsl };
    })
    .filter((c) => c.share >= 0.002)
    .sort((a, b) => b.score - a.score);

  const primary = candidates[0] || { r: 17, g: 17, b: 17, share: 1 };
  let secondary = candidates
    .filter((c) => c !== primary && c.share >= 0.008 && distance(c, primary) >= 75)
    .sort((a, b) => (b.share * (1 + b.s)) - (a.share * (1 + a.s)))[0];

  if (!secondary && whitePixels / opaque >= 0.04) {
    secondary = { r: 255, g: 255, b: 255, share: whitePixels / opaque };
  }
  if (!secondary) {
    const p = rgbToHsl(primary.r, primary.g, primary.b);
    secondary = p.l > 0.55
      ? { r: 17, g: 17, b: 17, share: 0 }
      : { r: 255, g: 255, b: 255, share: 0 };
  }

  return {
    primary: hex(primary),
    secondary: hex(secondary),
    candidates: candidates.slice(0, 6).map((c) => ({ color: hex(c), share: Number(c.share.toFixed(4)) }))
  };
}

async function downloadLogoAndPalette(request, sourceUrl, outputPath, referer) {
  if (!sourceUrl) return null;
  const response = await request.get(sourceUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      Referer: referer
    },
    timeout: 30000
  });
  if (!response.ok()) throw new Error(`logo HTTP ${response.status()} da ${sourceUrl}`);
  const input = await response.body();

  const normalized = sharp(input, { failOn: "none" })
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 92, alphaQuality: 100 });
  await mkdir(dirname(outputPath), { recursive: true });
  await normalized.toFile(outputPath);

  const raw = await sharp(input, { failOn: "none" })
    .resize(96, 96, { fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return paletteFromRaw(raw.data, raw.info);
}

function createBaseClub(scrapedName, seedClub) {
  const officialName = seedClub?.officialName || scrapedName;
  const shortName = seedClub?.shortName || scrapedName;
  return {
    id: seedClub?.id || slugify(officialName),
    officialName,
    shortName,
    aliases: Array.isArray(seedClub?.aliases) ? seedClub.aliases : [],
    city: seedClub?.city || undefined,
    region: seedClub?.region || undefined,
    province: seedClub?.province || undefined,
    colorPrimary: undefined,
    colorSecondary: undefined,
    colorsSource: "adapted",
    colorsNote: "Palette ricavata automaticamente dallo stemma; verificare manualmente prima dell'uso commerciale.",
    colorsVerifiedAt: new Date().toISOString(),
    dataSource: `${DEFAULT_SOURCE} standings + logo scrape ${sourceDate()}`,
    logoPath: undefined,
    logoSourceUrl: undefined,
    logoPaletteCandidates: [],
    teams: [],
    providerIds: []
  };
}

function makeSeasonEntry(league, season) {
  return {
    season,
    competition: league.competition,
    groupName: league.groupName,
    territory: "Italia",
    dataSource: DEFAULT_SOURCE,
    verifiedAt: new Date().toISOString()
  };
}

function ensureProvider(club, providerId) {
  if (!providerId) return;
  if (!club.providerIds.some((p) => p.provider === "diretta" && p.providerId === providerId)) {
    club.providerIds.push({ provider: "diretta", providerId });
  }
}

function ensureTeam(club, team) {
  const key = [team.teamType, team.discipline, team.gender, team.ageGroup || "", team.label || ""].join("|");
  let existing = club.teams.find((t) => [t.teamType, t.discipline, t.gender, t.ageGroup || "", t.label || ""].join("|") === key);
  if (!existing) {
    existing = { ...team, seasons: [] };
    club.teams.push(existing);
  }
  for (const season of team.seasons || []) {
    const seasonKey = `${season.season}|${season.competition}|${season.groupName || ""}`;
    const already = existing.seasons.some((s) => `${s.season}|${s.competition}|${s.groupName || ""}` === seasonKey);
    if (!already) existing.seasons.push(season);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startYear = args.season || DEFAULT_SEASON;
  const season = seasonLabel(startYear);
  const outPath = resolve(ROOT, args.out || `scripts/import-serie-abc-${startYear}.json`);
  const logoDir = resolve(ROOT, args["logo-dir"] || "assets/club-logos");
  const seedPath = resolve(ROOT, args.seed || "scripts/seed-clubs.json");
  const headless = !boolArg(args.headful, false);
  const allowSeasonMismatch = boolArg(args["allow-season-mismatch"], false);
  const noLogos = boolArg(args["no-logos"], false);

  console.log(`Stagione: ${season}`);
  console.log(`Browser: ${headless ? "headless" : "visibile"}`);
  console.log(`Output: ${outPath}`);
  console.log(`Loghi: ${noLogos ? "disabilitati" : logoDir}`);

  const seed = await loadSeed(seedPath);
  const seedIndex = makeSeedIndex(seed);
  console.log(`Seed di riconciliazione: ${seed.length} società`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    viewport: { width: 1440, height: 1100 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    const scraped = [];
    for (const league of LEAGUES) {
      const rows = await scrapeLeague(page, league, season, allowSeasonMismatch);
      scraped.push(...rows);
      await page.waitForTimeout(500);
    }

    console.log(`\nTotale partecipazioni estratte: ${scraped.length}`);

    const clubsByKey = new Map();
    const scrapedPrimaryByKey = new Map();

    // Prima passata: crea tutte le prime squadre. Le riserve vengono gestite dopo.
    for (const row of scraped) {
      if (reserveInfo(row.name)) continue;
      const seedClub = findSeedClub(row.name, seedIndex);
      const club = createBaseClub(row.name, seedClub);
      const key = normalize(club.shortName || club.officialName);
      const existing = clubsByKey.get(key);
      const target = existing || club;
      if (!existing) clubsByKey.set(key, target);
      scrapedPrimaryByKey.set(key, row);
      ensureProvider(target, providerIdFromHref(row.href));
      ensureTeam(target, {
        teamType: "prima_squadra",
        discipline: "calcio11",
        gender: "maschile",
        ageGroup: null,
        label: null,
        seasons: [makeSeasonEntry(row.league, season)]
      });
    }

    // Seconda passata: U23/Next Gen dentro la società madre quando identificabile.
    for (const row of scraped) {
      const reserve = reserveInfo(row.name);
      if (!reserve) continue;
      const seedParent = findSeedClub(reserve.parentName, seedIndex);
      const candidateKeys = [
        normalize(seedParent?.shortName),
        normalize(seedParent?.officialName),
        normalize(reserve.parentName)
      ].filter(Boolean);

      let parent = null;
      for (const key of candidateKeys) {
        parent = clubsByKey.get(key);
        if (parent) break;
      }

      if (!parent) {
        const fallback = createBaseClub(reserve.parentName || row.name, seedParent);
        parent = fallback;
        clubsByKey.set(normalize(fallback.shortName || fallback.officialName), fallback);
        console.warn(`Riserva ${row.name}: società madre non presente tra A/B/C, creata come ${fallback.officialName}.`);
      }

      ensureProvider(parent, providerIdFromHref(row.href));
      ensureTeam(parent, {
        teamType: "altra",
        discipline: "calcio11",
        gender: "maschile",
        ageGroup: reserve.ageGroup,
        label: reserve.label,
        seasons: [makeSeasonEntry(row.league, season)]
      });
    }

    const clubs = [...clubsByKey.values()];

    // Logo + palette: usa la riga della prima squadra quando disponibile;
    // altrimenti una qualunque partecipazione collegabile al nome della società.
    const manifest = {};
    if (!noLogos) {
      for (let i = 0; i < clubs.length; i++) {
        const club = clubs[i];
        const directKey = normalize(club.shortName || club.officialName);
        let source = scrapedPrimaryByKey.get(directKey);
        if (!source) {
          source = scraped.find((row) => {
            const reserve = reserveInfo(row.name);
            const compareName = reserve?.parentName || row.name;
            return normalize(compareName) === directKey || normalize(compareName).includes(directKey) || directKey.includes(normalize(compareName));
          });
        }

        if (!source?.logoUrl) {
          console.warn(`  [${i + 1}/${clubs.length}] ${club.shortName}: logo non trovato nella classifica.`);
          continue;
        }

        const absolutePath = resolve(logoDir, `${club.id}.webp`);
        const relativePath = relative(ROOT, absolutePath).replace(/\\/g, "/");
        try {
          const palette = await downloadLogoAndPalette(context.request, source.logoUrl, absolutePath, source.league.url);
          club.logoPath = `/${relativePath.replace(/\\/g, "/")}`;
          club.logoSourceUrl = source.logoUrl;
          club.colorPrimary = palette.primary;
          club.colorSecondary = palette.secondary;
          club.logoPaletteCandidates = palette.candidates;
          manifest[club.id] = {
            name: club.shortName || club.officialName,
            path: club.logoPath,
            sourceUrl: source.logoUrl,
            colorPrimary: palette.primary,
            colorSecondary: palette.secondary,
            paletteCandidates: palette.candidates,
            scrapedAt: new Date().toISOString()
          };
          console.log(`  [${i + 1}/${clubs.length}] ${club.shortName}: ${palette.primary} / ${palette.secondary}`);
        } catch (err) {
          console.warn(`  [${i + 1}/${clubs.length}] ${club.shortName}: errore logo/palette — ${err.message}`);
        }
      }
    }

    // Fallback colori: se il logo non è stato recuperato, conserva i colori del seed.
    for (const club of clubs) {
      if (club.colorPrimary && club.colorSecondary) continue;
      const seedClub = findSeedClub(club.shortName || club.officialName, seedIndex);
      club.colorPrimary = club.colorPrimary || seedClub?.colorPrimary || "#111111";
      club.colorSecondary = club.colorSecondary || seedClub?.colorSecondary || "#ffffff";
      if (!club.logoPath) {
        club.colorsSource = seedClub?.colorPrimary ? (seedClub.colorsSource || "adapted") : "unknown";
        club.colorsNote = seedClub?.colorsNote || "Logo non disponibile durante lo scraping: palette di fallback da verificare.";
      }
    }

    clubs.sort((a, b) => (a.shortName || a.officialName).localeCompare(b.shortName || b.officialName, "it"));

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(clubs, null, 2)}\n`, "utf8");

    if (!noLogos) {
      await mkdir(logoDir, { recursive: true });
      await writeFile(resolve(logoDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }

    const missingLogos = clubs.filter((c) => !c.logoPath).length;
    const reserveTeams = clubs.flatMap((c) => c.teams).filter((t) => t.teamType === "altra").length;
    console.log("\nCompletato.");
    console.log(`Società generate: ${clubs.length}`);
    console.log(`Formazioni U23/Next Gen accorpate: ${reserveTeams}`);
    console.log(`Loghi mancanti: ${missingLogos}`);
    console.log(`JSON importabile: ${outPath}`);
    console.log("Prima di applicare al DB: usa sempre import-clubs.mjs con --dry-run.");
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`\nERRORE: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
