const router = require('express').Router();
const { one, run, tx } = require('../db');
const { hashPassword, checkPassword } = require('../lib');
const { requireRole, removeUploads } = require('../middleware');
const { all } = require('../db');

const safeNext = (n) => (typeof n === 'string' && /^\/[^/\\]/.test(n) ? n : null);
const home = (u) => (u.role === 'artisan' ? '/espace-artisan' : u.role === 'admin' ? '/admin' : '/mes-demandes');

router.get('/inscription', (req, res) => {
  res.render('register', { title: 'Créer un compte', role: req.query.role === 'artisan' ? 'artisan' : 'client', values: {}, error: null, next: safeNext(req.query.next) });
});

router.post('/inscription', (req, res) => {
  const v = req.body;
  const role = v.role === 'artisan' ? 'artisan' : 'client';
  const email = String(v.email || '').trim().toLowerCase();
  let error = null;
  if (!v.name?.trim()) error = 'Indiquez votre nom.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Adresse e-mail invalide.';
  else if (!/^[+\d][\d .-]{8,}$/.test(v.phone || '')) error = 'Numéro de téléphone invalide.';
  else if (String(v.password || '').length < 8) error = 'Le mot de passe doit contenir au moins 8 caractères.';
  else if (!v.cgu) error = "Vous devez accepter les conditions d'utilisation.";
  else if (one('SELECT id FROM users WHERE email = ?', email)) error = 'Un compte existe déjà avec cette adresse e-mail.';
  if (error) return res.status(400).render('register', { title: 'Créer un compte', role, values: v, error, next: safeNext(v.next) });

  const id = tx(() => {
    const r = run('INSERT INTO users (role, name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?)', role, v.name.trim(), email, hashPassword(v.password), v.phone.trim());
    if (role === 'artisan') run('INSERT INTO artisans (user_id) VALUES (?)', r.lastInsertRowid);
    return Number(r.lastInsertRowid);
  });
  req.session.regenerate(() => {
    req.session.userId = id;
    if (role === 'artisan') {
      req.flash('success', 'Compte créé. Complétez votre profil professionnel pour être vérifié.');
      return res.redirect('/espace-artisan/profil');
    }
    req.flash('success', 'Bienvenue sur Maisonia !');
    res.redirect(safeNext(v.next) || '/demandes/nouvelle');
  });
});

router.get('/connexion', (req, res) => res.render('login', { title: 'Connexion', error: null, email: '', next: safeNext(req.query.next) }));

router.post('/connexion', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = one('SELECT * FROM users WHERE email = ?', email);
  if (!u || !checkPassword(String(req.body.password || ''), u.password_hash)) {
    return res.status(401).render('login', { title: 'Connexion', error: 'E-mail ou mot de passe incorrect.', email, next: safeNext(req.body.next) });
  }
  req.session.regenerate(() => {
    req.session.userId = u.id;
    res.redirect(safeNext(req.body.next) || home(u));
  });
});

router.post('/deconnexion', (req, res) => req.session.destroy(() => res.redirect('/')));

router.get('/compte', requireRole(), (req, res) => res.render('account', { title: 'Mon compte' }));

// Droit à l'effacement (RGPD art. 17) : suppression du compte et des données associées.
router.post('/compte/supprimer', requireRole('client', 'artisan'), (req, res) => {
  if (!checkPassword(String(req.body.password || ''), one('SELECT password_hash FROM users WHERE id = ?', req.user.id).password_hash)) {
    req.flash('error', 'Mot de passe incorrect, compte non supprimé.');
    return res.redirect('/compte');
  }
  const files = [
    ...all('SELECT p.filename FROM request_photos p JOIN requests r ON r.id = p.request_id WHERE r.client_id = ?', req.user.id),
    ...all('SELECT filename FROM portfolio WHERE artisan_id = ?', req.user.id),
  ].map((f) => f.filename);
  run('DELETE FROM users WHERE id = ?', req.user.id);
  removeUploads(files);
  req.session.destroy(() => res.redirect('/?compte=supprime'));
});

module.exports = router;
