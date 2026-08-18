# GK Trainer

PWA per allenamento portieri con frontend statico, API su Cloudflare Pages Functions e database Cloudflare D1.

## Stack produzione fase 1

- Frontend: Cloudflare Pages
- API: Pages Functions in `functions/api/*`
- Database: Cloudflare D1, binding `DB`
- Auth: email/password gestita lato Function, cookie HttpOnly `gk_session`
- Backup: export/import JSON dall'app

## File principali

- `index.html` UI
- `style.css` tema nero/verde
- `app.js` libreria esercizi e logica base PWA
- `cloudflare-client.js` client API cloud
- `functions/api/` endpoint API
- `cloudflare-d1-schema.sql` schema D1
- `service-worker.js` cache PWA

## Deploy su Cloudflare Pages

1. Crea un database D1, per esempio `gk-trainer-db`.
2. Esegui lo schema `cloudflare-d1-schema.sql` sul database D1.
3. Crea un progetto Cloudflare Pages collegato a questo repository GitHub.
4. Build command: lascia vuoto.
5. Build output directory: `/` oppure root del repository.
6. In Pages > Settings > Functions > D1 database bindings aggiungi:
   - Variable name: `DB`
   - D1 database: `gk-trainer-db`
7. Aggiungi il dominio o sottodominio, ad esempio `gk.lucahome.uk`.
8. Esegui un nuovo deploy.

## Note

L'app non usa più Supabase. Su GitHub Pages le API `/api/*` non esistono: la versione funzionante va pubblicata su Cloudflare Pages.
