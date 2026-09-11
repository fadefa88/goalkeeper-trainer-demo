#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [key, ...rest] = raw.slice(2).split("=");
    out[key] = rest.length ? rest.join("=") : true;
  }
  return out;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? 60 * (((g - b) / d) % 6)
    : max === g ? 60 * ((b - r) / d + 2)
    : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h, s, l };
}

function toHex(r, g, b) {
  return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function dist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

async function extractPalette(buffer) {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .resize(96, 96, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bins = new Map();
  let opaque = 0;
  let white = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 140) continue;
    opaque++;
    const hsl = rgbToHsl(r, g, b);
    if (hsl.l > 0.94 && hsl.s < 0.12) { white++; continue; }
    const qr = Math.min(255, Math.round(r / 16) * 16);
    const qg = Math.min(255, Math.round(g / 16) * 16);
    const qb = Math.min(255, Math.round(b / 16) * 16);
    const key = `${qr},${qg},${qb}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }

  const colors = [...bins.entries()].map(([key, count]) => {
    const [r, g, b] = key.split(",").map(Number);
    const hsl = rgbToHsl(r, g, b);
    const share = opaque ? count / opaque : 0;
    return { r, g, b, share, score: share * (1 + hsl.s * 1.7), ...hsl };
  }).filter(c => c.share >= 0.002).sort((a, b) => b.score - a.score);

  const primary = colors[0] || { r: 17, g: 17, b: 17, share: 1 };
  let secondary = colors.find(c => c !== primary && c.share >= 0.008 && dist(c, primary) >= 75);
  if (!secondary && opaque && white / opaque >= 0.04) secondary = { r: 255, g: 255, b: 255, share: white / opaque };
  if (!secondary) secondary = primary.l > 0.55 ? { r: 17, g: 17, b: 17 } : { r: 255, g: 255, b: 255 };

  return {
    primary: toHex(primary.r, primary.g, primary.b),
    secondary: toHex(secondary.r, secondary.g, secondary.b),
    candidates: colors.slice(0, 6).map(c => ({ color: toHex(c.r, c.g, c.b), share: Number(c.share.toFixed(4)) }))
  };
}

async function fetchLogo(teamId) {
  const candidates = [
    `https://static.flashscore.com/res/image/data/${teamId}_h.png`,
    `https://static.flashscore.com/res/image/data/${teamId}.png`
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { Accept: "image/*", "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 200) continue;
      await sharp(buffer, { failOn: "none" }).metadata();
      return { url, buffer };
    } catch {}
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const season = args.season || "2026";
  const input = resolve(ROOT, args.input || `scripts/import-serie-abc-${season}.json`);
  const logoDir = resolve(ROOT, args["logo-dir"] || "assets/club-logos");
  const clubs = JSON.parse(await readFile(input, "utf8"));
  const manifest = {};
  let found = 0, missing = 0;

  await mkdir(logoDir, { recursive: true });

  for (let i = 0; i < clubs.length; i++) {
    const club = clubs[i];
    const ids = (club.providerIds || [])
      .filter(p => p.provider === "diretta" && p.providerId)
      .map(p => String(p.providerId));

    let logo = null;
    let teamId = null;
    for (const id of ids) {
      logo = await fetchLogo(id);
      if (logo) { teamId = id; break; }
    }

    const label = club.shortName || club.officialName || club.id;
    if (!logo) {
      console.warn(`[${i + 1}/${clubs.length}] ${label}: logo CDN non trovato (id: ${ids.join(", ") || "nessuno"})`);
      missing++;
      continue;
    }

    const out = resolve(logoDir, `${club.id}.webp`);
    await sharp(logo.buffer, { failOn: "none" })
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(out);

    const palette = await extractPalette(logo.buffer);
    club.logoPath = `/assets/club-logos/${club.id}.webp`;
    club.logoSourceUrl = logo.url;
    club.colorPrimary = palette.primary;
    club.colorSecondary = palette.secondary;
    club.colorsSource = "adapted";
    club.colorsNote = "Palette ricavata automaticamente dallo stemma Flashscore/Diretta; verificare manualmente prima dell'uso commerciale.";
    club.colorsVerifiedAt = new Date().toISOString();
    club.logoPaletteCandidates = palette.candidates;

    manifest[club.id] = {
      name: label,
      providerTeamId: teamId,
      path: club.logoPath,
      sourceUrl: logo.url,
      colorPrimary: palette.primary,
      colorSecondary: palette.secondary,
      paletteCandidates: palette.candidates,
      scrapedAt: new Date().toISOString()
    };

    found++;
    console.log(`[${i + 1}/${clubs.length}] ${label}: ${teamId} -> ${palette.primary} / ${palette.secondary}`);
  }

  await writeFile(input, `${JSON.stringify(clubs, null, 2)}\n`, "utf8");
  await writeFile(resolve(logoDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`\nLogo trovati: ${found}/${clubs.length}`);
  console.log(`Logo mancanti: ${missing}`);
  if (found === 0) {
    console.error("Nessun logo risolto: interrompo per evitare un artifact apparentemente valido ma senza stemmi.");
    process.exit(2);
  }
}

main().catch(err => {
  console.error(err?.stack || err);
  process.exit(1);
});
