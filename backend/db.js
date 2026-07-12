const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'transitops.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('FleetManager','Driver','SafetyOfficer','FinancialAnalyst','Admin')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  max_load_capacity REAL NOT NULL,
  odometer REAL NOT NULL DEFAULT 0,
  acquisition_cost REAL NOT NULL DEFAULT 0,
  region TEXT DEFAULT 'Unassigned',
  status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available','On Trip','In Shop','Retired')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  license_number TEXT UNIQUE NOT NULL,
  license_category TEXT NOT NULL,
  license_expiry TEXT NOT NULL,
  contact_number TEXT,
  safety_score REAL NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available','On Trip','Off Duty','Suspended')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  destination TEXT NOT NULL,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  driver_id INTEGER NOT NULL REFERENCES drivers(id),
  cargo_weight REAL NOT NULL,
  planned_distance REAL NOT NULL,
  actual_distance REAL,
  fuel_consumed REAL,
  revenue REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Dispatched','Completed','Cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  dispatched_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  description TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Closed')),
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS fuel_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  trip_id INTEGER REFERENCES trips(id),
  liters REAL NOT NULL,
  cost REAL NOT NULL,
  date TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER REFERENCES vehicles(id),
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL DEFAULT (date('now')),
  description TEXT
);
`);

module.exports = db;
