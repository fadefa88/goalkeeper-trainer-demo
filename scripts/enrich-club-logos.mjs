#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STANDINGS_URLS = [
  "https://www.diretta.it/calcio/italia/serie-a/classifiche/",
  "https://www.diretta.it/calcio/italia/serie-b/classifiche/",
  "https://www.diretta.it/calcio/italia/serie-c-girone-a/classifiche/",
  "https://www.diretta.it/calcio/italia/serie-c-girone-b/classifiche/",
  "https://www.diretta.it/calcio/italia/serie-c-girone-c/classifiche/"
];

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [key, ...rest] = raw.slice(2).split("=");
    out[key] = rest.length ? rest.join("=") : true;
  }
  return out;
}

function providerIdFromHref(href) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split("/").filter(Boolean);
    const teamPos = parts.findIndex(p => p === "squadra");
    if (teamPos >= 0) return parts[teamPos + 2] || parts[teamPos + 1] || null;
  } catch {}
  return null;
}

async function acceptCookies(page) {
  for (const text of ["Accetta tutto", "Accetta tutti", "Accetta", "Accept all", "Accept"]) {
    try {
      const b = page.getByRole("button", { name: new RegExp(`^${text}$`, "i") }).first();
      if (await b.count()) {
        await b.click({ timeout: 1000 });
        await page.waitForTimeout(250);
        return;
      }
    } catch {}
  }
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
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
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
    const palePenalty = hsl.l > 0.88 && hsl.s < 0.2 ? 0.3 : 1;
    return { r, g, b, share, score: share * (1 + hsl.s * 1.7) * palePenalty, ...hsl };
  }).filter(c => c.share >= 0.002).sort((a, b) => b.score - a.score);

  const primary = colors[0] || { r: 17, g: 17, b: 17, l: 0.07 };
  let secondary = colors.find(c => c !== primary && c.share >= 0.008 && dist(c, primary) >= 75);
  if (!secondary && opaque && white / opaque >= 0.04) secondary = { r: 255, g: 255, b: 255 };
  if (!secondary) secondary = primary.l > 0.55 ? { r: 17, g: 17, b: 17 } : { r: 255, g: 255, b: 255 };

  return {
    primary: toHex(primary.r, primary.g, primary.b),
    secondary: toHex(secondary.r, secondary.g, secondary.b),
    candidates: colors.slice(0, 6).map(c => ({ color: toHex(c.r, c.g, c.b), share: Number(c.share.toFixed(4)) }))
  };
}

async function buildTeamUrlMap(page) {
  const map = new Map();
  console.log("Risoluzione URL esatti delle squadre dalle classifiche...");

  for (const url of STANDINGS_URLS) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await acceptCookies(page);
    await page.waitForTimeout(900);

    const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="/squadra/"]')]
      .map(a => a.href)
      .filter(Boolean));

    let added = 0;
    for (const href of links) {
      const id = providerIdFromHref(href);
      if (id && !map.has(id)) {
        map.set(id, href);
        added++;
      }
    }
    console.log(`  ${url} -> ${added} URL nuove`);
  }

  console.log(`URL squadra risolte: ${map.size}\n`);
  return map;
}

async function markBestLogoCandidate(page, teamName) {
  return page.evaluate((name) => {
    document.querySelectorAll('[data-gk-logo-candidate]').forEach(el => el.removeAttribute('data-gk-logo-candidate'));

    const norm = v => String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const wanted = norm(name);
    const candidates = [];
    const all = [...document.querySelectorAll('img, picture img, svg, [class*="logo" i], [class*="teamHeader" i], [class*="participant" i]')];

    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24 || rect.width > 320 || rect.height > 320) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight + 300) continue;

      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) < 0.15) continue;

      const parent = el.parentElement;
      const grand = parent?.parentElement;
      const cls = [el.className?.baseVal || el.className, parent?.className?.baseVal || parent?.className, grand?.className?.baseVal || grand?.className]
        .filter(Boolean).join(" ").toLowerCase();
      const alt = `${el.getAttribute?.("alt") || ""} ${el.getAttribute?.("title") || ""}`;
      const src = el.currentSrc || el.getAttribute?.("src") || el.getAttribute?.("data-src") || "";
      const bg = style.backgroundImage || "";
      const aria = el.getAttribute?.("aria-label") || "";
      const semantic = norm(`${alt} ${aria}`);

      let score = 0;
      if (/teamheader/.test(cls)) score += 70;
      if (/logo/.test(cls)) score += 55;
      if (/participant/.test(cls)) score += 15;
      if (/team.*logo|logo.*team/.test(cls)) score += 45;
      if (wanted && semantic && (semantic.includes(wanted) || wanted.includes(semantic))) score += 80;
      if (/res\/image\/data|flashscore|diretta/.test(`${src} ${bg}`.toLowerCase())) score += 18;
      if (rect.top >= 0 && rect.top < 420) score += 25;
      if (Math.abs(rect.width - rect.height) / Math.max(rect.width, rect.height) < 0.28) score += 18;
      if (rect.width >= 50 && rect.height >= 50) score += 12;
      if (/flag|country|sport|social|menu|avatar|bookmaker|sponsor|adservice/.test(cls)) score -= 100;
      if (/flag|country|sport|bookmaker|sponsor|adservice/.test(`${src} ${bg}`.toLowerCase())) score -= 80;

      candidates.push({ el, score, src, bg, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, cls, alt });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 35) {
      return {
        ok: false,
        top: candidates.slice(0, 5).map(c => ({ score: c.score, src: c.src, bg: c.bg, rect: c.rect, cls: c.cls, alt: c.alt }))
      };
    }

    best.el.setAttribute('data-gk-logo-candidate', '1');
    return {
      ok: true,
      score: best.score,
      src: best.src || null,
      backgroundImage: best.bg || null,
      rect: best.rect,
      cls: best.cls,
      alt: best.alt
    };
  }, teamName);
}

async function captureRenderedLogo(page, teamUrl, teamName) {
  await page.goto(teamUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await acceptCookies(page);
  await page.waitForTimeout(650);

  // Forza il caricamento degli asset lazy nell'area iniziale della pagina.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);

  const chosen = await markBestLogoCandidate(page, teamName);
  if (!chosen.ok) return { ok: false, debug: chosen.top || [] };

  const locator = page.locator('[data-gk-logo-candidate="1"]').first();
  try {
    const buffer = await locator.screenshot({ type: "png", omitBackground: true, timeout: 5000 });
    if (!buffer || buffer.length < 200) return { ok: false, debug: [{ reason: "screenshot vuoto", ...chosen }] };
    await sharp(buffer, { failOn: "none" }).metadata();
    return {
      ok: true,
      buffer,
      sourceUrl: chosen.src || chosen.backgroundImage || teamUrl,
      teamUrl,
      debug: chosen
    };
  } catch (err) {
    return { ok: false, debug: [{ reason: err.message, ...chosen }] };
  }
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

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 2,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    const teamUrlMap = await buildTeamUrlMap(page);

    for (let i = 0; i < clubs.length; i++) {
      const club = clubs[i];
      const label = club.shortName || club.officialName || club.id;
      const ids = (club.providerIds || [])
        .filter(p => p.provider === "diretta" && p.providerId)
        .map(p => String(p.providerId));

      let result = null;
      let teamId = null;
      let teamUrl = null;

      for (const id of ids) {
        const exactUrl = teamUrlMap.get(id);
        if (!exactUrl) continue;
        const captured = await captureRenderedLogo(page, exactUrl, label);
        if (captured.ok) {
          result = captured;
          teamId = id;
          teamUrl = exactUrl;
          break;
        }
      }

      if (!result) {
        console.warn(`[${i + 1}/${clubs.length}] ${label}: stemma renderizzato non individuato (id: ${ids.join(", ") || "nessuno"})`);
        missing++;
        continue;
      }

      const out = resolve(logoDir, `${club.id}.webp`);
      await sharp(result.buffer, { failOn: "none" })
        .resize(256, 256, { fit: "inside", withoutEnlargement: false })
        .webp({ quality: 94, alphaQuality: 100 })
        .toFile(out);

      const palette = await extractPalette(result.buffer);
      club.logoPath = `/assets/club-logos/${club.id}.webp`;
      club.logoSourceUrl = result.sourceUrl;
      club.logoSourcePage = teamUrl;
      club.colorPrimary = palette.primary;
      club.colorSecondary = palette.secondary;
      club.colorsSource = "adapted";
      club.colorsNote = "Palette ricavata automaticamente dallo stemma renderizzato su Diretta.it; verificare manualmente prima dell'uso commerciale.";
      club.colorsVerifiedAt = new Date().toISOString();
      club.logoPaletteCandidates = palette.candidates;

      manifest[club.id] = {
        name: label,
        providerTeamId: teamId,
        path: club.logoPath,
        sourceUrl: result.sourceUrl,
        sourcePage: teamUrl,
        colorPrimary: palette.primary,
        colorSecondary: palette.secondary,
        paletteCandidates: palette.candidates,
        scrapedAt: new Date().toISOString()
      };

      found++;
      console.log(`[${i + 1}/${clubs.length}] ${label}: OK ${teamId} -> ${palette.primary} / ${palette.secondary}`);
    }

    await writeFile(input, `${JSON.stringify(clubs, null, 2)}\n`, "utf8");
    await writeFile(resolve(logoDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    console.log(`\nLogo trovati: ${found}/${clubs.length}`);
    console.log(`Logo mancanti: ${missing}`);

    // Consideriamo fallita la run se la risoluzione è chiaramente rotta.
    // Qualche singolo logo mancante può invece capitare e resta visibile nel log.
    if (found < Math.floor(clubs.length * 0.85)) {
      console.error(`Solo ${found}/${clubs.length} loghi risolti: sotto la soglia di sicurezza dell'85%. Interrompo.`);
      process.exit(2);
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(err => {
  console.error(err?.stack || err);
  process.exit(1);
});
