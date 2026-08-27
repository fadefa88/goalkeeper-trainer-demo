const CACHE_NAME = "gk-trainer-cloudflare-d1-exercise-visuals-org-rules-v1";
const ASSETS = ["./","./index.html","./privacy.html","./support.html","./style.css","./app.js","./cloudflare-client.js","./manifest.json","./icon.svg"];

const EXERCISE_VISUAL_PATCH = String.raw`
;(() => {
  const ORGANIZATION_RULE_VISUALS = {
    "portiere-prese-contatti": { type: "prese", title: "6 porte, conduzione e cambio ruolo", steps: ["6 portieri difendono 6 porticine", "6 giocatori conducono palla e provano l'ingresso frontale", "Se il portiere prende con le mani, cambia ruolo con chi attacca"] },
    "re-dei-portieri": { type: "re", title: "Tiro, parata/gol e rotazione immediata", steps: ["4 giocatori davanti alla porta, 3 con palla", "L'attaccante tira", "Gol: entra in porta. Errore: recupera e passa al compagno"] },
    "conduzione-palla-uscita-bassa": { type: "quadrato", title: "Quadrato 5x5 e uscita bassa", steps: ["Tutti nel quadrato, tutti con palla tranne P1", "I compagni conducono palla", "P1 attacca in tuffo basso e respinge fuori"] },
    "lancio-presa-palla": { type: "triangolo", title: "Lancio, presa e laterale libero", steps: ["4 portieri in triangolo/allineamento con 2 palloni", "P1 lancia a P2, P2 prende", "P2 serve il laterale libero, che restituisce a P1"] },
    "uscita-bassa-cross-laterale": { type: "cross", title: "Dal palo al cross laterale", steps: ["Il portiere parte all'altezza del palo", "La palla arriva lateralmente davanti alla porta", "Uscita bassa in tuffo e presa"] },
    "attacchi-a-scelta": { type: "scelta", title: "Due attacchi e corridoio centrale", steps: ["Campo diviso con corridoio centrale", "Gli attaccanti scelgono quanti giocatori mandare nei due attacchi", "Chi difende, se recupera, cerca meta nel corridoio"] },
    "passo-lungo-passo-corto": { type: "lungocorto", title: "Lungo, corto, corto, lungo", steps: ["Tre giocatori sulle linee con un pallone", "A gioca lungo a B e corre incontro", "B scarica, A restituisce, B apre lungo a C"] },
    "finalizzazioni-marcatura-individuale": { type: "marcatura", title: "Palla inattiva e 2 contro 2", steps: ["Due settori autonomi con portiere, difendente e attaccante", "Si parte da punizione o rimessa laterale", "Il battitore entra e l'azione va a finalizzazione o blocco"] },
    "portieri-partite-aeree-estese": { type: "aree", title: "Metà difensiva con mani, metà offensiva normale", steps: ["Due squadre da 6 su campo 25x50", "Nella propria metà tutti possono prendere con le mani", "Massimo 6 secondi, poi gioco normale nella metà offensiva"] },
    "gioco-dentro-fuori": { type: "dentrofuori", title: "Possesso con ingressi e uscite", steps: ["4 per squadra dentro il quadrato e 2 ausili esterni", "La squadra in possesso usa gli esterni", "Se un esterno entra, un compagno esce subito"] }
  };

  function ensureExerciseVisualStyles() {
    if (document.getElementById("exerciseVisualStylesOrgRules")) return;
    const style = document.createElement("style");
    style.id = "exerciseVisualStylesOrgRules";
    style.textContent = "\n" +
      '      .exercise-visual-card{margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.045);overflow:hidden}\n' +
      '      .exercise-visual-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.exercise-visual-head h3{margin:0;font-size:17px}\n' +
      '      .exercise-visual-loop{border-radius:18px;overflow:hidden;border:1px solid rgba(213,255,222,.13);background:linear-gradient(180deg,rgba(32,224,108,.10),rgba(3,20,7,.72))}\n' +
      '      .exercise-visual-loop svg{display:block;width:100%;height:auto}.exercise-visual-legend{display:grid;gap:7px;margin-top:10px;color:var(--muted);font-size:12px;line-height:1.35}\n' +
      '      .exercise-visual-legend span{display:flex;gap:8px;align-items:flex-start}.exercise-visual-legend b{min-width:20px;color:#001b0a;background:var(--green);border-radius:999px;text-align:center;padding:2px 0;font-size:11px}\n' +
      '      .v-field{fill:rgba(32,224,108,.06);stroke:rgba(213,255,222,.22);stroke-width:2}.v-zone{fill:none;stroke:rgba(244,255,247,.55);stroke-width:2;stroke-dasharray:7 7}.v-goal{fill:none;stroke:rgba(244,255,247,.9);stroke-width:4;stroke-linecap:round}.v-corridor{fill:rgba(255,255,255,.055);stroke:rgba(255,255,255,.28);stroke-dasharray:7 7}.v-ball{fill:#ffd34d;stroke:#111;stroke-width:1.5}.v-keeper{fill:#111;stroke:#fff;stroke-width:2}.v-player{fill:#f4fff7;stroke:#111;stroke-width:2}.v-support{fill:#c9f7d5;stroke:#111;stroke-width:2}.v-attacker{fill:#f97316;stroke:#111;stroke-width:2}.v-pass{fill:none;stroke:#ffd34d;stroke-width:4;stroke-linecap:round;marker-end:url(#vArrow)}.v-run{fill:none;stroke:#7dd3fc;stroke-width:3.5;stroke-linecap:round;stroke-dasharray:8 7;marker-end:url(#vArrowBlue)}.v-text{fill:#dfffe7;font-size:11px;font-weight:800}.v-small{fill:rgba(244,255,247,.74);font-size:10px}\n' +
      '      .v-move-x{animation:vMoveX 2.8s ease-in-out infinite}.v-move-y{animation:vMoveY 2.8s ease-in-out infinite}.v-pulse{animation:vPulse 1.7s ease-in-out infinite}.v-ball-shot{animation:vBallShot 2.4s linear infinite}.v-ball-cross{animation:vBallCross 2.6s linear infinite}.v-ball-square{animation:vBallSquare 2.4s linear infinite}.v-ball-possession{animation:vBallPossession 4s linear infinite}\n' +
      '      @keyframes vMoveX{0%,100%{transform:translateX(0)}50%{transform:translateX(26px)}}@keyframes vMoveY{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}@keyframes vPulse{0%,100%{opacity:.45;transform:scale(.94)}50%{opacity:1;transform:scale(1.05)}}@keyframes vBallShot{0%{transform:translate(0,0)}75%{transform:translate(178px,0)}100%{transform:translate(0,0)}}@keyframes vBallCross{0%{transform:translate(0,0)}75%{transform:translate(164px,-28px)}100%{transform:translate(0,0)}}@keyframes vBallSquare{0%{transform:translate(0,0)}70%{transform:translate(-32px,-8px)}100%{transform:translate(0,0)}}@keyframes vBallPossession{0%{transform:translate(0,0)}25%{transform:translate(122px,0)}50%{transform:translate(0,0)}75%{transform:translate(-122px,0)}100%{transform:translate(0,0)}}\n' +
      '      @media(max-width:390px){.exercise-visual-head{display:grid}.exercise-visual-card{padding:12px}}\n';
    document.head.appendChild(style);
  }

  function person(cls,x,y,label,extra) { return '<g '+(extra||'')+'><circle class="'+cls+'" cx="'+x+'" cy="'+y+'" r="10"></circle><text class="v-small" x="'+x+'" y="'+(y+27)+'" text-anchor="middle">'+label+'</text></g>'; }
  function ball(x,y,cls) { return '<circle class="v-ball '+(cls||'')+'" cx="'+x+'" cy="'+y+'" r="5"></circle>'; }
  function shell(inner) { return '<svg viewBox="0 0 360 210" role="img" aria-label="Visual esercizio portiere"><defs><marker id="vArrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L8,3 z" fill="#ffd34d"/></marker><marker id="vArrowBlue" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L8,3 z" fill="#7dd3fc"/></marker></defs><rect x="10" y="10" width="340" height="190" rx="18" class="v-field"></rect>'+inner+'</svg>'; }

  function svgFor(type) {
    if (type === "prese") return shell('<g opacity=".55"><path class="v-goal" d="M38 42h28M38 105h28M38 168h28M292 42h28M292 105h28M292 168h28"></path></g>'+person('v-keeper',84,105,'P')+person('v-attacker',216,105,'A','class="v-move-x"')+ball(204,105,'v-move-x')+'<path class="v-run" d="M216 105 C178 104 134 105 94 105"></path><path class="v-pass" d="M204 105 C168 105 124 105 92 105"></path><text class="v-text" x="68" y="28">6 porticine: ingresso frontale e cambio ruolo su presa</text>');
    if (type === "re") return shell('<path class="v-goal" d="M292 78V132M292 78H326M292 132H326"></path>'+person('v-keeper',278,105,'P','class="v-move-y"')+person('v-attacker',92,105,'T')+person('v-attacker',54,76,'fila')+person('v-attacker',54,134,'fila')+ball(98,105,'v-ball-shot')+'<path class="v-pass" d="M104 105 H266"></path><path class="v-run" d="M110 78 C162 48 240 54 278 86"></path><text class="v-text" x="38" y="28">Tiro continuo: gol = cambio portiere, errore = passa al compagno</text>');
    if (type === "quadrato") return shell('<rect class="v-zone" x="88" y="42" width="184" height="126" rx="8"></rect>'+person('v-player',136,78,'C')+ball(148,78,'')+person('v-player',236,82,'C')+ball(248,82,'')+person('v-player',242,146,'C')+person('v-keeper',198,126,'P1','class="v-move-x"')+ball(242,146,'v-ball-square')+'<path class="v-run" d="M198 126 Q222 140 238 146"></path><text class="v-text" x="96" y="28">Quadrato 5x5: P1 senza palla elimina i palloni</text>');
    if (type === "triangolo") return shell(person('v-keeper',78,145,'P1')+person('v-keeper',178,58,'P2')+person('v-support',282,145,'laterale')+person('v-keeper',178,175,'P4')+'<path class="v-pass" d="M88 140 L170 66 L272 140"></path><path class="v-pass" d="M272 150 L90 150"></path>'+ball(84,140,'v-ball-possession')+'<text class="v-text" x="46" y="28">P1 lancia, P2 prende, serve il laterale libero</text><text class="v-small" x="120" y="202">2 palloni e rotazione ogni 1-2 minuti</text>');
    if (type === "cross") return shell('<path class="v-goal" d="M286 72V146M286 72H326M286 146H326"></path>'+person('v-keeper',286,105,'P','class="v-move-x"')+person('v-player',82,162,'S')+ball(94,158,'v-ball-cross')+'<path class="v-pass" d="M96 158 C158 146 220 134 274 124"></path><path class="v-run" d="M286 105 Q276 116 260 126"></path><text class="v-text" x="28" y="28">Partenza al palo, palla laterale davanti alla porta</text>');
    if (type === "scelta") return shell('<rect class="v-corridor" x="166" y="10" width="28" height="190"></rect><path class="v-goal" d="M30 82V128M30 82H54M30 128H54"></path><path class="v-goal" d="M330 82V128M330 82H306M330 128H306"></path>'+person('v-attacker',102,78,'A')+person('v-attacker',126,120,'A')+person('v-attacker',100,158,'A')+person('v-keeper',66,105,'P')+person('v-attacker',252,90,'A')+person('v-attacker',276,138,'A')+person('v-keeper',300,105,'P')+'<path class="v-pass" d="M126 120 L60 105"></path><path class="v-run" d="M300 105 L184 105"></path><text class="v-text" x="32" y="28">Due attacchi paralleli e meta nel corridoio se si recupera</text>');
    if (type === "lungocorto") return shell(person('v-player',64,126,'A')+person('v-player',180,74,'B')+person('v-player',300,126,'C')+'<path class="v-pass" d="M74 120 L170 80"></path><path class="v-pass" d="M172 88 L94 118"></path><path class="v-pass" d="M94 134 L172 90"></path><path class="v-pass" d="M190 80 L290 120"></path><path class="v-run" d="M64 126 C94 92 132 78 170 76"></path>'+ball(74,120,'v-ball-possession')+'<text class="v-text" x="74" y="28">Lungo → scarico corto → restituzione → lungo a C</text>');
    if (type === "marcatura") return shell('<rect class="v-zone" x="24" y="34" width="146" height="144" rx="12"></rect><rect class="v-zone" x="196" y="34" width="146" height="144" rx="12"></rect><path class="v-goal" d="M142 86V126M142 86H160M142 126H160"></path><path class="v-goal" d="M314 86V126M314 86H332M314 126H332"></path>'+person('v-support',58,104,'B')+person('v-player',92,104,'D')+person('v-attacker',110,82,'A')+person('v-keeper',128,132,'P')+person('v-support',230,104,'B','class="v-pulse"')+person('v-player',264,104,'D','class="v-pulse"')+person('v-attacker',282,82,'A','class="v-pulse"')+person('v-keeper',300,132,'P','class="v-pulse"')+ball(58,104,'v-ball-shot')+'<path class="v-pass" d="M64 104 H104"></path><path class="v-run" d="M58 104 Q92 132 136 120"></path><text class="v-text" x="30" y="26">Palla inattiva: battitore entra e crea 2v2</text>');
    if (type === "aree") return shell('<line x1="180" y1="10" x2="180" y2="200" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-dasharray="8 8"></line><path class="v-goal" d="M28 82V128M28 82H52M28 128H52"></path><path class="v-goal" d="M332 82V128M332 82H308M332 128H308"></path>'+person('v-player',92,110,'mani','class="v-pulse"')+ball(92,110,'')+person('v-attacker',248,110,'piedi')+'<rect x="58" y="134" width="92" height="24" rx="12" fill="rgba(0,0,0,.35)"></rect><text class="v-small" x="75" y="150">max 6 secondi</text><text class="v-text" x="36" y="28">Metà difensiva con mani, metà offensiva con regole normali</text>');
    if (type === "dentrofuori") return shell('<rect class="v-zone" x="88" y="42" width="184" height="126" rx="10"></rect>'+person('v-player',126,76,'I')+person('v-player',180,76,'I')+person('v-player',232,76,'I')+person('v-player',152,146,'I')+person('v-player',208,146,'I')+person('v-support',58,106,'E')+person('v-support',302,106,'E')+ball(180,106,'v-ball-possession')+'<path class="v-pass" d="M180 106 H294"></path><path class="v-run" d="M302 106 Q264 130 226 148"></path><path class="v-run" d="M208 146 Q254 184 302 112"></path><text class="v-text" x="44" y="28">Esterno entra, un compagno esce subito: possesso continuo</text>');
    return shell('');
  }

  function exerciseVisualHtml(ex) {
    const visual = ORGANIZATION_RULE_VISUALS[ex.id];
    if (!visual) return '';
    return '<div class="exercise-visual-card"><div class="exercise-visual-head"><div><p class="eyebrow">Visual esercizio</p><h3>' + escapeHtml(visual.title) + '</h3></div><span class="pill">organizzazione + regole</span></div><div class="exercise-visual-loop">' + svgFor(visual.type) + '</div><div class="exercise-visual-legend">' + visual.steps.map(function(step, index) { return '<span><b>' + (index + 1) + '</b>' + escapeHtml(step) + '</span>'; }).join('') + '</div></div>';
  }

  const baseRenderDetail = typeof renderDetail === 'function' ? renderDetail : null;
  renderDetail = function() {
    const ex = selectedExercise;
    if (!ex || !ORGANIZATION_RULE_VISUALS[ex.id]) {
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
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.endsWith("/cloudflare-client.js")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).then(async response => {
      const source = await response.text();
      const patched = source.includes("ORGANIZATION_RULE_VISUALS") ? source : `${source}\n${EXERCISE_VISUAL_PATCH}`;
      return new Response(patched, { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" } });
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});