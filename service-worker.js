const CACHE_NAME = "gk-trainer-cloudflare-d1-exercise-visuals-live-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./support.html",
  "./style.css",
  "./app.js",
  "./cloudflare-client.js",
  "./manifest.json",
  "./icon.svg"
];

const EXERCISE_VISUAL_PATCH = String.raw`
;(() => {
  const FIRST_VISUALS = {
    "portiere-prese-contatti": { type: "multi", title: "6 porte, conduzione e presa", steps: ["Giocatori in conduzione", "Entrata frontale nelle porticine", "Presa/intervento e cambio ruolo"] },
    "re-dei-portieri": { type: "shot", title: "Tiro continuo e rotazione", steps: ["Tiro in porta", "Parata o gol", "Rotazione rapida"] },
    "conduzione-palla-uscita-bassa": { type: "square", title: "Quadrato, conduzione e uscita bassa", steps: ["Compagni in conduzione", "Portiere attacca la palla", "Presa/respinta fuori dal campo"] },
    "lancio-presa-palla": { type: "triangle", title: "Triangolo, lancio e presa", steps: ["Lancio verso il compagno", "Presa", "Trasmissione al laterale libero"] },
    "uscita-bassa-cross-laterale": { type: "cross", title: "Cross laterale e presa in tuffo", steps: ["Palla laterale", "Lettura della traiettoria", "Uscita bassa in presa"] },
    "attacchi-a-scelta": { type: "two-zones", title: "Due attacchi contemporanei", steps: ["Scelta del numero di attaccanti", "Due situazioni parallele", "Portiere comunica e copre"] },
    "passo-lungo-passo-corto": { type: "long-short", title: "Passo lungo, scarico corto e rotazione", steps: ["Passaggio lungo", "Corsa incontro", "Doppio corto e cambio posto"] },
    "finalizzazioni-marcatura-individuale": { type: "set-piece", title: "Palla inattiva e 2 contro 2", steps: ["Punizione/rimessa", "Inserimento del battitore", "Finalizzazione o blocco"] },
    "portieri-partite-aeree-estese": { type: "extended", title: "Metà campo: tutti possono fare il portiere", steps: ["Palla nella propria metà", "Intercetto con le mani", "Ripartenza rapida"] },
    "gioco-dentro-fuori": { type: "inside-outside", title: "Possesso dentro/fuori", steps: ["Possesso nel quadrato", "Appoggio esterno", "Ingresso/uscita e sostituzione"] }
  };

  function ensureExerciseVisualStyles() {
    if (document.getElementById("exerciseVisualStyles")) return;
    const style = document.createElement("style");
    style.id = "exerciseVisualStyles";
    style.textContent = `
      .exercise-visual-card{margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.045);overflow:hidden}
      .exercise-visual-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      .exercise-visual-head h3{margin:0;font-size:17px}.exercise-visual-loop{border-radius:18px;overflow:hidden;border:1px solid rgba(213,255,222,.13);background:linear-gradient(180deg,rgba(32,224,108,.10),rgba(3,20,7,.72))}
      .exercise-visual-loop svg{display:block;width:100%;height:auto}.exercise-visual-legend{display:grid;gap:7px;margin-top:10px;color:var(--muted);font-size:12px;line-height:1.35}
      .exercise-visual-legend span{display:flex;gap:8px;align-items:flex-start}.exercise-visual-legend b{min-width:20px;color:#001b0a;background:var(--green);border-radius:999px;text-align:center;padding:2px 0;font-size:11px}
      .visual-player{fill:#f4fff7}.visual-keeper{fill:#20e06c}.visual-opponent{fill:#f97316}.visual-ball{fill:#fff}.visual-line{stroke:rgba(244,255,247,.72);stroke-width:2;fill:none;stroke-linecap:round;stroke-dasharray:7 7}.visual-arrow{stroke:#20e06c;stroke-width:3;fill:none;stroke-linecap:round;stroke-dasharray:9 8}.visual-zone{fill:rgba(32,224,108,.06);stroke:rgba(213,255,222,.22);stroke-width:2}.visual-goal{fill:none;stroke:rgba(244,255,247,.82);stroke-width:4;stroke-linecap:round}
      .anim-ball-a{animation:visualBallA 3.2s linear infinite}.anim-ball-b{animation:visualBallB 3.2s linear infinite}.anim-ball-c{animation:visualBallC 3.2s linear infinite}.anim-keeper{animation:visualKeeper 3.2s ease-in-out infinite;transform-origin:center}.anim-player{animation:visualPlayer 3.2s ease-in-out infinite;transform-origin:center}.anim-pulse{animation:visualPulse 1.6s ease-in-out infinite;transform-origin:center}
      @keyframes visualBallA{0%{transform:translate(0,0);opacity:1}45%{transform:translate(110px,-34px);opacity:1}70%{transform:translate(160px,-8px);opacity:1}100%{transform:translate(0,0);opacity:1}}
      @keyframes visualBallB{0%{transform:translate(0,0)}45%{transform:translate(-96px,44px)}70%{transform:translate(-138px,2px)}100%{transform:translate(0,0)}}
      @keyframes visualBallC{0%{transform:translate(0,0)}35%{transform:translate(70px,-70px)}70%{transform:translate(142px,0)}100%{transform:translate(0,0)}}
      @keyframes visualKeeper{0%,100%{transform:translate(0,0) rotate(0deg)}45%{transform:translate(34px,-14px) rotate(-18deg)}70%{transform:translate(-28px,12px) rotate(16deg)}}
      @keyframes visualPlayer{0%,100%{transform:translate(0,0)}50%{transform:translate(38px,-22px)}}@keyframes visualPulse{0%,100%{opacity:.35;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}
      @media(max-width:390px){.exercise-visual-head{display:grid}.exercise-visual-card{padding:12px}}
    `;
    document.head.appendChild(style);
  }

  function dot(cls, x, y, label) {
    return '<g><circle class="' + cls + '" cx="' + x + '" cy="' + y + '" r="10"></circle><text x="' + x + '" y="' + (y + 28) + '" text-anchor="middle" fill="rgba(244,255,247,.72)" font-size="11" font-weight="800">' + label + '</text></g>';
  }

  function svgFor(type) {
    const start = '<svg viewBox="0 0 360 210" role="img" aria-label="Animazione esercizio portiere"><rect x="10" y="10" width="340" height="190" rx="18" class="visual-zone"></rect>';
    const end = '</svg>';
    const goalLeft = '<path class="visual-goal" d="M28 78V132M28 78H54M28 132H54"></path>';
    const goalRight = '<path class="visual-goal" d="M332 78V132M332 78H306M332 132H306"></path>';
    if (type === "multi") return start + '<path class="visual-goal" d="M40 45h26M40 105h26M40 165h26M294 45h26M294 105h26M294 165h26"></path>' + dot('visual-keeper anim-keeper',85,105,'P') + dot('visual-opponent anim-player',210,132,'G') + '<path class="visual-arrow" d="M210 132 C170 126 140 116 96 106"></path><circle class="visual-ball anim-ball-b" cx="205" cy="126" r="6"></circle>' + end;
    if (type === "shot") return start + goalLeft + dot('visual-keeper anim-keeper',70,105,'P') + dot('visual-opponent',240,105,'T') + '<path class="visual-arrow" d="M232 104 C172 92 116 93 78 105"></path><circle class="visual-ball anim-ball-b" cx="224" cy="102" r="6"></circle><path class="visual-line" d="M245 135 C210 164 155 164 116 137"></path>' + end;
    if (type === "square") return start + '<rect x="84" y="44" width="190" height="122" rx="8" class="visual-line"></rect>' + dot('visual-keeper anim-keeper',178,105,'P') + dot('visual-opponent anim-player',255,146,'C') + '<path class="visual-arrow" d="M252 144 C218 132 205 116 184 105"></path><circle class="visual-ball anim-ball-b" cx="248" cy="140" r="6"></circle>' + end;
    if (type === "triangle") return start + dot('visual-keeper',95,150,'P1') + dot('visual-keeper',180,58,'P2') + dot('visual-keeper',265,150,'P3') + '<path class="visual-arrow" d="M102 143 L172 66 L256 143 L112 150"></path><circle class="visual-ball anim-ball-c" cx="104" cy="143" r="6"></circle><circle class="visual-ball anim-ball-a" cx="178" cy="63" r="5"></circle>' + end;
    if (type === "cross") return start + goalLeft + dot('visual-keeper anim-keeper',70,105,'P') + dot('visual-opponent',274,164,'S') + '<path class="visual-arrow" d="M270 160 C210 136 144 126 76 107"></path><circle class="visual-ball anim-ball-b" cx="260" cy="154" r="6"></circle>' + end;
    if (type === "two-zones") return start + '<line x1="180" y1="22" x2="180" y2="188" class="visual-line"></line>' + goalLeft + goalRight + dot('visual-keeper anim-keeper',62,105,'P') + dot('visual-keeper anim-keeper',298,105,'P') + dot('visual-opponent anim-player',130,76,'A') + dot('visual-opponent anim-player',230,136,'A') + '<path class="visual-arrow" d="M130 78 L75 103M230 136 L294 106"></path><circle class="visual-ball anim-ball-b" cx="128" cy="75" r="5"></circle><circle class="visual-ball anim-ball-a" cx="228" cy="134" r="5"></circle>' + end;
    if (type === "long-short") return start + dot('visual-player',70,150,'A') + dot('visual-player anim-player',180,72,'B') + dot('visual-player',290,150,'C') + '<path class="visual-arrow" d="M78 144 L172 78M178 82 L122 128M126 134 L178 90M188 78 L282 144"></path><circle class="visual-ball anim-ball-c" cx="78" cy="144" r="6"></circle>' + end;
    if (type === "set-piece") return start + goalLeft + dot('visual-keeper anim-keeper',66,105,'P') + dot('visual-player',138,112,'D') + dot('visual-opponent anim-player',212,98,'A') + dot('visual-opponent',272,150,'B') + '<path class="visual-arrow" d="M272 148 C232 130 196 112 152 108"></path><circle class="visual-ball anim-ball-b" cx="266" cy="146" r="6"></circle>' + end;
    if (type === "extended") return start + '<line x1="180" y1="20" x2="180" y2="190" class="visual-line"></line>' + goalLeft + goalRight + dot('visual-keeper anim-pulse',80,105,'M') + dot('visual-player',132,70,'C') + dot('visual-opponent anim-player',225,132,'A') + '<path class="visual-arrow" d="M225 132 C190 124 145 110 86 106"></path><circle class="visual-ball anim-ball-b" cx="220" cy="128" r="6"></circle>' + end;
    if (type === "inside-outside") return start + '<rect x="92" y="42" width="176" height="126" rx="8" class="visual-line"></rect>' + dot('visual-player anim-player',135,100,'I') + dot('visual-player',225,112,'I') + dot('visual-keeper',180,28,'E') + dot('visual-keeper',180,184,'E') + '<path class="visual-arrow" d="M137 100 L180 38 L224 112 L184 176"></path><circle class="visual-ball anim-ball-c" cx="137" cy="100" r="6"></circle>' + end;
    return start + goalLeft + dot('visual-keeper anim-keeper',70,105,'P') + dot('visual-opponent anim-player',246,105,'A') + '<path class="visual-arrow" d="M246 105 C180 95 120 100 75 105"></path><circle class="visual-ball anim-ball-b" cx="238" cy="102" r="6"></circle>' + end;
  }

  function exerciseVisualHtml(ex) {
    const visual = FIRST_VISUALS[ex.id];
    if (!visual) return '';
    return '<div class="exercise-visual-card"><div class="exercise-visual-head"><div><p class="eyebrow">Video stilizzato</p><h3>' + escapeHtml(visual.title) + '</h3></div><span class="pill">loop leggero</span></div><div class="exercise-visual-loop">' + svgFor(visual.type) + '</div><div class="exercise-visual-legend">' + visual.steps.map(function(step, index) { return '<span><b>' + (index + 1) + '</b>' + escapeHtml(step) + '</span>'; }).join('') + '</div></div>';
  }

  const baseRenderDetail = typeof renderDetail === 'function' ? renderDetail : null;
  renderDetail = function() {
    const ex = selectedExercise;
    if (!ex || !FIRST_VISUALS[ex.id]) {
      if (baseRenderDetail) return baseRenderDetail();
      return;
    }
    ensureExerciseVisualStyles();
    $('exerciseDetail').innerHTML = '<div class="detail-card">' +
      '<p class="eyebrow">' + escapeHtml(ex.docCategory) + ' · pag. ' + ex.sourcePage + '</p>' +
      '<h2>' + escapeHtml(ex.name) + '</h2>' +
      '<p class="muted" style="margin-top:10px">' + escapeHtml(ex.description) + '</p>' +
      exerciseVisualHtml(ex) +
      '<div class="detail-grid"><div class="mini-metric"><strong>' + ex.durationMin + "'</strong><span>Durata</span></div><div class="mini-metric"><strong>" + escapeHtml(ex.ambito) + '</strong><span>Ambito</span></div><div class="mini-metric"><strong>' + escapeHtml(ex.mode) + '</strong><span>Modalità</span></div></div>' +
      '<div class="exercise-meta"><span class="pill">' + escapeHtml(ex.space) + '</span><span class="pill">' + escapeHtml(ex.players) + '</span><span class="pill">' + escapeHtml(ex.contenitore) + '</span></div>' +
      '<div class="detail-block"><h3>Organizzazione</h3><p class="muted">' + escapeHtml(ex.organization) + '</p></div>' +
      '<div class="detail-block"><h3>Regole operative</h3><div class="points">' + ex.rules.map(p => '<div class="point">' + escapeHtml(p) + '</div>').join('') + '</div></div>' +
      '<div class="detail-block"><h3>Punti per l’allenatore</h3><div class="points">' + ex.coachPoints.map(p => '<div class="point">' + escapeHtml(p) + '</div>').join('') + '</div></div>' +
      '<p class="source-note">Fonte: “Il portiere dentro il gioco - eserciziario attività giovanile”, pag. ' + ex.sourcePage + '.</p>' +
    '</div>';
  };
})();
`;

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
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.endsWith("/cloudflare-client.js")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(async response => {
          const source = await response.text();
          const patched = source.includes("FIRST_VISUALS") ? source : `${source}\n${EXERCISE_VISUAL_PATCH}`;
          return new Response(patched, {
            status: 200,
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
