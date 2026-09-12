(() => {
  if (window.gkTheme) return;

  const PANEL_2 = "#1c1e21";
  const BG = "#0b0b0c";
  const TEXT_LIGHT = "#f2f2f0";
  const TEXT_DARK = "#101112";
  const HEX_RE = /^#[0-9a-f]{6}$/i;
  const CLUB_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
  const NEUTRAL = { primary: "#5b6f9e", secondary: "#8792a6" };
  const NEUTRAL_LOGO = "icon.svg";
  const NEUTRAL_BRAND = "GK Trainer";

  function hexToRgb(hex) {
    const m = String(hex).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function rgbToHex({ r, g, b }) {
    const h = n => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  function srgbToLinear(c) {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function relativeLuminance(rgb) {
    return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
  }
  function contrastRatio(a, b) {
    const la = relativeLuminance(hexToRgb(a));
    const lb = relativeLuminance(hexToRgb(b));
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  }
  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h, s, l };
  }
  function hslToRgb({ h, s, l }) {
    if (!s) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const hue = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hue(p, q, h + 1 / 3) * 255),
      g: Math.round(hue(p, q, h) * 255),
      b: Math.round(hue(p, q, h - 1 / 3) * 255)
    };
  }
  function withLightness(hex, l) {
    const hsl = rgbToHsl(hexToRgb(hex));
    return rgbToHex(hslToRgb({ ...hsl, l: Math.min(0.96, Math.max(0.04, l)) }));
  }
  function adjustForContrast(hex, bg, minRatio) {
    if (contrastRatio(hex, bg) >= minRatio) return hex;
    const hsl = rgbToHsl(hexToRgb(hex));
    for (let step = 1; step <= 46; step++) {
      const d = step * 0.02;
      const lighter = withLightness(hex, hsl.l + d);
      if (contrastRatio(lighter, bg) >= minRatio) return lighter;
      const darker = withLightness(hex, hsl.l - d);
      if (contrastRatio(darker, bg) >= minRatio) return darker;
    }
    return contrastRatio("#ffffff", bg) >= contrastRatio("#0a0a0a", bg) ? "#ffffff" : "#0a0a0a";
  }
  function pickOnAccent(hex) {
    const light = contrastRatio(TEXT_LIGHT, hex);
    const dark = contrastRatio(TEXT_DARK, hex);
    return light >= dark ? { color: TEXT_LIGHT, ratio: light } : { color: TEXT_DARK, ratio: dark };
  }
  function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  function buildTokens(primaryIn, secondaryIn) {
    const primary = HEX_RE.test(primaryIn || "") ? primaryIn : NEUTRAL.primary;
    const secondaryRaw = HEX_RE.test(secondaryIn || "") ? secondaryIn : primary;
    const red = adjustForContrast(primary, BG, 3);
    let fill = primary;
    let onAccent = pickOnAccent(fill);
    for (let i = 0; onAccent.ratio < 4.5 && i < 30; i++) {
      const hsl = rgbToHsl(hexToRgb(fill));
      fill = withLightness(fill, hsl.l + (onAccent.color === TEXT_LIGHT ? -0.02 : 0.02));
      onAccent = pickOnAccent(fill);
    }
    const fillDeep = withLightness(fill, rgbToHsl(hexToRgb(fill)).l - 0.14);
    return {
      "--red": red,
      "--red-text": adjustForContrast(primary, PANEL_2, 4.5),
      "--red-fill": fill,
      "--red-fill-deep": fillDeep,
      "--red-on-light": adjustForContrast(primary, "#ffffff", 4.5),
      "--red-soft": rgbaFromHex(red, 0.14),
      "--red-soft-strong": rgbaFromHex(red, 0.28),
      "--on-accent": onAccent.color,
      "--mantova-gold": adjustForContrast(secondaryRaw, PANEL_2, 3)
    };
  }

  const root = document.documentElement;
  const applyTokens = tokens => Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v));
  const applyPalette = (primary, secondary) => applyTokens(buildTokens(primary, secondary));

  let logoRequestVersion = 0;
  function applyLogo(pref) {
    const version = ++logoRequestVersion;
    root.style.setProperty("--app-logo", `url("${NEUTRAL_LOGO}")`);
    if (!pref || pref.themeMode !== "club" || !pref.club?.id || typeof Image === "undefined") return;
    const clubId = String(pref.club.id).trim().toLowerCase();
    if (!CLUB_ID_RE.test(clubId)) return;
    const path = `/assets/club-logos/${clubId}.webp`;
    const probe = new Image();
    probe.onload = () => {
      if (version === logoRequestVersion) root.style.setProperty("--app-logo", `url("${path}")`);
    };
    probe.onerror = () => {
      if (version === logoRequestVersion) root.style.setProperty("--app-logo", `url("${NEUTRAL_LOGO}")`);
    };
    probe.src = path;
  }

  let brandRequestVersion = 0;
  function brandName(pref) {
    if (pref?.themeMode === "club" && pref.club) {
      return String(pref.club.shortName || pref.club.officialName || NEUTRAL_BRAND).trim().slice(0, 80) || NEUTRAL_BRAND;
    }
    if (pref?.themeMode === "custom" && pref.customClubName) {
      return String(pref.customClubName).trim().slice(0, 80) || NEUTRAL_BRAND;
    }
    return NEUTRAL_BRAND;
  }
  function applyBrandName(pref) {
    const version = ++brandRequestVersion;
    const name = brandName(pref);
    const commit = () => {
      if (version !== brandRequestVersion) return;
      const el = document.querySelector(".app-brand");
      if (!el) return;
      el.textContent = name;
      el.title = name;
      el.setAttribute("aria-label", name);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", commit, { once: true });
    else commit();
  }

  function paletteFromPreference(pref) {
    if (!pref) return null;
    if (pref.useCustomColors && HEX_RE.test(pref.colorPrimary || "")) {
      return { primary: pref.colorPrimary, secondary: HEX_RE.test(pref.colorSecondary || "") ? pref.colorSecondary : pref.colorPrimary };
    }
    if (pref.club && HEX_RE.test(pref.club.colorPrimary || "")) {
      return { primary: pref.club.colorPrimary, secondary: HEX_RE.test(pref.club.colorSecondary || "") ? pref.club.colorSecondary : pref.club.colorPrimary };
    }
    return null;
  }
  function applyPreference(pref) {
    const palette = paletteFromPreference(pref);
    applyPalette(palette?.primary || NEUTRAL.primary, palette?.secondary || NEUTRAL.secondary);
    applyLogo(pref);
    applyBrandName(pref);
  }
  function applyNeutral() {
    applyPalette(NEUTRAL.primary, NEUTRAL.secondary);
    applyLogo(null);
    applyBrandName(null);
  }

  const ACTIVE_KEY = "gk_theme_active_account";
  const cacheKey = accountId => `gk_theme_${accountId}`;
  function readCache(accountId) {
    if (!accountId) return null;
    try {
      const raw = localStorage.getItem(cacheKey(accountId));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function writeCache(accountId, state) {
    if (!accountId) return;
    try { localStorage.setItem(cacheKey(accountId), JSON.stringify(state || {})); } catch {}
  }
  function setActiveAccount(accountId) {
    try {
      if (accountId) localStorage.setItem(ACTIVE_KEY, accountId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }
  function getActiveAccount() {
    try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; }
  }

  const activeId = getActiveAccount();
  const cached = activeId ? readCache(activeId) : null;
  if (cached) applyPreference(cached); else applyNeutral();

  window.gkTheme = {
    NEUTRAL,
    buildTokens,
    applyPalette,
    applyNeutral,
    applyPreference,
    hydrateAccount(accountId) {
      setActiveAccount(accountId);
      applyPreference(readCache(accountId));
    },
    setForAccount(accountId, pref) {
      setActiveAccount(accountId);
      writeCache(accountId, pref || null);
      applyPreference(pref);
    },
    resetVisual() {
      setActiveAccount(null);
      applyNeutral();
    },
    contrastRatio
  };
})();
