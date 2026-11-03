const crypto = require('node:crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const { one, run } = require('./db');
const storage = require('./storage');
const lib = require('./lib');
const photos = require('./photos');
const { render } = require('./render');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Rendu sans système de fichiers (compatible Cloudflare Workers).
app.use((req, res, next) => {
  res.render = (view, locals = {}) => res.type('html').send(render(view, { ...res.locals, ...locals }));
  next();
});

// Photos envoyées par les utilisateurs (disque en local, R2 sur Cloudflare).
app.get('/uploads/:key', async (req, res) => {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(req.params.key)) return res.status(404).end();
  const f = await storage.get(req.params.key);
  if (!f) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type(f.type).send(Buffer.from(f.body));
});

app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// Session dans un cookie signé : aucun stockage serveur, adapté à Cloudflare.
let sessionMw;
app.use((req, res, next) => {
  if (!sessionMw) {
    const secret = process.env.SESSION_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET manquant.');
    sessionMw = cookieSession({
      name: 'maisonia',
      keys: [secret || crypto.randomBytes(32).toString('hex')],
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 14,
    });
  }
  sessionMw(req, res, next);
});

// Compte administrateur créé au premier passage si ADMIN_EMAIL et ADMIN_PASSWORD sont définis.
let adminChecked = false;
app.use(async (req, res, next) => {
  if (adminChecked) return next();
  adminChecked = true;
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD && !(await one('SELECT id FROM users WHERE email = ?', ADMIN_EMAIL.toLowerCase()))) {
    await run("INSERT INTO users (role, name, email, password_hash) VALUES ('admin', 'Administrateur', ?, ?)", ADMIN_EMAIL.toLowerCase(), lib.hashPassword(ADMIN_PASSWORD));
  }
  next();
});

app.use(async (req, res, next) => {
  const s = req.session;
  res.locals.user = s.userId ? await one('SELECT id, role, name, email, phone FROM users WHERE id = ?', s.userId) : null;
  if (s.userId && !res.locals.user) delete s.userId;
  req.user = res.locals.user;
  res.locals.flash = s.flash || null;
  delete s.flash;
  res.locals.path = req.path;
  Object.assign(res.locals, lib, photos);
  req.flash = (type, text) => { req.session.flash = { type, text }; };
  next();
});

app.use(require('./routes/public'));
app.use(require('./routes/auth'));
app.use(require('./routes/client'));
app.use(require('./routes/artisan'));
app.use(require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: 'Page introuvable', message: "Cette page n'existe pas." }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code && String(err.code).startsWith('LIMIT_') ? 400 : 500);
  if (status === 500) console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo trop lourde (5 Mo maximum).'
    : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Trop de photos (5 maximum).'
    : err.expose || status < 500 ? err.message : 'Une erreur est survenue.';
  res.status(status);
  if (!res.locals.path) Object.assign(res.locals, lib, photos, { user: null, flash: null, path: req.path });
  res.render('error', { title: 'Erreur', message });
});

module.exports = app;
