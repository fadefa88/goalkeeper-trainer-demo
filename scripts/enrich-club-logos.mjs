#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STANDINGS = [
  { name: "Serie A", url: "https://www.diretta.it/calcio/italia/serie-a/classifiche/" },
  { name: "Serie B", url: "https://www.diretta.it/calcio/italia/serie-b/classifiche/" },
  { name: "Serie C - Girone A", url: "https://www.diretta.it/calcio/italia/serie-c-girone-a/classifiche/" },
  { name: "Serie C - Girone B", url: "https://www.diretta.it/calcio/italia/serie-c-girone-b/classifiche/" },
  { name: "Serie C - Girone C", url: "https://www.diretta.it/calcio/italia/serie-c-girone-c/classifiche/" }
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
  for (const label of ["Accetta tutto", "Accetta tutti", "Accetta", "Accept all", "Accept"]) {
    const button = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
    if (!(await button.count())) continue;
    try {
      await button.click({ timeout: 1200 });
      await page.waitForTimeout(300);
      return;
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

function colorDistance(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

async function extractPalette(buffer) {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .resize(96, 96, { fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bins = new Map();
  let opaque = 0;
  let white = 0;

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 120) continue;
    opaque++;
    const hsl = rgbToHsl(r, g, b);
    if (hsl.l > 0.94 && hsl.s < 0.12) {
      white++;
      continue;
    }

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
    const palePenalty = hsl.l > 0.88 && hsl.s < 0.20 ? 0.25 : 1;
    return { r, g, b, share, score: share * (1 + hsl.s * 1.7) * palePenalty, ...hsl };
  }).filter(c => c.share >= 0.002).sort((a, b) => b.score - a.score);

  if (!colors.length) return null;

  const primary = colors[0];
  let secondary = colors
    .filter(c => c !== primary && c.share >= 0.006 && colorDistance(c, primary) >= 65)
    .sort((a, b) => (b.share * (1 + b.s)) - (a.share * (1 + a.s)))[0];

  if (!secondary && opaque && white / opaque >= 0.04) {
    secondary = { r: 255, g: 255, b: 255, share: white / opaque };
  }
  if (!secondary) {
    secondary = primary.l > 0.55
      ? { r: 17, g: 17, b: 17, share: 0 }
      : { r: 255, g: 255, b: 255, share: 0 };
  }

  return {
    primary: toHex(primary.r, primary.g, primary.b),
    secondary: toHex(secondary.r, secondary.g, secondary.b),
    candidates: colors.slice(0, 6).map(c => ({
      color: toHex(c.r, c.g, c.b),
      share: Number(c.share.toFixed(4))
    }))
  };
}

async function getVisualInfo(handle) {
  try {
    return await handle.evaluate(el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const bg = s.backgroundImage || "none";
      const mask = s.maskImage || s.webkitMaskImage || "none";
      const cls = typeof el.className === "string" ? el.className : (el.getAttribute("class") || "");
      const visual = tag === "img" || tag === "svg" || tag === "canvas" || bg !== "none" || mask !== "none" || /logo|image|participant/i.test(cls);
      const visible = s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity || 1) > 0;
      let sourceUrl = null;
      if (tag === "img") sourceUrl = el.currentSrc || el.getAttribute("src") || el.getAttribute("data-src");
      if (!sourceUrl && bg !== "none") {
        const m = bg.match(/url\(["']?(.*?)["']?\)/);
        if (m) sourceUrl = m[1];
      }
      return {
        tag, cls, visual, visible, sourceUrl,
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height
      };
    });
  } catch {
    return null;
  }
}

async function captureLogoNearAnchor(page, anchor) {
  await anchor.scrollIntoViewIfNeeded().catch(() => {});
  const anchorBox = await anchor.boundingBox();
  if (!anchorBox) return null;

  const rowHandle = await anchor.evaluateHandle(el =>
    el.closest('.ui-table__row') ||
    el.closest('[class*="ui-table__row"]') ||
    el.closest('[class*="tableCellParticipant"]')?.parentElement ||
    el.parentElement
  );
  const row = rowHandle.asElement();

  let best = null;
  if (row) {
    const descendants = await row.$$("*");
    for (const handle of descendants) {
      const info = await getVisualInfo(handle);
      if (!info?.visual || !info.visible) continue;
      if (info.width < 12 || info.height < 12 || info.width > 80 || info.height > 80) continue;
      const ratio = info.width / info.height;
      if (ratio < 0.45 || ratio > 2.2) continue;

      const centerY = info.y + info.height / 2;
      const anchorCenterY = anchorBox.y + anchorBox.height / 2;
      const horizontalGap = anchorBox.x - (info.x + info.width);
      const verticalGap = Math.abs(centerY - anchorCenterY);

      // Lo stemma nella classifica è normalmente immediatamente a sinistra del nome.
      if (horizontalGap < -15 || horizontalGap > 95 || verticalGap > 35) continue;

      let score = Math.abs(horizontalGap - 8) + verticalGap * 2;
      if (info.tag === "img" || info.tag === "svg") score -= 12;
      if (/logo|image/i.test(info.cls)) score -= 8;
      if (/participant/i.test(info.cls)) score -= 3;

      if (!best || score < best.score) best = { handle, info, score };
    }
  }

  if (best) {
    try {
      const buffer = await best.handle.screenshot({ type: "png" });
      if (buffer?.length > 150) {
        const palette = await extractPalette(buffer);
        if (palette) return { buffer, palette, sourceUrl: best.info.sourceUrl || null, mode: "element" };
      }
    } catch {}
  }

  // Fallback indipendente dal DOM: cattura la piccola area immediatamente
  // a sinistra del testo della squadra, dove Diretta renderizza lo stemma.
  const clip = {
    x: Math.max(0, anchorBox.x - 46),
    y: Math.max(0, anchorBox.y + anchorBox.height / 2 - 20),
    width: 40,
    height: 40
  };

  try {
    const buffer = await page.screenshot({ type: "png", clip });
    const palette = await extractPalette(buffer);
    if (palette) return { buffer, palette, sourceUrl: null, mode: "clip" };
  } catch {}

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const season = args.season || "2026";
  const input = resolve(ROOT, args.input || `scripts/import-serie-abc-${season}.json`);
  const logoDir = resolve(ROOT, args["logo-dir"] || "assets/club-logos");
  const clubs = JSON.parse(await readFile(input, "utf8"));

  await mkdir(logoDir, { recursive: true });

  // provider team id -> società. Se una società ha prima squadra + U23,
  // Serie A/B vengono processate prima della C e il primo stemma trovato vince.
  const clubByProviderId = new Map();
  for (const club of clubs) {
    for (const p of club.providerIds || []) {
      if (p.provider === "diretta" && p.providerId) {
        clubByProviderId.set(String(p.providerId), club);
      }
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    viewport: { width: 1440, height: 1100 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  const captured = new Map();
  try {
    for (const competition of STANDINGS) {
      console.log(`\n[${competition.name}] cattura stemmi dalla classifica...`);
      await page.goto(competition.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await acceptCookies(page);
      await page.waitForTimeout(1200);
      await page.waitForFunction(() => document.querySelectorAll('a[href*="/squadra/"]').length >= 10, null, { timeout: 15000 }).catch(() => {});

      const anchors = page.locator('a[href*="/squadra/"]');
      const count = await anchors.count();
      let matched = 0;
      let newLogos = 0;
      const seenIds = new Set();

      for (let i = 0; i < count; i++) {
        const anchor = anchors.nth(i);
        const href = await anchor.getAttribute("href").catch(() => null);
        const id = providerIdFromHref(href || "");
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const club = clubByProviderId.get(id);
        if (!club) continue;
        matched++;
        if (captured.has(club.id)) continue;

        const result = await captureLogoNearAnchor(page, anchor);
        if (!result) continue;

        const label = club.shortName || club.officialName || club.id;
        const out = resolve(logoDir, `${club.id}.webp`);
        await sharp(result.buffer, { failOn: "none" })
          .trim({ background: "#ffffff", threshold: 12 })
          .resize(256, 256, { fit: "inside", withoutEnlargement: false })
          .webp({ quality: 92, alphaQuality: 100 })
          .toFile(out)
          .catch(async () => {
            await sharp(result.buffer, { failOn: "none" })
              .resize(256, 256, { fit: "inside", withoutEnlargement: false })
              .webp({ quality: 92, alphaQuality: 100 })
              .toFile(out);
          });

        captured.set(club.id, {
          club,
          providerTeamId: id,
          competition: competition.name,
          sourcePage: competition.url,
          sourceUrl: result.sourceUrl,
          mode: result.mode,
          palette: result.palette
        });
        newLogos++;
        console.log(`  ${label}: OK (${id}, ${result.mode}) -> ${result.palette.primary} / ${result.palette.secondary}`);
      }

      console.log(`  link associati al catalogo: ${matched}; nuovi stemmi: ${newLogos}`);
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const manifest = {};
  let found = 0;

  for (const club of clubs) {
    const hit = captured.get(club.id);
    if (!hit) continue;
    found++;

    club.logoPath = `/assets/club-logos/${club.id}.webp`;
    club.logoSourceUrl = hit.sourceUrl || hit.sourcePage;
    club.colorPrimary = hit.palette.primary;
    club.colorSecondary = hit.palette.secondary;
    club.colorsSource = "adapted";
    club.colorsNote = "Palette ricavata automaticamente dallo stemma renderizzato nella classifica Diretta.it; verificare manualmente prima dell'uso commerciale.";
    club.colorsVerifiedAt = new Date().toISOString();
    club.logoPaletteCandidates = hit.palette.candidates;

    manifest[club.id] = {
      name: club.shortName || club.officialName || club.id,
      providerTeamId: hit.providerTeamId,
      competition: hit.competition,
      path: club.logoPath,
      sourcePage: hit.sourcePage,
      sourceUrl: hit.sourceUrl || null,
      captureMode: hit.mode,
      colorPrimary: hit.palette.primary,
      colorSecondary: hit.palette.secondary,
      paletteCandidates: hit.palette.candidates,
      scrapedAt: new Date().toISOString()
    };
  }

  await writeFile(input, `${JSON.stringify(clubs, null, 2)}\n`, "utf8");
  await writeFile(resolve(logoDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const missing = clubs.length - found;
  console.log(`\nLogo trovati: ${found}/${clubs.length}`);
  console.log(`Logo mancanti: ${missing}`);

  const ratio = clubs.length ? found / clubs.length : 0;
  if (ratio < 0.85) {
    console.error(`Solo ${found}/${clubs.length} loghi risolti: sotto la soglia di sicurezza dell'85%. Interrompo.`);
    process.exit(2);
  }
}

main().catch(err => {
  console.error(err?.stack || err);
  process.exit(1);
});
