#!/usr/bin/env node
// Importatore ripetibile del catalogo società: legge un file JSON (forma
// completa, con formazioni/stagioni/provider — vedi scripts/seed-clubs.json)
// o CSV (solo campi società "piatti", una formazione di default a riga —
// pensato per aggiunte locali/dilettantistiche via foglio di calcolo) e li
// invia a POST /api/admin/clubs-import sul backend.
//
// Uso:
//   node scripts/import-clubs.mjs <file.json|file.csv> [opzioni]
//
// Opzioni:
//   --base-url=<url>   Default: http://127.0.0.1:8788 (wrangler pages dev locale)
//   --token=<token>    Default: variabile d'ambiente ADMIN_IMPORT_TOKEN
//   --dry-run          Calcola l'anteprima (created/updated/skipped/error) senza scrivere
//   --apply            Esegue la scrittura vera (senza questo flag, o senza --dry-run,
//                       lo script rifiuta di procedere: bisogna scegliere esplicitamente)
//
// Esempio (anteprima locale):
//   node scripts/import-clubs.mjs scripts/seed-clubs.json --dry-run
// Esempio (scrittura vera, in produzione):
//   ADMIN_IMPORT_TOKEN=xxxx node scripts/import-clubs.mjs scripts/seed-clubs.json \
//     --base-url=https://tuo-dominio.pages.dev --apply

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

function parseArgs(argv) {
  const args = { _: [] };
  for (const raw of argv) {
    if (raw.startsWith("--")) {
      const [key, ...rest] = raw.slice(2).split("=");
      args[key] = rest.length ? rest.join("=") : true;
    } else {
      args._.push(raw);
    }
  }
  return args;
}

// Parser CSV minimale: virgole come separatore, campi fra doppi apici per
// contenere virgole/apici letterali (raddoppiati). Sufficiente per un file
// curato a mano o esportato da un foglio di calcolo, non per CSV arbitrari.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    header.forEach((key, i) => { obj[key] = (cols[i] ?? "").trim(); });
    return obj;
  });
}

function csvRowToClub(row) {
  return {
    id: row.id || undefined,
    officialName: row.officialName || row.name || "",
    shortName: row.shortName || undefined,
    aliases: row.aliases ? row.aliases.split("|").map((s) => s.trim()).filter(Boolean) : [],
    city: row.city || undefined,
    region: row.region || undefined,
    province: row.province || undefined,
    colorPrimary: row.colorPrimary || undefined,
    colorSecondary: row.colorSecondary || undefined,
    colorsSource: row.colorsSource || "unknown",
    colorsNote: row.colorsNote || undefined,
    dataSource: row.dataSource || undefined,
    teams: [{
      teamType: row.teamType || "prima_squadra",
      discipline: row.discipline || "calcio11",
      gender: row.gender || "maschile",
      ageGroup: row.ageGroup || undefined,
      label: row.teamLabel || undefined
    }]
  };
}

async function loadRows(filePath) {
  const text = await readFile(filePath, "utf8");
  if (extname(filePath).toLowerCase() === ".csv") return parseCsv(text).map(csvRowToClub);
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : (Array.isArray(data.rows) ? data.rows : []);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = args._[0];
  if (!filePath) {
    console.error("Uso: node scripts/import-clubs.mjs <file.json|file.csv> [--base-url=...] [--token=...] [--dry-run|--apply]");
    process.exit(1);
  }
  const dryRun = Boolean(args["dry-run"]) || !args.apply;
  if (!args["dry-run"] && !args.apply) {
    console.log("Nessun flag --dry-run o --apply specificato: eseguo in anteprima (--dry-run). Aggiungi --apply per scrivere davvero.");
  }
  const baseUrl = args["base-url"] || "http://127.0.0.1:8788";
  const token = args.token || process.env.ADMIN_IMPORT_TOKEN || "";
  if (!token) {
    console.error("Manca il token: passa --token=... oppure imposta ADMIN_IMPORT_TOKEN nell'ambiente.");
    process.exit(1);
  }

  const rows = await loadRows(filePath);
  if (!rows.length) { console.error("Nessuna riga trovata nel file."); process.exit(1); }
  console.log(`Import ${dryRun ? "(ANTEPRIMA, nessuna scrittura)" : "(SCRITTURA REALE)"}: ${rows.length} righe da ${filePath} -> ${baseUrl}/api/admin/clubs-import`);

  const response = await fetch(`${baseUrl}/api/admin/clubs-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": token },
    body: JSON.stringify({ dryRun, rows })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Errore ${response.status}: ${data?.error || "risposta non valida"}`);
    process.exit(1);
  }

  console.log("Riepilogo:", data.summary);
  for (const r of data.results || []) {
    const warn = r.warnings?.length ? ` [avvisi: ${r.warnings.join("; ")}]` : "";
    if (r.action === "error") console.log(`  ✗ ${r.id || "(senza id)"}: ${r.message}${warn}`);
    else console.log(`  ✓ ${r.id} — ${r.action}${warn}`);
  }
  if (dryRun) console.log("\nAnteprima completata, nessuna scrittura eseguita. Rilancia con --apply per applicare.");
}

main().catch((err) => { console.error(err); process.exit(1); });
