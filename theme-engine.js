// Motore del tema per società/cliente. Caricato per PRIMO in <head> (prima
// di style.css finisca pure, non serve: le custom property si applicano
// comunque appena il CSS le legge) così il tema corretto (neutro o
// dell'ultimo account noto) è già impostato prima che l'utente veda un
// frame con i colori sbagliati.
//
// Design del contrasto (vedi anche verifica manuale in fondo al file):
// - --red / --mantova-gold: colore sociale "grezzo", solo con un pavimento
//   di leggibilità (>=3:1) contro lo sfondo più scuro, per usi NON testuali
//   (bordi, puntini, accent-color nativi). Quasi sempre resta invariato.
// - --red-fill: stesso colore, usato come sfondo pieno di bottoni/celle
//   selezionate. Non viene toccato per il pannello (non è testo lì
//   sopra), solo eventualmente nudged quanto basta perché esista un testo
//   leggibile sopra (--on-accent) — per i colori sociali reali non scatta
//   quasi mai: il bottone resta fedele al colore della società.
// - --red-text: variante SEPARATA, schiarita/scurita quanto serve per
//   restare leggibile (>=4.5:1) quando il colore compare come TESTO su una
//   card scura (--panel-2). Tenerla distinta da --red-fill evita di dover
//   sbiadire i bottoni pieni solo per rendere leggibile una scritta altrove.
// - --red-on-light: variante per l'unico caso di testo colorato su sfondo
//   bianco fisso (badge giorno partita).
// - --on-accent: testo (chiaro o scuro) da usare SOPRA --red-fill, scelto
//   in base al contrasto reale, non sempre bianco (vedi giallo/celeste).
// Riferimento: W3C contrasto testo (1.4.3) e non-testo (1.4.11).
(() => {
  if (window.gkTheme) return;

  const PANEL_2 = "#1c1e21";
  const BG = "#0b0b0c";
  const TEXT_LIGHT = "#f2f2f0";
  const TEXT_DARK = "#101112";
  const HEX_RE = /^#[0-9a-f]{6}$/i;

  // Tema neutro e professionale: nessun colore di nessuna società, usato
  // al primo accesso, per account senza preferenza e all'auth screen.
  const NEUTRAL = { primary: "#5b6f9e", secondary: "#8792a6" };

  function hexToRgb(hex) {
    const m = String(hex).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function rgbToHex({ r, g, b }) {
    const h = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  function srgbToLinear(c) {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function relativeLuminance(rgb) {
    return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
  }
  function contrastRatio(hexA, hexB) {
    const la = relativeLuminance(hexToRgb(hexA));
    const lb = relativeLuminance(hexToRgb(hexB));
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  }
  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) { h = 0; s = 0; } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h, s, l };
  }
  function hslToRgb({ h, s, l }) {
    if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    };
  }
  function withLightness(hex, l) {
    const hsl = rgbToHsl(hexToRgb(hex));
    return rgbToHex(hslToRgb({ ...hsl, l: Math.min(0.96, Math.max(0.04, l)) }));
  }
  // Sposta la luminosità in piccoli passi (schiarendo O scurendo, qualunque
  // direzione arrivi prima al target) finché il contrasto con bgHex non
  // raggiunge minRatio. Fallback estremo: bianco o nero puro, quello dei
  // due con contrasto migliore.
  function adjustForContrast(hex, bgHex, minRatio) {
    if (contrastRatio(hex, bgHex) >= minRatio) return hex;
    const hsl = rgbToHsl(hexToRgb(hex));
    for (let step = 1; step <= 46; step++) {
      const delta = step * 0.02;
      const lighter = withLightness(hex, hsl.l + delta);
      if (contrastRatio(lighter, bgHex) >= minRatio) return lighter;
      const darker = withLightness(hex, hsl.l - delta);
      if (contrastRatio(darker, bgHex) >= minRatio) return darker;
    }
    const white = "#ffffff", black = "#0a0a0a";
    return contrastRatio(white, bgHex) >= contrastRatio(black, bgHex) ? white : black;
  }
  function pickOnAccent(hex) {
    const cw = contrastRatio(TEXT_LIGHT, hex);
    const cd = contrastRatio(TEXT_DARK, hex);
    return cw >= cd ? { color: TEXT_LIGHT, ratio: cw } : { color: TEXT_DARK, ratio: cd };
  }
  function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function buildTokens(primaryIn, secondaryIn) {
    const primary = HEX_RE.test(primaryIn || "") ? primaryIn : NEUTRAL.primary;
    const secondaryRaw = HEX_RE.test(secondaryIn || "") ? secondaryIn : primary;

    const red = adjustForContrast(primary, BG, 3.0);

    let fill = primary;
    let onAccent = pickOnAccent(fill);
    for (let guard = 0; onAccent.ratio < 4.5 && guard < 30; guard++) {
      const hsl = rgbToHsl(hexToRgb(fill));
      const dir = onAccent.color === TEXT_LIGHT ? -0.02 : 0.02;
      fill = withLightness(fill, hsl.l + dir);
      onAccent = pickOnAccent(fill);
    }

    const redText = adjustForContrast(primary, PANEL_2, 4.5);
    const redOnLight = adjustForContrast(primary, "#ffffff", 4.5);
    const fillDeep = withLightness(fill, rgbToHsl(hexToRgb(fill)).l - 0.14);
    const secondary = adjustForContrast(secondaryRaw, PANEL_2, 3.0);

    return {
      "--red": red,
      "--red-text": redText,
      "--red-fill": fill,
      "--red-fill-deep": fillDeep,
      "--red-on-light": redOnLight,
      "--red-soft": rgbaFromHex(red, 0.14),
      "--red-soft-strong": rgbaFromHex(red, 0.28),
      "--on-accent": onAccent.color,
      "--mantova-gold": secondary
    };
  }

  const root = document.documentElement;
  function applyTokens(tokens) {
    Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(name, value));
  }
  function applyPalette(primary, secondary) {
    applyTokens(buildTokens(primary, secondary));
  }
  function applyNeutral() {
    applyPalette(NEUTRAL.primary, NEUTRAL.secondary);
  }

  // --- Cache locale per-account -------------------------------------------
  // Una voce per account (mai globale): due account sullo stesso
  // dispositivo non si vedono mai i colori a vicenda. "active account" è un
  // puntatore separato, cancellato al logout, che permette una riapertura
  // istantanea (stessa sessione valida) senza mostrare per un istante il
  // tema neutro prima della fetch di rete.
  const ACTIVE_KEY = "gk_theme_active_account";
  function cacheKey(accountId) { return `gk_theme_${accountId}`; }

  function readCache(accountId) {
    if (!accountId) return null;
    try {
      const raw = localStorage.getItem(cacheKey(accountId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
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

  // Preferenza salvata (da /api/club-preference) -> {primary, secondary} o
  // null (tema neutro). useCustomColors ha sempre priorità quando presente
  // e valido: sono i colori scelti dal cliente, anche sopra un club del
  // catalogo.
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
    if (palette) applyPalette(palette.primary, palette.secondary);
    else applyNeutral();
  }

  // Applicazione immediata (sincrona, prima di qualunque fetch) dell'ultimo
  // tema noto per l'account ancora "attivo" secondo il dispositivo: non
  // significa sessione valida, solo "ultima volta usata da qui". loadData()
  // in cloudflare-client.js la riconcilia subito dopo con la risposta reale
  // del server, quindi un'ipotesi sbagliata dura al più un frame.
  (function bootstrap() {
    const activeId = getActiveAccount();
    const cached = activeId ? readCache(activeId) : null;
    if (cached) applyPreference(cached);
    else applyNeutral();
  })();

  window.gkTheme = {
    NEUTRAL,
    buildTokens,
    applyPalette,
    applyNeutral,
    applyPreference,
    // Idratazione immediata SOLO da cache locale (nessuna scrittura): usata
    // da loadData() appena /api/me risponde, prima ancora di sapere se
    // questo account ha una preferenza sul server. Se non c'è cache, applica
    // il tema neutro (mai quello di un account precedente).
    hydrateAccount(accountId) {
      setActiveAccount(accountId);
      const cached = readCache(accountId);
      applyPreference(cached);
    },
    // Applica + salva in cache per l'account indicato, con la preferenza
    // AUTORITATIVA appena arrivata dal server (dopo un salvataggio riuscito
    // su /api/club-preference, o dopo la GET in loadData()).
    setForAccount(accountId, pref) {
      setActiveAccount(accountId);
      writeCache(accountId, pref || null);
      applyPreference(pref);
    },
    // Solo reset visivo (usato al logout / sessione scaduta): NON cancella
    // la cache dell'account, così la stessa persona la ritrova intatta al
    // login successivo. Cancella solo il puntatore "attivo", così l'auth
    // screen resta neutro finché non c'è un login riuscito.
    resetVisual() {
      setActiveAccount(null);
      applyNeutral();
    },
    contrastRatio
  };
})();
