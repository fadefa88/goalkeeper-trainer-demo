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
-- functions/api/custom-exercises/). diagram_scene_json è la scena tattica
-- generata da Workers AI (JSON validato server-side, mai HTML/SVG), può
-- restare null: la feature non dipende da Workers AI per salvare l'esercizio.
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
  diagram_version INTEGER NOT NULL DEFAULT 1,
  -- Hash della descrizione al momento dell'ultima generazione schema: permette
  -- di rilevare "la descrizione è cambiata da quando ho generato lo schema"
  -- senza richiamare Workers AI solo per un confronto.
  diagram_source_hash TEXT,
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
