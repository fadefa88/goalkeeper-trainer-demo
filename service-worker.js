const CACHE_NAME = "gk-trainer-figc-v6-clean-auth-copy";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg"
];

const AUTH_PATCH = `
<script data-gk-signup-fix="v6">
(() => {
  const SUPABASE_URL = "https://tjkwnhbqwvsxjfkycztn.supabase.co";
  const SUPABASE_KEY = "sb_publishable_2Kd0YDECk8IuaGwKjf3KVw_YqZKvFOl";
  const $ = (id) => document.getElementById(id);
  const setStatus = (msg) => { const el = $("authStatus"); if (el) el.textContent = msg || ""; };

  function cleanAuthCopy() {
    const authCard = document.querySelector("#authView .auth-card");
    if (!authCard) return;
    const removableTexts = [
      "Cloud Supabase",
      "Accedi per usare l'app",
      "Modalità cloud-only: profilo, portieri, calendario e sessioni vengono salvati su Supabase."
    ];
    authCard.querySelectorAll("p, h2").forEach((el) => {
      if (removableTexts.includes((el.textContent || "").trim())) el.remove();
    });
  }

  async function fixedSignUp(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }

    const email = ($("authEmail")?.value || "").trim().toLowerCase();
    const password = $("authPassword")?.value || "";

    if (!email || !email.includes("@")) {
      setStatus("Inserisci una email valida.");
      return;
    }

    if (!password || password.length < 6) {
      setStatus("Inserisci una password di almeno 6 caratteri.");
      return;
    }

    if (!window.supabase) {
      setStatus("Supabase non è ancora caricato. Riprova tra un secondo.");
      return;
    }

    setStatus("Creazione account email/password...");
    const client = window.__gkSignupClient || (window.__gkSignupClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY));
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.href.split("#")[0] }
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Account creato. Se arriva una mail Supabase, confermala; poi fai Login.");
  }

  function patchSignupButton() {
    const oldButton = $("signupBtn");
    if (!oldButton || oldButton.dataset.gkSignupFixed === "true") return;

    const newButton = oldButton.cloneNode(true);
    newButton.dataset.gkSignupFixed = "true";
    oldButton.replaceWith(newButton);
    newButton.addEventListener("click", fixedSignUp, true);
  }

  document.addEventListener("DOMContentLoaded", () => {
    cleanAuthCopy();
    patchSignupButton();
    setTimeout(cleanAuthCopy, 250);
    setTimeout(patchSignupButton, 500);
    setTimeout(cleanAuthCopy, 1000);
    setTimeout(patchSignupButton, 1500);
  });
})();
</script>
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

function cleanAuthHtml(html) {
  return html
    .replace('<p class="eyebrow">Cloud Supabase</p>', '')
    .replace("<h2>Accedi per usare l'app</h2>", '')
    .replace('<p class="muted">Modalità cloud-only: profilo, portieri, calendario e sessioni vengono salvati su Supabase.</p>', '');
}

async function patchedIndexResponse(request) {
  try {
    const networkResponse = await fetch(request);
    const html = await networkResponse.text();
    const cleanedHtml = cleanAuthHtml(html);
    const patchedHtml = cleanedHtml.includes('data-gk-signup-fix="v6"')
      ? cleanedHtml
      : cleanedHtml.replace("</body>", `${AUTH_PATCH}</body>`);

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, new Response(patchedHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    }));

    return new Response(patchedHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } catch (_error) {
    const cached = await caches.match(request);
    if (cached) {
      const html = await cached.text();
      return new Response(cleanAuthHtml(html), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    return caches.match("./index.html");
  }
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";
  const isIndex = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");

  if (isNavigation || isIndex) {
    event.respondWith(patchedIndexResponse(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
