const router = require('express').Router();
const { one, all } = require('../db');
const { CATEGORIES } = require('../lib');
const { httpError } = require('../middleware');

const ARTISAN_SELECT = `
  SELECT u.id, u.name, a.*, (SELECT filename FROM portfolio p WHERE p.artisan_id = u.id ORDER BY p.id DESC LIMIT 1) AS cover, ROUND(AVG(r.rating), 1) AS rating, COUNT(r.id) AS review_count
  FROM users u JOIN artisans a ON a.user_id = u.id
  LEFT JOIN reviews r ON r.artisan_id = u.id`;

router.get('/', (req, res) => {
  const stats = one(`SELECT
    (SELECT COUNT(*) FROM artisans WHERE verified = 1) AS artisans,
    (SELECT COUNT(*) FROM requests) AS requests,
    (SELECT ROUND(AVG(rating), 1) FROM reviews) AS rating`);
  res.render('home', { title: 'Trouvez un artisan près de chez vous', stats });
});

router.get('/artisans', (req, res) => {
  const categorie = CATEGORIES[req.query.categorie] ? req.query.categorie : '';
  const departement = /^\d[\dAB]\d?$/.test(req.query.departement || '') ? req.query.departement : '';
  const where = ['a.verified = 1'];
  const params = [];
  if (categorie) { where.push("(',' || a.trades || ',') LIKE ?"); params.push(`%,${categorie},%`); }
  if (departement) { where.push("(',' || a.departments || ',') LIKE ?"); params.push(`%,${departement},%`); }
  const artisans = all(`${ARTISAN_SELECT} WHERE ${where.join(' AND ')} GROUP BY u.id ORDER BY rating DESC NULLS LAST, review_count DESC`, ...params);
  res.render('artisans', { title: 'Les artisans', artisans, categorie, departement });
});

router.get('/artisans/:id', (req, res) => {
  const artisan = one(`${ARTISAN_SELECT} WHERE u.id = ? AND u.role = 'artisan' GROUP BY u.id`, req.params.id);
  const canSee = artisan && (artisan.verified || req.user?.id === artisan.id || req.user?.role === 'admin');
  if (!canSee) throw httpError(404, 'Artisan introuvable.');
  const reviews = all(`SELECT r.*, u.name AS client_name, q.category FROM reviews r
    JOIN users u ON u.id = r.client_id JOIN requests q ON q.id = r.request_id
    WHERE r.artisan_id = ? ORDER BY r.created_at DESC`, artisan.id);
  const portfolio = all('SELECT * FROM portfolio WHERE artisan_id = ? ORDER BY id DESC', artisan.id);
  res.render('artisan-profile', { title: artisan.company || artisan.name, artisan, reviews, portfolio });
});

router.get('/confidentialite', (req, res) => res.render('legal/confidentialite', { title: 'Politique de confidentialité' }));
router.get('/mentions-legales', (req, res) => res.render('legal/mentions', { title: 'Mentions légales' }));
router.get('/conditions', (req, res) => res.render('legal/conditions', { title: "Conditions d'utilisation" }));

module.exports = router;
