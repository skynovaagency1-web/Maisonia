const router = require('express').Router();
const { one, all, run, batch } = require('../db');
const { hashPassword, checkPassword } = require('../lib');
const crypto = require('node:crypto');
const { requireRole, removeUploads } = require('../middleware');
const mailer = require('../mailer');

const safeNext = (n) => (typeof n === 'string' && /^\/[^/\\]/.test(n) ? n : null);
const home = (u) => (u.role === 'artisan' ? '/espace-artisan' : u.role === 'admin' ? '/admin' : '/mes-demandes');

router.get('/inscription', async (req, res) => {
  res.render('register', { title: 'Créer un compte', role: req.query.role === 'artisan' ? 'artisan' : 'client', values: {}, error: null, next: safeNext(req.query.next) });
});

router.post('/inscription', async (req, res) => {
  const v = req.body;
  const role = v.role === 'artisan' ? 'artisan' : 'client';
  const email = String(v.email || '').trim().toLowerCase();
  let error = null;
  if (!v.name?.trim()) error = 'Indiquez votre nom.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Adresse e-mail invalide.';
  else if (!/^[+\d][\d .-]{8,}$/.test(v.phone || '')) error = 'Numéro de téléphone invalide.';
  else if (String(v.password || '').length < 8) error = 'Le mot de passe doit contenir au moins 8 caractères.';
  else if (!v.cgu) error = "Vous devez accepter les conditions d'utilisation.";
  else if (await one('SELECT id FROM users WHERE email = ?', email)) error = 'Un compte existe déjà avec cette adresse e-mail.';
  if (error) return res.status(400).render('register', { title: 'Créer un compte', role, values: v, error, next: safeNext(v.next) });

  const r = await run('INSERT INTO users (role, name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?)', role, v.name.trim(), email, hashPassword(v.password), v.phone.trim());
  const id = Number(r.lastInsertRowid);
  if (role === 'artisan') await run('INSERT INTO artisans (user_id) VALUES (?)', id);
  req.session.userId = id;
  if (role === 'artisan') {
    req.flash('success', 'Compte créé. Complétez votre profil professionnel pour être vérifié.');
    return res.redirect('/espace-artisan/profil');
  }
  req.flash('success', 'Bienvenue sur Servizone !');
  res.redirect(safeNext(v.next) || '/demandes/nouvelle');
});

router.get('/connexion', async (req, res) => res.render('login', { title: 'Connexion', error: null, email: '', next: safeNext(req.query.next) }));

router.post('/connexion', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = await one('SELECT * FROM users WHERE email = ?', email);
  if (!u || !checkPassword(String(req.body.password || ''), u.password_hash)) {
    return res.status(401).render('login', { title: 'Connexion', error: 'E-mail ou mot de passe incorrect.', email, next: safeNext(req.body.next) });
  }
  req.session.userId = u.id;
  res.redirect(safeNext(req.body.next) || home(u));
});

// Mot de passe oublié : même réponse que le compte existe ou non, lien valable 1 heure.
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

router.get('/mot-de-passe-oublie', async (req, res) => res.render('forgot', { title: 'Mot de passe oublié', sent: false }));

router.post('/mot-de-passe-oublie', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = await one('SELECT id, email FROM users WHERE email = ?', email);
  if (u) {
    const token = crypto.randomBytes(32).toString('base64url');
    await run("DELETE FROM password_resets WHERE user_id = ? OR expires_at < datetime('now')", u.id);
    await run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))", sha(token), u.id);
    await mailer.send(u.email, 'Réinitialiser votre mot de passe Servizone', [
      'Bonjour,', '', 'Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :', mailer.link(`/reinitialiser/${token}`), '',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.",
    ]);
  }
  res.render('forgot', { title: 'Mot de passe oublié', sent: true });
});

async function resetFor(token) {
  return await one("SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > datetime('now')", sha(String(token)));
}

router.get('/reinitialiser/:token', async (req, res) => {
  res.render('reset', { title: 'Nouveau mot de passe', valid: Boolean(await resetFor(req.params.token)), error: null });
});

router.post('/reinitialiser/:token', async (req, res) => {
  const r = await resetFor(req.params.token);
  if (!r) return res.status(400).render('reset', { title: 'Nouveau mot de passe', valid: false, error: null });
  const pw = String(req.body.password || '');
  if (pw.length < 8) return res.status(400).render('reset', { title: 'Nouveau mot de passe', valid: true, error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  if (pw !== req.body.password_confirm) return res.status(400).render('reset', { title: 'Nouveau mot de passe', valid: true, error: 'Les deux mots de passe ne correspondent pas.' });
  await batch([
    ['UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(pw), r.user_id],
    ['DELETE FROM password_resets WHERE user_id = ?', r.user_id],
  ]);
  req.flash('success', 'Mot de passe modifié. Vous pouvez vous connecter.');
  res.redirect('/connexion');
});

router.post('/deconnexion', async (req, res) => { req.session = null; res.redirect('/'); });

router.get('/compte', requireRole(), async (req, res) => res.render('account', { title: 'Mon compte' }));

// Droit à l'effacement (RGPD art. 17) : suppression du compte et des données associées.
router.post('/compte/supprimer', requireRole('client', 'artisan'), async (req, res) => {
  if (!checkPassword(String(req.body.password || ''), (await one('SELECT password_hash FROM users WHERE id = ?', req.user.id)).password_hash)) {
    req.flash('error', 'Mot de passe incorrect, compte non supprimé.');
    return res.redirect('/compte');
  }
  const files = [
    ...await all('SELECT p.filename FROM request_photos p JOIN requests r ON r.id = p.request_id WHERE r.client_id = ?', req.user.id),
    ...await all('SELECT filename FROM portfolio WHERE artisan_id = ?', req.user.id),
  ].map((f) => f.filename);
  await run('DELETE FROM users WHERE id = ?', req.user.id);
  await removeUploads(files);
  req.session = null;
  res.redirect('/?compte=supprime');
});

module.exports = router;
