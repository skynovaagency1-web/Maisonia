const router = require('express').Router();
const { one, all, run } = require('../db');
const { requireRole, httpError } = require('../middleware');

router.get('/admin', requireRole('admin'), (req, res) => {
  const artisans = all(`SELECT u.id, u.name, u.email, u.phone, u.created_at, a.* FROM users u JOIN artisans a ON a.user_id = u.id
    ORDER BY a.verified, u.created_at DESC`);
  const requests = all(`SELECT r.*, (SELECT COUNT(*) FROM quotes q WHERE q.request_id = r.id) AS quote_count
    FROM requests r ORDER BY r.created_at DESC LIMIT 50`);
  res.render('admin', { title: 'Administration', artisans, requests });
});

router.post('/admin/artisans/:id/verifier', requireRole('admin'), (req, res) => {
  const a = one('SELECT * FROM artisans WHERE user_id = ?', req.params.id);
  if (!a) throw httpError(404, 'Artisan introuvable.');
  const verify = req.body.action === 'verifier';
  run(`UPDATE artisans SET verified = ?, verified_at = ${verify ? "datetime('now')" : 'NULL'} WHERE user_id = ?`, verify ? 1 : 0, a.user_id);
  req.flash('success', verify ? `${a.company} est maintenant vérifié.` : `Vérification retirée pour ${a.company}.`);
  res.redirect('/admin');
});

module.exports = router;
