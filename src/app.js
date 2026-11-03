const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { one } = require('./db');
const lib = require('./lib');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, '..', 'public')));
// Polices auto-hébergées (aucun appel à Google Fonts).
for (const f of ['jost', 'dm-sans', 'plus-jakarta-sans']) {
  app.use(`/fonts/${f}`, express.static(path.join(__dirname, '..', 'node_modules', '@fontsource-variable', f), { maxAge: '30d' }));
}
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 14 },
}));

app.use((req, res, next) => {
  res.locals.user = req.session.userId ? one('SELECT id, role, name, email, phone FROM users WHERE id = ?', req.session.userId) : null;
  if (req.session.userId && !res.locals.user) delete req.session.userId;
  req.user = res.locals.user;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.path = req.path;
  Object.assign(res.locals, lib, require('./photos'));
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
  res.status(status).render('error', { title: 'Erreur', message });
});

module.exports = app;
