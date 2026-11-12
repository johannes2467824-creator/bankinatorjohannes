
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET.length < 32
) {
  console.error('SESSION_SECRET must be at least 32 characters.');
  process.exit(1);
}

const db = new Database(path.join(ROOT, 'bly.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,
    used_by INTEGER UNIQUE,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    license_id INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (license_id) REFERENCES licenses(id)
  );
`);

function hashLicense(key) {
  return crypto
    .createHash('sha256')
    .update(key.trim().toUpperCase())
    .digest('hex');
}

/* IMPORT PRE-GENERATED LICENSE KEYS */

function importLicenseKeys() {
  const file = path.join(ROOT, 'license-keys.txt');

  if (!fs.existsSync(file)) {
    console.log('No license-keys.txt found.');
    return;
  }

  const keys = fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(key => key.trim().toUpperCase())
    .filter(Boolean);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO licenses (key_hash)
    VALUES (?)
  `);

  const importKeys = db.transaction(() => {
    for (const key of keys) {
      if (/^BLY-(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/.test(key)) {
        insert.run(hashLicense(key));
      }
    }
  });

  importKeys();

  console.log(`Loaded ${keys.length} license keys.`);
}

importLicenseKeys();

/* SECURITY */

app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '20kb' }));

app.use(session({
  store: new SQLiteStore({
    db: 'bly-sessions.sqlite',
    dir: ROOT
  }),
  name: 'bly.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'För många försök. Försök igen om 15 minuter.'
  }
});

app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: 'Du måste logga in.'
    });
  }

  next();
}

function createSession(req, userId, res) {
  req.session.regenerate(error => {
    if (error) {
      return res.status(500).json({
        error: 'Kunde inte skapa sessionen.'
      });
    }

    req.session.userId = userId;

    req.session.save(error => {
      if (error) {
        return res.status(500).json({
          error: 'Kunde inte spara sessionen.'
        });
      }

      res.json({ success: true });
    });
  });
}

/* CREATE ACCOUNT - ONE LICENSE PER ACCOUNT */

const registerAccount = db.transaction(
  (email, passwordHash, licenseHash) => {
    const license = db.prepare(`
      SELECT id FROM licenses
      WHERE key_hash = ? AND used_by IS NULL
    `).get(licenseHash);

    if (!license) {
      throw new Error('INVALID_LICENSE');
    }

    const existing = db.prepare(`
      SELECT id FROM users WHERE email = ?
    `).get(email);

    if (existing) {
      throw new Error('EMAIL_EXISTS');
    }

    const result = db.prepare(`
      INSERT INTO users (email, password_hash, license_id)
      VALUES (?, ?, ?)
    `).run(email, passwordHash, license.id);

    const update = db.prepare(`
      UPDATE licenses
      SET used_by = ?, used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND used_by IS NULL
    `).run(result.lastInsertRowid, license.id);

    if (update.changes !== 1) {
      throw new Error('INVALID_LICENSE');
    }

    return Number(result.lastInsertRowid);
  }
);

app.post('/api/register', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const licenseKey = String(req.body?.licenseKey || '')
    .trim()
    .toUpperCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  ) {
    return res.status(400).json({
      error: 'Ange en giltig e-postadress.'
    });
  }

  if (
    typeof password !== 'string' ||
    password.length < 10 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({
      error: 'Lösenordet måste vara minst 10 tecken.'
    });
  }

  if (!/^BLY-(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/.test(licenseKey)) {
    return res.status(400).json({
      error: 'Ogiltig licensnyckel.'
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const userId = registerAccount(
      email,
      passwordHash,
      hashLicense(licenseKey)
    );

    createSession(req, userId, res);

  } catch (error) {
    if (error.message === 'INVALID_LICENSE') {
      return res.status(400).json({
        error: 'Licensnyckeln är ogiltig eller redan använd.'
      });
    }

    if (
      error.message === 'EMAIL_EXISTS' ||
      error.code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      return res.status(409).json({
        error: 'E-postadressen används redan.'
      });
    }

    console.error(error);

    res.status(500).json({
      error: 'Kunde inte skapa kontot.'
    });
  }
});

/* LOGIN */

app.post('/api/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (
    typeof password !== 'string' ||
    email.length > 254 ||
    password.length > 1000
  ) {
    return res.status(400).json({
      error: 'Ogiltiga inloggningsuppgifter.'
    });
  }

  const user = db.prepare(`
    SELECT id, password_hash
    FROM users
    WHERE email = ?
  `).get(email);

  const valid = user
    ? await bcrypt.compare(password, user.password_hash)
    : false;

  if (!valid) {
    return res.status(401).json({
      error: 'Fel e-postadress eller lösenord.'
    });
  }

  // Replace the current browser session with the new account.
// This prevents two accounts sharing the same browser session.
createSession(req, user.id, res);
});

/* CHECK LOGIN */

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }

  const user = db.prepare(`
    SELECT id, email, created_at
    FROM users
    WHERE id = ?
  `).get(req.session.userId);

  if (!user) {
    return res.json({ loggedIn: false });
  }

  res.json({
    loggedIn: true,
    user
  });
});

/* LOGOUT */

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(error => {
    if (error) {
      return res.status(500).json({
        error: 'Kunde inte logga ut.'
      });
    }

    res.clearCookie('bly.sid');
    res.json({ success: true });
  });
});

/* PROTECT BLY WEBSITE */

app.get(['/', '/index.html'], (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }

  res.sendFile(path.join(PUBLIC, 'index.html'));
});

/* STATIC FILES */

app.use(express.static(PUBLIC, {
  index: false,
  dotfiles: 'deny'
}));

app.listen(PORT, () => {
  console.log('');
  console.log('BLY Account System running!');
  console.log(`http://localhost:${PORT}`);
  console.log('');
});
