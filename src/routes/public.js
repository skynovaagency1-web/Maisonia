const router = require('express').Router();
const { one, all, run } = require('../db');
const { CATEGORIES } = require('../lib');
const { httpError } = require('../middleware');
const { TRADES, CITIES } = require('../seo');
const mailer = require('../mailer');

const ARTISAN_SELECT = `
  SELECT u.id, u.name, a.*, (SELECT filename FROM portfolio p WHERE p.artisan_id = u.id ORDER BY p.id DESC LIMIT 1) AS cover, ROUND(AVG(r.rating), 1) AS rating, COUNT(r.id) AS review_count
  FROM users u JOIN artisans a ON a.user_id = u.id
  LEFT JOIN reviews r ON r.artisan_id = u.id`;

router.get('/', async (req, res) => {
  const stats = await one(`SELECT
    (SELECT COUNT(*) FROM artisans WHERE verified = 1) AS artisans,
    (SELECT COUNT(*) FROM requests) AS requests,
    (SELECT ROUND(AVG(rating), 1) FROM reviews) AS rating`);
  res.render('home', { title: 'Trouvez un artisan près de chez vous', stats });
});

router.get('/artisans', async (req, res) => {
  const categorie = CATEGORIES[req.query.categorie] ? req.query.categorie : '';
  const departement = /^\d[\dAB]\d?$/.test(req.query.departement || '') ? req.query.departement : '';
  const where = ['a.verified = 1'];
  const params = [];
  if (categorie) { where.push("(',' || a.trades || ',') LIKE ?"); params.push(`%,${categorie},%`); }
  if (departement) { where.push("(',' || a.departments || ',') LIKE ?"); params.push(`%,${departement},%`); }
  const artisans = await all(`${ARTISAN_SELECT} WHERE ${where.join(' AND ')} GROUP BY u.id ORDER BY rating DESC NULLS LAST, review_count DESC`, ...params);
  res.render('artisans', { title: 'Les artisans', artisans, categorie, departement });
});

router.get('/artisans/:id', async (req, res) => {
  const artisan = await one(`${ARTISAN_SELECT} WHERE u.id = ? AND u.role = 'artisan' GROUP BY u.id`, req.params.id);
  const canSee = artisan && (artisan.verified || req.user?.id === artisan.id || req.user?.role === 'admin');
  if (!canSee) throw httpError(404, 'Artisan introuvable.');
  const reviews = await all(`SELECT r.*, u.name AS client_name, q.category FROM reviews r
    JOIN users u ON u.id = r.client_id JOIN requests q ON q.id = r.request_id
    WHERE r.artisan_id = ? ORDER BY r.created_at DESC`, artisan.id);
  const portfolio = await all('SELECT * FROM portfolio WHERE artisan_id = ? ORDER BY id DESC', artisan.id);
  res.render('artisan-profile', { title: artisan.company || artisan.name, artisan, reviews, portfolio });
});

router.get('/confidentialite', async (req, res) => res.render('legal/confidentialite', { title: 'Politique de confidentialité' }));
router.get('/mentions-legales', async (req, res) => res.render('legal/mentions', { title: 'Mentions légales' }));
router.get('/conditions', async (req, res) => res.render('legal/conditions', { title: "Conditions d'utilisation" }));

router.get('/aide', async (req, res) => res.render('help', { title: 'Questions fréquentes', description: 'Comment fonctionne Servizone pour les particuliers et les artisans : demandes, devis, vérifications, avis et données personnelles.' }));

router.get('/tarifs-artisans', async (req, res) => res.render('pricing', { title: 'Tarifs artisans', description: 'Servizone est gratuit pour les artisans pendant la phase pilote.' }));

const TOPICS = {
  question: 'Une question sur Servizone',
  artisan: 'Un problème avec un artisan',
  client: 'Un problème avec un client',
  avis: 'Signaler un avis',
  donnees: 'Mes données personnelles',
  autre: 'Autre',
};

router.get('/contact', async (req, res) => {
  const topic = TOPICS[req.query.sujet] ? req.query.sujet : '';
  const reference = String(req.query.ref || '').slice(0, 200);
  res.render('contact', { title: 'Contact', TOPICS, values: { topic, reference, name: req.user?.name || '', email: req.user?.email || '' }, error: null, sent: false });
});

router.post('/contact', async (req, res) => {
  const v = req.body;
  const email = String(v.email || '').trim().toLowerCase();
  let error = null;
  if (v.website) return res.render('contact', { title: 'Contact', TOPICS, values: {}, error: null, sent: true }); // piège à robots
  if (!String(v.name || '').trim()) error = 'Indiquez votre nom.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Adresse e-mail invalide.';
  else if (!TOPICS[v.topic]) error = 'Choisissez un sujet.';
  else if (String(v.body || '').trim().length < 10) error = 'Votre message est trop court.';
  if (error) return res.status(400).render('contact', { title: 'Contact', TOPICS, values: v, error, sent: false });
  await run('INSERT INTO contact_messages (user_id, name, email, topic, reference, body) VALUES (?, ?, ?, ?, ?, ?)',
    req.user?.id ?? null, v.name.trim(), email, v.topic, String(v.reference || '').trim().slice(0, 200), v.body.trim().slice(0, 5000));
  if (process.env.CONTACT_EMAIL) {
    await mailer.send(process.env.CONTACT_EMAIL, `[Contact] ${TOPICS[v.topic]} — ${v.name.trim()}`, [`De : ${v.name.trim()} <${email}>`, v.reference ? `Concerne : ${v.reference}` : '', '', v.body.trim()]);
  }
  res.render('contact', { title: 'Contact', TOPICS, values: {}, error: null, sent: true });
});

// Pages locales : /plombier/paris, /electricien/montreuil…
router.get('/:metier/:ville', async (req, res, next) => {
  const trade = TRADES[req.params.metier];
  const city = CITIES[req.params.ville];
  if (!trade || !city) return next();
  const artisans = await all(`${ARTISAN_SELECT} WHERE a.verified = 1 AND (',' || a.trades || ',') LIKE ? AND (',' || a.departments || ',') LIKE ?
    GROUP BY u.id ORDER BY rating DESC NULLS LAST, review_count DESC`, `%,${trade.category},%`, `%,${city.department},%`);
  res.render('city', {
    title: `${trade.label} à ${city.name}`,
    description: `Trouvez un ${trade.label.toLowerCase()} vérifié à ${city.name} (${city.department}) : ${trade.jobs}. Devis détaillés gratuits, avis clients, SIRET et assurance décennale contrôlés.`,
    trade, city, artisans, slug: req.params, TRADES, CITIES,
  });
});

router.get('/robots.txt', async (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /espace-artisan\nDisallow: /demandes\nDisallow: /devis\nSitemap: ${mailer.APP_URL}/sitemap.xml\n`));

router.get('/sitemap.xml', async (req, res) => {
  const urls = ['/', '/artisans', '/aide', '/contact', '/tarifs-artisans', '/inscription?role=artisan'];
  for (const t of Object.keys(TRADES)) for (const c of Object.keys(CITIES)) urls.push(`/${t}/${c}`);
  for (const a of await all('SELECT user_id FROM artisans WHERE verified = 1')) urls.push(`/artisans/${a.user_id}`);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${mailer.APP_URL}${u.replace(/&/g, '&amp;')}</loc></url>`).join('\n')}\n</urlset>\n`);
});

module.exports = router;
