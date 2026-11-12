// ── MariaDB: pool, schema en transacties ───────────────────────────
const mysql = require('mysql2/promise')

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS admins (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    email                VARCHAR(190) NOT NULL UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    must_change_password TINYINT(1)   NOT NULL DEFAULT 0,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS events (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(150) NOT NULL,
    description      TEXT NULL,
    budget           DECIMAL(8,2) NULL,
    event_date       DATE NULL,
    reminder_at      DATETIME NULL,
    reminder_sent_at DATETIME NULL,
    drawn_at         DATETIME NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS participants (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    event_id     INT NOT NULL,
    name         VARCHAR(150) NOT NULL,
    email        VARCHAR(190) NOT NULL,
    token        CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    wishlist     TEXT NULL,
    invited_at   DATETIME NULL,
    last_seen_at DATETIME NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_event_email (event_id, email),
    CONSTRAINT fk_participants_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS exclusions (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    a_id     INT NOT NULL,
    b_id     INT NOT NULL,
    UNIQUE KEY uq_exclusion (event_id, a_id, b_id),
    CONSTRAINT fk_excl_event FOREIGN KEY (event_id) REFERENCES events(id)       ON DELETE CASCADE,
    CONSTRAINT fk_excl_a     FOREIGN KEY (a_id)     REFERENCES participants(id) ON DELETE CASCADE,
    CONSTRAINT fk_excl_b     FOREIGN KEY (b_id)     REFERENCES participants(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS assignments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    event_id    INT NOT NULL,
    giver_id    INT NOT NULL UNIQUE,
    receiver_id INT NOT NULL UNIQUE,
    CONSTRAINT fk_assign_event    FOREIGN KEY (event_id)    REFERENCES events(id)       ON DELETE CASCADE,
    CONSTRAINT fk_assign_giver    FOREIGN KEY (giver_id)    REFERENCES participants(id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_receiver FOREIGN KEY (receiver_id) REFERENCES participants(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  `CREATE TABLE IF NOT EXISTS messages (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    sender_role   ENUM('giver','receiver') NOT NULL,
    body          TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at       DATETIME NULL,
    KEY idx_messages_assignment (assignment_id),
    CONSTRAINT fk_messages_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,

  // Instellingen uit het beheer (afzender en mailteksten, als JSON onder de naam 'mail')
  `CREATE TABLE IF NOT EXISTS app_settings (
    name       VARCHAR(64) PRIMARY KEY,
    value      MEDIUMTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`,
]

// Idempotente aanpassingen voor bestaande installaties (MariaDB ondersteunt IF NOT EXISTS)
const MIGRATIONS = [
  // Openbare inschrijflink per event
  'ALTER TABLE events ADD COLUMN IF NOT EXISTS signup_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL',
  'ALTER TABLE events ADD COLUMN IF NOT EXISTS signup_open TINYINT(1) NOT NULL DEFAULT 0',
  'ALTER TABLE events ADD UNIQUE INDEX IF NOT EXISTS uq_events_signup_code (signup_code)',
  // Moment waarop een deelnemer zich zelf inschreef en akkoord ging
  'ALTER TABLE participants ADD COLUMN IF NOT EXISTS consented_at DATETIME NULL',
]

function createPool(env = process.env) {
  return mysql.createPool({
    host: env.DB_HOST || 'localhost',
    port: parseInt(env.DB_PORT || '3306', 10),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'secret_santa',
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,       // DATE/DATETIME als tekst, geen tijdzone-verrassingen
    charset: 'utf8mb4',
  })
}

const pool = createPool()

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

async function one(sql, params = []) {
  const rows = await query(sql, params)
  return rows[0] || null
}

/** Voert fn uit in één transactie; rollback bij elke fout. */
async function transaction(fn) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const tx = {
      query: async (sql, params = []) => (await conn.query(sql, params))[0],
    }
    const result = await fn(tx)
    await conn.commit()
    return result
  } catch (e) {
    await conn.rollback().catch(() => {})
    throw e
  } finally {
    conn.release()
  }
}

/** Wacht tot MariaDB bereikbaar is (de container start vaak trager dan de app). */
async function waitForDb({ attempts = 30, delayMs = 2000 } = {}) {
  let lastError
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (e) {
      lastError = e
      console.warn(`[DB] nog niet bereikbaar (${i}/${attempts}): ${e.code || e.message}`)
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastError
}

async function migrate() {
  for (const sql of SCHEMA) await pool.query(sql)
  for (const sql of MIGRATIONS) await pool.query(sql)
}

module.exports = { pool, query, one, transaction, waitForDb, migrate, SCHEMA, MIGRATIONS }
