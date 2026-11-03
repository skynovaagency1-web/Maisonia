-- Schéma Maisonia (D1 / SQLite)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('client','artisan','admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS artisans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL DEFAULT '',
  siret TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  trades TEXT NOT NULL DEFAULT '',
  departments TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  qualification TEXT NOT NULL DEFAULT '',
  insurer TEXT NOT NULL DEFAULT '',
  policy_number TEXT NOT NULL DEFAULT '',
  insurance_valid_until TEXT NOT NULL DEFAULT '',
  insurance_area TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT
);
CREATE TABLE IF NOT EXISTS portfolio (
  id INTEGER PRIMARY KEY,
  artisan_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  city TEXT NOT NULL,
  department TEXT NOT NULL,
  desired_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','done','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS request_photos (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  filename TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  artisan_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  duration TEXT NOT NULL,
  labour_rate_ttc REAL NOT NULL,
  time_method TEXT NOT NULL,
  travel_fee_ht REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL,
  total_ht REAL NOT NULL,
  total_ttc REAL NOT NULL,
  validity_days INTEGER NOT NULL,
  quote_free INTEGER NOT NULL DEFAULT 1,
  quote_cost REAL NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (request_id, artisan_id)
);
CREATE TABLE IF NOT EXISTS quote_items (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price_ht REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,
  artisan_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
