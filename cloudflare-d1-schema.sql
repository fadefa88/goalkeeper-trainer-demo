PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 100000,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  keepers_count INTEGER NOT NULL DEFAULT 3,
  sport TEXT NOT NULL DEFAULT 'calcio' CHECK (sport IN ('calcio', 'futsal')),
  level TEXT NOT NULL DEFAULT 'medio' CHECK (level IN ('base', 'medio', 'pro')),
  sessions_per_week INTEGER NOT NULL DEFAULT 2,
  session_duration INTEGER NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS keepers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  height_cm REAL,
  weight_kg REAL,
  sport TEXT NOT NULL DEFAULT 'calcio' CHECK (sport IN ('calcio', 'futsal')),
  level TEXT NOT NULL DEFAULT 'medio' CHECK (level IN ('base', 'medio', 'pro')),
  standing_broad_jump_cm REAL,
  standing_vertical_jump_cm REAL,
  standing_half_height_jump_cm REAL,
  two_posts_test_sec REAL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  keeper_id TEXT,
  keeper_name TEXT,
  exercise_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  session_date TEXT NOT NULL,
  planned_minutes INTEGER,
  saves INTEGER NOT NULL DEFAULT 0,
  mistakes INTEGER NOT NULL DEFAULT 0,
  reactions INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  source_page INTEGER,
  sport TEXT,
  level TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (keeper_id) REFERENCES keepers(id) ON DELETE SET NULL
);

-- Esercizi personalizzati creati dall'account (catalogo builtin in app.js
-- resta separato: questa tabella copre solo gli esercizi custom, vedi
-- functions/api/custom-exercises/). Due visual indipendenti e opzionali:
-- - diagram_scene_json: schema animato gratuito (solo modello testuale,
--   nessuna terza parte), generato/rigenerato a piacere, default per ogni
--   esercizio custom;
-- - video_*: video AI vero (alibaba/hh1.1-t2v via AI Gateway/Unified
--   Billing, costoso), persistito su R2, opzione premium esplicita.
-- Entrambi possono restare null/"none": la feature non dipende da nessuno
-- dei due per salvare l'esercizio testuale.
CREATE TABLE IF NOT EXISTS custom_exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  objective TEXT,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Tecnico', 'Difesa spazio', 'Finalizzazione', 'Motorio', 'Conoscenza del gioco', 'Altro')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 240),
  keepers_count INTEGER,
  equipment TEXT,
  notes TEXT,
  diagram_scene_json TEXT,
  -- Hash della descrizione al momento dell'ultima generazione schema:
  -- permette di rilevare "la descrizione è cambiata" senza richiamare
  -- Workers AI solo per un confronto.
  diagram_source_hash TEXT,
  video_status TEXT NOT NULL DEFAULT 'none' CHECK (video_status IN ('none', 'generating', 'ready', 'failed')),
  video_storage_key TEXT,
  -- Hash dei campi che influenzano il video (description/objective/equipment/
  -- keepersCount/category) al momento dell'ultima generazione riuscita:
  -- permette di rilevare "la descrizione è cambiata da quando ho generato
  -- il video" senza richiamare Workers AI solo per un confronto.
  video_source_hash TEXT,
  video_model TEXT,
  -- Timestamp dell'ultimo tentativo (settato anche quando video_status passa
  -- a "generating", usato per il cooldown lato server) e, se "ready", di
  -- quando il video attuale è stato prodotto.
  video_created_at TEXT,
  video_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS auth_sessions_token_hash_idx ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS keepers_user_id_idx ON keepers(user_id);
CREATE INDEX IF NOT EXISTS training_sessions_user_id_date_idx ON training_sessions(user_id, session_date);
CREATE INDEX IF NOT EXISTS training_sessions_keeper_id_idx ON training_sessions(keeper_id);
CREATE INDEX IF NOT EXISTS custom_exercises_user_id_idx ON custom_exercises(user_id);

-- ============================================================
-- Personalizzazione per cliente (scelta squadra + tema)
-- Catalogo società (clubs/club_teams/club_team_seasons/club_provider_ids/
-- club_calendar_sources) è condiviso e mantenuto lato backend (vedi
-- functions/api/clubs.js e functions/api/admin/clubs-import.js). Le
-- preferenze del cliente (user_club_preferences) sono invece private,
-- una riga per account: due account che scelgono la stessa società non
-- condividono nulla, ogni riga vive per conto proprio.
-- ============================================================

-- Società: identificativo interno stabile (slug), nome ufficiale, alias,
-- località, palette sociale. La categoria calcistica NON vive qui: una
-- promozione/retrocessione non deve mai richiedere di toccare i colori.
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  official_name TEXT NOT NULL,
  short_name TEXT,
  aliases TEXT,                    -- JSON array di stringhe (nomi alternativi/storici)
  city TEXT,
  region TEXT,
  province TEXT,
  -- Minuscolo, senza accenti, concatenazione di nome+short_name+alias+città:
  -- popolato dall'importatore, usato dalla ricerca (LIKE) tollerante a
  -- maiuscole/accenti senza bisogno di FTS5.
  search_key TEXT NOT NULL DEFAULT '',
  color_primary TEXT,              -- HEX, adattato per UI (vedi colors_source)
  color_secondary TEXT,
  colors_source TEXT NOT NULL DEFAULT 'unknown' CHECK (colors_source IN ('official', 'documented', 'adapted', 'unknown')),
  colors_note TEXT,                -- es. "clubColors: 'Rosso/Bianco' (football-data.org)"
  colors_verified_at TEXT,
  data_source TEXT,                -- es. "football-data.org", "manuale", "import-csv-2026-09"
  -- JSON array di nomi colonna che un re-import non deve sovrascrivere
  -- (correzione manuale già applicata, vedi admin/clubs-import.js).
  locked_fields TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS clubs_search_key_idx ON clubs(search_key);

-- ID dei provider esterni, separati dall'id interno e dal nome del
-- provider stesso: non si deduplicano mai due società solo perché il
-- nome si somiglia, solo perché condividono un provider_id verificato.
CREATE TABLE IF NOT EXISTS club_provider_ids (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,          -- "espn" | "football-data.org" | "api-football" | ...
  provider_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id)
);

CREATE INDEX IF NOT EXISTS club_provider_ids_club_id_idx ON club_provider_ids(club_id);

-- Formazione della società: prima squadra / giovanile / altra, disciplina,
-- settore, fascia d'età. Una società può avere più formazioni.
CREATE TABLE IF NOT EXISTS club_teams (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_type TEXT NOT NULL DEFAULT 'prima_squadra' CHECK (team_type IN ('prima_squadra', 'giovanile', 'altra')),
  discipline TEXT NOT NULL DEFAULT 'calcio11' CHECK (discipline IN ('calcio11', 'calcio5')),
  gender TEXT CHECK (gender IN ('maschile', 'femminile') OR gender IS NULL),
  age_group TEXT,                  -- es. "Under 17", NULL per la prima squadra
  label TEXT,                      -- etichetta leggibile opzionale, es. "Juniores Under 19"
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_id, team_type, discipline, gender, age_group)
);

CREATE INDEX IF NOT EXISTS club_teams_club_id_idx ON club_teams(club_id);

-- Partecipazione stagionale: stagione, campionato/categoria, girone e
-- territorio, SOLO quando verificati. Serve a classificare/cercare, mai a
-- decidere il tema. Righe assenti = dato non verificato, non "nessuna
-- categoria": il wizard non obbliga a conoscerla per trovare la squadra.
CREATE TABLE IF NOT EXISTS club_team_seasons (
  id TEXT PRIMARY KEY,
  club_team_id TEXT NOT NULL REFERENCES club_teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,            -- es. "2026-27"
  competition TEXT,                -- es. "Serie B", "Eccellenza"
  group_name TEXT,                 -- girone, es. "Girone A"
  territory TEXT,                  -- regione/provincia per campionati regionali
  data_source TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_team_id, season)
);

CREATE INDEX IF NOT EXISTS club_team_seasons_club_team_id_idx ON club_team_seasons(club_team_id);

-- Mapping verificato formazione -> provider calendario. Assente = nessun
-- calendario automatico per quella formazione (stato vuoto lato client),
-- mai una deduzione implicita dal tema o dalla categoria.
CREATE TABLE IF NOT EXISTS club_calendar_sources (
  id TEXT PRIMARY KEY,
  club_team_id TEXT NOT NULL REFERENCES club_teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,          -- "espn"
  provider_team_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_team_id, provider)
);

CREATE INDEX IF NOT EXISTS club_calendar_sources_club_team_id_idx ON club_calendar_sources(club_team_id);

-- Preferenza del cliente: proprietario = account (progetto individuale,
-- nessuno spazio organizzazione/cliente esiste altrove nello schema).
-- Separata dal catalogo: due account con la stessa club_id non
-- condividono nulla, ognuno ha la propria riga/colori/stato wizard.
CREATE TABLE IF NOT EXISTS user_club_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL,
  club_team_id TEXT REFERENCES club_teams(id) ON DELETE SET NULL,
  -- "Non trovo la mia squadra": appartiene al cliente, non tocca il catalogo.
  custom_club_name TEXT,
  custom_city TEXT,
  custom_team_label TEXT,
  color_primary TEXT,              -- override cliente (custom o ricolorazione di un club del catalogo)
  color_secondary TEXT,
  use_custom_colors INTEGER NOT NULL DEFAULT 0,
  theme_mode TEXT NOT NULL DEFAULT 'neutral' CHECK (theme_mode IN ('club', 'custom', 'neutral')),
  -- Step "Scegli la tua squadra" del wizard completato (scelta, custom o
  -- skip): separato da "wizard interamente completato" (quello resta
  -- deciso da keepers.length, vedi loadData in cloudflare-client.js), così
  -- non viene mai riproposto dopo la prima risposta esplicita.
  team_step_done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
