const router = require('express').Router();
const { one, all, run } = require('../db');
const { requireRole, httpError } = require('../middleware');
const mailer = require('../mailer');

router.get('/admin', requireRole('admin'), async (req, res) => {
  const artisans = await all(`SELECT u.id, u.name, u.email, u.phone, u.created_at, a.* FROM users u JOIN artisans a ON a.user_id = u.id
    ORDER BY a.verified, u.created_at DESC`);
  const requests = await all(`SELECT r.*, (SELECT COUNT(*) FROM quotes q WHERE q.request_id = r.id) AS quote_count
    FROM requests r ORDER BY r.created_at DESC LIMIT 50`);
  const contacts = await all('SELECT * FROM contact_messages ORDER BY handled, created_at DESC LIMIT 100');
  res.render('admin', { title: 'Administration', artisans, requests, contacts });
});

router.post('/admin/artisans/:id/verifier', requireRole('admin'), async (req, res) => {
  const a = await one('SELECT * FROM artisans WHERE user_id = ?', req.params.id);
  if (!a) throw httpError(404, 'Artisan introuvable.');
  const verify = req.body.action === 'verifier';
  await run(`UPDATE artisans SET verified = ?, verified_at = ${verify ? "datetime('now')" : 'NULL'} WHERE user_id = ?`, verify ? 1 : 0, a.user_id);
  if (verify) {
    const u = await one('SELECT email FROM users WHERE id = ?', a.user_id);
    await mailer.send(u.email, 'Votre profil Maisonia est vérifié', [
      'Bonjour,', '', 'Votre SIRET et votre assurance ont été vérifiés : vous pouvez maintenant envoyer des devis aux particuliers de votre secteur.',
      mailer.link('/espace-artisan'),
    ]);
  }
  req.flash('success', verify ? `${a.company} est maintenant vérifié.` : `Vérification retirée pour ${a.company}.`);
  res.redirect('/admin');
});

router.post('/admin/contacts/:id/traite', requireRole('admin'), async (req, res) => {
  await run('UPDATE contact_messages SET handled = 1 WHERE id = ?', req.params.id);
  res.redirect('/admin#contacts');
});

module.exports = router;
