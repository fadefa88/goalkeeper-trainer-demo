const CACHE_NAME = "gk-trainer-calendar-behavior-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./support.html",
  "./style.css",
  "./app.js",
  "./cloudflare-client.js",
  "./calendar-keepers.js",
  "./manifest.json",
  "./icon.svg",
  "./gk-home-hero.png"
];

const CALENDAR_BEHAVIOR_PATCH = String.raw`
<style id="gkCalendarBehaviorStyleV1">
  #calendarView, #calendarView * { scroll-margin-top: 96px; }
  #calendarView .planner-card,
  #calendarView .planner-item,
  #calendarView .planner-actions,
  #calendarView .planner-summary,
  #calendarView .planner-save-row,
  #selectedDateSessions {
    overflow-anchor: none !important;
    transition: none !important;
    animation: none !important;
  }
  #saveCalendarPlanBtn {
    position: relative !important;
    min-height: 58px !important;
    overflow: hidden !important;
    transition: transform .14s ease, box-shadow .18s ease, filter .18s ease !important;
  }
  #saveCalendarPlanBtn.gk-saving {
    filter: brightness(1.12) saturate(1.08) !important;
    transform: scale(.985) !important;
    box-shadow: 0 0 0 5px rgba(32,224,108,.14), 0 14px 34px rgba(32,224,108,.24) !important;
  }
  #saveCalendarPlanBtn.gk-saved {
    filter: brightness(1.18) saturate(1.12) !important;
    box-shadow: 0 0 0 6px rgba(32,224,108,.18), 0 18px 40px rgba(32,224,108,.28) !important;
  }
  #saveCalendarPlanBtn.gk-saving::after,
  #saveCalendarPlanBtn.gk-saved::after {
    content: "";
    position: absolute;
    inset: -45% auto -45% -40%;
    width: 36%;
    transform: skewX(-18deg) translateX(-140%);
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.48), transparent);
    animation: gkSaveSweep .75s ease forwards;
    pointer-events: none;
  }
  #calendarSaveStatus.gk-visible {
    display: block !important;
    min-height: 44px !important;
    margin-top: 8px !important;
    padding: 12px 13px !important;
    border-radius: 16px !important;
    color: #d9ffe2 !important;
    background: rgba(32,224,108,.10) !important;
    border: 1px solid rgba(32,224,108,.28) !important;
    font-weight: 850 !important;
    line-height: 1.35 !important;
  }
  @keyframes gkSaveSweep {
    0% { transform: skewX(-18deg) translateX(-140%); opacity: 0; }
    18% { opacity: 1; }
    100% { transform: skewX(-18deg) translateX(520%); opacity: 0; }
  }
</style>
<script id="gkCalendarBehaviorScriptV1">
(() => {
  if (window.__gkCalendarBehaviorV1) return;
  window.__gkCalendarBehaviorV1 = true;

  const actionSelector = '#addPlanExerciseBtn,#autoPlanBtn,#clearPlanBtn,[data-plan-remove]';
  const saveSelector = '#saveCalendarPlanBtn';
  let restoreUntil = 0;
  let lockedX = 0;
  let lockedY = 0;

  function calendarActive() {
    const view = document.getElementById('calendarView');
    return Boolean(view && view.classList.contains('active'));
  }

  function restoreScroll() {
    if (!calendarActive()) return;
    window.scrollTo(lockedX, lockedY);
  }

  function lockScroll(duration = 900) {
    if (!calendarActive()) return;
    lockedX = window.scrollX || 0;
    lockedY = window.scrollY || 0;
    restoreUntil = Date.now() + duration;
    try { history.scrollRestoration = 'manual'; } catch {}
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    [0, 16, 40, 90, 160, 280, 430, 650, 900].forEach((delay) => setTimeout(restoreScroll, delay));
    requestAnimationFrame(restoreScroll);
    setTimeout(() => { root.style.scrollBehavior = previousBehavior || ''; }, duration + 60);
  }

  function forceOngoingScrollLock() {
    if (Date.now() <= restoreUntil) restoreScroll();
  }

  window.addEventListener('scroll', () => {
    if (Date.now() <= restoreUntil) requestAnimationFrame(restoreScroll);
  }, { passive: true });

  function setSaveUi(state, text) {
    const btn = document.getElementById('saveCalendarPlanBtn');
    const status = document.getElementById('calendarSaveStatus');
    if (btn) {
      btn.classList.remove('gk-saving', 'gk-saved');
      if (state) btn.classList.add(state);
      btn.textContent = text || 'Salva allenamento';
      btn.setAttribute('aria-live', 'polite');
    }
    if (status) {
      status.classList.add('gk-visible');
      if (text) status.textContent = text;
    }
  }

  function markSaving() {
    lockScroll(1200);
    setSaveUi('gk-saving', 'Salvataggio...');
  }

  function observeSaveStatus() {
    const status = document.getElementById('calendarSaveStatus');
    if (!status || status.dataset.gkObserved === '1') return;
    status.dataset.gkObserved = '1';
    const observer = new MutationObserver(() => {
      const text = String(status.textContent || '').trim();
      if (!text) return;
      status.classList.add('gk-visible');
      const lower = text.toLowerCase();
      const btn = document.getElementById('saveCalendarPlanBtn');
      if (!btn) return;
      if (lower.includes('salvato') || lower.includes('disponibili') || lower.includes('account')) {
        btn.classList.remove('gk-saving');
        btn.classList.add('gk-saved');
        btn.textContent = 'Salvato ✓';
        setTimeout(() => {
          btn.classList.remove('gk-saved');
          btn.textContent = 'Salva allenamento';
        }, 1500);
      } else if (lower.includes('aggiungi') || lower.includes('errore') || lower.includes('cloud')) {
        btn.classList.remove('gk-saving', 'gk-saved');
        btn.textContent = lower.includes('errore') || lower.includes('cloud') ? 'Errore' : 'Da completare';
        setTimeout(() => { btn.textContent = 'Salva allenamento'; }, 1500);
      }
    });
    observer.observe(status, { childList: true, subtree: true, characterData: true });
  }

  function boot() {
    observeSaveStatus();
    forceOngoingScrollLock();
  }

  window.addEventListener('click', (event) => {
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    if (!target || !calendarActive()) return;
    if (target.closest(saveSelector)) {
      markSaving();
      setTimeout(observeSaveStatus, 30);
      setTimeout(() => {
        const btn = document.getElementById('saveCalendarPlanBtn');
        if (btn && btn.classList.contains('gk-saving')) setSaveUi('gk-saving', 'Salvataggio...');
      }, 260);
      return;
    }
    if (target.closest(actionSelector)) {
      lockScroll(1000);
      setTimeout(boot, 80);
      setTimeout(boot, 260);
      setTimeout(boot, 620);
    }
  }, true);

  window.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || !calendarActive()) return;
    if (target.matches?.('#dayPlanTime,#dayPlanTotal,.plan-item-minutes,select,input')) {
      lockScroll(700);
    }
  }, true);

  const observer = new MutationObserver(() => {
    if (!calendarActive()) return;
    observeSaveStatus();
    forceOngoingScrollLock();
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  [120, 400, 900, 1800].forEach((delay) => setTimeout(boot, delay));
})();
</script>`;

function patchHtml(source) {
  if (source.includes('gkCalendarBehaviorScriptV1')) return source;
  let html = source
    .replaceAll('account-source-v3', 'calendar-behavior-v1')
    .replaceAll('calendar-polish-v1', 'calendar-behavior-v1');
  return html.includes('</body>') ? html.replace('</body>', `${CALENDAR_BEHAVIOR_PATCH}\n</body>`) : `${html}\n${CALENDAR_BEHAVIOR_PATCH}`;
}

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  const isHtml = event.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html");
  const isFresh = isHtml ||
    url.pathname.endsWith("/style.css") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/cloudflare-client.js") ||
    url.pathname.endsWith("/calendar-keepers.js");

  if (isHtml) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match(event.request))
        .then(async response => {
          if (!response) return response;
          const html = await response.text();
          return new Response(patchHtml(html), {
            status: response.status,
            statusText: response.statusText,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        })
    );
    return;
  }

  if (isFresh) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});