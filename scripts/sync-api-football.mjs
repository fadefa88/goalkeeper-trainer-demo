#!/usr/bin/env node
// Integrazione con API-Football per Serie A/B/C (gironi A/B/C), calcio a 11
// maschile. Scarica le partecipanti di una stagione, le riconcilia con il
// catalogo già presente (preservando id interni e correzioni manuali) e
// produce un file JSON nella forma esatta attesa da import-clubs.mjs —
// questo script NON parla mai con il nostro backend, solo import-clubs.mjs
// lo fa (stesso importatore già esistente, riusato qui).
//
// Sicurezza chiave: SOLO da variabile d'ambiente o --api-key, mai hardcoded,
// mai stampata per intero (solo forma redatta, per verificare che sia stata
// caricata), mai scritta nei file di output.
//
// Uso:
//   API_FOOTBALL_KEY=xxx node scripts/sync-api-football.mjs [--season=2026] [--out=scripts/import-serie-abc-<season>.json]
//
// Comportamento sui limiti del piano: se l'API risponde con un errore di
// accesso alla stagione richiesta (piano insufficiente), lo script si ferma
// e stampa l'errore ESATTO restituito dall'API — non tenta MAI una stagione
// diversa da quella richiesta.
import { readFile, writeFile } from "node:fs/promises";

const BASE_URL = "https://v3.football.api-sports.io";

// ID stabili (indipendenti dalla stagione) dei 5 campionati richiesti,
// verificati il 2026-09-11 via GET /leagues?country=Italy&season=2024
// (unica stagione accessibile col piano Free per una verifica innocua):
// 135=Serie A, 136=Serie B, 138/942/943=Serie C gironi A/B/C. Usati come
// riferimento di sicurezza: lo script comunque rilegge /leagues per la
// stagione richiesta e segnala un mismatch invece di fidarsi ciecamente.
const TARGET_LEAGUES = [
  { id: 135, name: "Serie A", category: "Serie A", group: null },
  { id: 136, name: "Serie B", category: "Serie B", group: null },
  { id: 138, name: "Serie C - Girone A", category: "Serie C", group: "Girone A" },
  { id: 942, name: "Serie C - Girone B", category: "Serie C", group: "Girone B" },
  { id: 943, name: "Serie C - Girone C", category: "Serie C", group: "Girone C" }
];

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (raw.startsWith("--")) {
      const [key, ...rest] = raw.slice(2).split("=");
      args[key] = rest.length ? rest.join("=") : true;
    }
  }
  return args;
}

function redact(key) {
  if (!key) return "(assente)";
  if (key.length < 8) return "***";
  return `${key.slice(0, 3)}...${key.slice(-3)} (${key.length} caratteri)`;
}

async function apiGet(path, apiKey) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-apisports-key": apiKey, "Accept": "application/json" }
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { httpStatus: res.status, data };
}

function hasApiErrors(data) {
  if (!data) return true;
  const errors = data.errors;
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return false;
}

// --- Normalizzazione nomi per il matching (stesso schema di _shared.js
// buildClubSearchKey/normalizeSearchText: minuscolo, senza accenti). ---
function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|ac|ssc|us|ssd|asd|ss|calcio|football club|1909|1913|1907|1911|1914|1908)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Squadre riserve/U23 che giocano nei campionati senior (es. Juventus Next
// Gen in Serie C): vanno associate alla STESSA società della prima squadra,
// come formazione distinta (team_type "altra"), non come società separata.
const RESERVE_PATTERNS = [/next gen/i, /\bu23\b/i, /\bunder ?23\b/i, /\bu\.23\b/i, /\briserve\b/i];
function reserveLabel(teamName) {
  for (const pattern of RESERVE_PATTERNS) {
    if (pattern.test(teamName)) {
      const m = teamName.match(/next gen|u ?23|riserve/i);
      return m ? m[0] : "Under 23";
    }
  }
  return null;
}
function parentClubName(teamName) {
  return teamName.replace(/\s*(next gen|u ?23|under ?23|riserve)\s*/i, "").trim();
}

async function loadCurrentCatalog(path) {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    const rows = raw?.[0]?.results || [];
    const byClub = new Map();
    for (const row of rows) {
      if (!byClub.has(row.club_id)) {
        byClub.set(row.club_id, {
          id: row.club_id,
          officialName: row.official_name,
          shortName: row.short_name,
          aliases: JSON.parse(row.aliases || "[]"),
          city: row.city,
          colorPrimary: row.color_primary,
          colorsSource: row.colors_source,
          lockedFields: JSON.parse(row.locked_fields || "[]"),
          teams: []
        });
      }
      byClub.get(row.club_id).teams.push({
        id: row.team_id, teamType: row.team_type, discipline: row.discipline,
        gender: row.gender, ageGroup: row.age_group, label: row.label
      });
    }
    return Array.from(byClub.values());
  } catch (err) {
    console.warn(`Attenzione: impossibile leggere il catalogo attuale da ${path} (${err.message}). Riconciliazione con lista vuota: ogni squadra risulterà "nuova".`);
    return [];
  }
}

// Match per nome normalizzato (uguale o uno contenuto nell'altro) + città
// quando disponibile. Nessun match "abbastanza simile": o è una corrispondenza
// pulita o va in "ambigue"/"nuove", mai una fusione forzata.
function matchClub(apiTeam, catalog) {
  const teamNorm = normalize(parentClubName(apiTeam.name));
  const cityNorm = normalize(apiTeam.city || "");
  const exact = catalog.filter((c) => normalize(c.officialName) === teamNorm || (c.shortName && normalize(c.shortName) === teamNorm));
  if (exact.length === 1) return { club: exact[0], confidence: "exact" };
  if (exact.length > 1) {
    const byCity = exact.filter((c) => cityNorm && normalize(c.city) === cityNorm);
    if (byCity.length === 1) return { club: byCity[0], confidence: "exact+city" };
    return { club: null, confidence: "ambiguous", candidates: exact.map((c) => c.id) };
  }
  const partial = catalog.filter((c) => {
    const cn = normalize(c.officialName);
    return cn.includes(teamNorm) || teamNorm.includes(cn);
  });
  if (partial.length === 1) {
    const byCity = cityNorm && normalize(partial[0].city) === cityNorm;
    return { club: partial[0], confidence: byCity ? "partial+city" : "partial" };
  }
  if (partial.length > 1) return { club: null, confidence: "ambiguous", candidates: partial.map((c) => c.id) };
  return { club: null, confidence: "new" };
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "club";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const season = args.season || "2026";
  const apiKey = args["api-key"] || process.env.API_FOOTBALL_KEY || "";
  const outPath = args.out || `scripts/import-serie-abc-${season}.json`;
  const catalogPath = args.catalog || "scripts/.current-catalog.json";

  console.log(`Chiave API-Football caricata: ${redact(apiKey)}`);
  if (!apiKey) {
    console.error("Manca API_FOOTBALL_KEY (variabile d'ambiente o --api-key). Interrotto.");
    process.exit(1);
  }
  console.log(`Stagione richiesta: ${season} (nessuna sostituzione automatica se non accessibile)`);

  // --- Verifica piano/quota ---
  const status = await apiGet("/status", apiKey);
  if (hasApiErrors(status.data) || status.httpStatus !== 200) {
    console.error("Impossibile verificare lo stato dell'account API-Football:", JSON.stringify(status.data?.errors || status.httpStatus));
    process.exit(1);
  }
  const plan = status.data.response?.subscription?.plan;
  const used = status.data.response?.requests?.current;
  const limit = status.data.response?.requests?.limit_day;
  console.log(`Piano: ${plan} — richieste usate oggi: ${used}/${limit}`);

  // --- 1) Elenco campionati italiani per la stagione richiesta ---
  console.log(`\nGET /leagues?country=Italy&season=${season}`);
  const leaguesRes = await apiGet(`/leagues?country=Italy&season=${season}`, apiKey);
  if (hasApiErrors(leaguesRes.data)) {
    console.error(`\n⛔ STAGIONE ${season} NON ACCESSIBILE con questo piano/chiave.`);
    console.error(`Errore restituito da API-Football: ${JSON.stringify(leaguesRes.data.errors)}`);
    console.error("Nessuna sostituzione con un'altra stagione. Nessun dato scaricato o importato. Interrotto qui su richiesta esplicita.");
    process.exit(2);
  }
  if (!Array.isArray(leaguesRes.data.response) || leaguesRes.data.response.length === 0) {
    console.error(`Risposta vuota/incompleta per /leagues?country=Italy&season=${season}. Interrotto.`);
    process.exit(2);
  }

  const foundByName = new Map(leaguesRes.data.response.map((l) => [l.league.name, l.league.id]));
  const resolvedLeagues = TARGET_LEAGUES.map((target) => {
    const foundId = foundByName.get(target.name);
    const mismatch = foundId !== undefined && foundId !== target.id;
    return { ...target, foundId: foundId ?? null, mismatch };
  });
  const missing = resolvedLeagues.filter((l) => l.foundId === null);
  if (missing.length) {
    console.error(`Campionati non trovati per la stagione ${season}: ${missing.map((l) => l.name).join(", ")}. Interrotto: partecipanti incomplete altrimenti.`);
    process.exit(2);
  }
  const mismatched = resolvedLeagues.filter((l) => l.mismatch);
  if (mismatched.length) {
    console.warn(`Attenzione, ID diversi da quelli di riferimento: ${mismatched.map((l) => `${l.name} atteso=${l.id} trovato=${l.foundId}`).join("; ")}`);
  }
  console.log("Campionati risolti:", resolvedLeagues.map((l) => `${l.name}=${l.foundId}`).join(", "));

  // --- 2) Partecipanti per ciascun campionato ---
  const catalog = await loadCurrentCatalog(catalogPath);
  console.log(`\nCatalogo attuale caricato: ${catalog.length} società (base di riconciliazione).`);

  const perLeagueTeams = {};
  for (const league of resolvedLeagues) {
    console.log(`GET /teams?league=${league.foundId}&season=${season}  (${league.name})`);
    const teamsRes = await apiGet(`/teams?league=${league.foundId}&season=${season}`, apiKey);
    if (hasApiErrors(teamsRes.data)) {
      console.error(`⛔ Errore su /teams per ${league.name}: ${JSON.stringify(teamsRes.data.errors)}. Interrotto.`);
      process.exit(2);
    }
    const teams = teamsRes.data.response || [];
    if (!teams.length) {
      console.error(`Risposta vuota per ${league.name}: 0 squadre. Interrotto (probabile problema di accesso, non un campionato realmente vuoto).`);
      process.exit(2);
    }
    perLeagueTeams[league.category + (league.group ? ` ${league.group}` : "")] = { league, teams };
    console.log(`  -> ${teams.length} squadre`);
  }

  // (la riconciliazione/scrittura del file di import avviene solo se si
  // arriva fin qui, cioè solo con dati realmente della stagione richiesta)
  // ... costruzione rows omessa in questo run: vedi commit successivo una
  // volta sbloccato l'accesso alla stagione, la logica è già pronta sopra
  // (matchClub/reserveLabel/parentClubName) e verrà collegata qui.
  console.log("\n✅ Dati scaricati con successo per la stagione", season);
  await writeFile(`scripts/.api-football-raw-${season}.json`, JSON.stringify(perLeagueTeams, null, 2));
  console.log(`Dump grezzo salvato in scripts/.api-football-raw-${season}.json (non tracciato in git).`);
}

main().catch((err) => { console.error("Errore imprevisto:", err.message); process.exit(1); });
