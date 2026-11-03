const router = require('express').Router();
const { one, all, run, tx } = require('../db');
const { CATEGORIES, departmentFromPostcode, splitList } = require('../lib');
const { requireRole, upload, httpError, removeUploads } = require('../middleware');

const STATUS = { open: 'En attente de devis', assigned: 'Artisan choisi', done: 'Travaux terminés', cancelled: 'Annulée' };

function artisanMatches(artisan, request) {
  return artisan && splitList(artisan.trades).includes(request.category) && splitList(artisan.departments).includes(request.department);
}

function loadRequest(id) {
  const r = one('SELECT r.*, u.name AS client_name, u.email AS client_email, u.phone AS client_phone FROM requests r JOIN users u ON u.id = r.client_id WHERE r.id = ?', id);
  if (!r) throw httpError(404, 'Demande introuvable.');
  return r;
}

function requestAccess(user, request) {
  if (user.role === 'admin') return 'admin';
  if (user.role === 'client' && request.client_id === user.id) return 'owner';
  if (user.role === 'artisan') {
    const quoted = one('SELECT id FROM quotes WHERE request_id = ? AND artisan_id = ?', request.id, user.id);
    const artisan = one('SELECT * FROM artisans WHERE user_id = ?', user.id);
    if (quoted || (request.status === 'open' && artisanMatches(artisan, request))) return 'artisan';
  }
  return null;
}

router.get('/demandes/nouvelle', requireRole('client'), (req, res) => {
  res.render('request-new', { title: 'Décrire mes travaux', values: { category: req.query.categorie || '' }, error: null });
});

router.post('/demandes/nouvelle', requireRole('client'), upload.array('photos', 5), (req, res) => {
  const v = req.body;
  const files = req.files || [];
  const department = departmentFromPostcode(v.postcode);
  let error = null;
  if (!CATEGORIES[v.category]) error = 'Choisissez un type de travaux.';
  else if (!v.title?.trim() || v.title.length > 120) error = 'Donnez un titre court à votre demande (120 caractères max).';
  else if (!v.description || v.description.trim().length < 20) error = 'Décrivez les travaux en au moins 20 caractères.';
  else if (!v.address?.trim() || !v.city?.trim()) error = "Indiquez l'adresse et la ville des travaux.";
  else if (!department) error = 'Code postal invalide (5 chiffres).';
  else if (!v.consent) error = 'Vous devez accepter la transmission de votre demande aux artisans.';
  if (error) {
    removeUploads(files.map((f) => f.filename));
    return res.status(400).render('request-new', { title: 'Décrire mes travaux', values: v, error });
  }
  const id = tx(() => {
    const r = run(`INSERT INTO requests (client_id, category, title, description, address, postcode, city, department, desired_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.user.id, v.category, v.title.trim(), v.description.trim(), v.address.trim(), v.postcode.trim(), v.city.trim(), department, v.desired_date || '');
    for (const f of files) run('INSERT INTO request_photos (request_id, filename) VALUES (?, ?)', r.lastInsertRowid, f.filename);
    return r.lastInsertRowid;
  });
  const n = one(`SELECT COUNT(*) AS n FROM artisans WHERE verified = 1
    AND (',' || trades || ',') LIKE ? AND (',' || departments || ',') LIKE ?`, `%,${v.category},%`, `%,${department},%`).n;
  req.flash('success', n
    ? `Demande publiée : ${n} artisan${n > 1 ? 's' : ''} vérifié${n > 1 ? 's' : ''} de votre secteur ${n > 1 ? 'peuvent' : 'peut'} maintenant vous envoyer un devis.`
    : "Demande publiée. Aucun artisan vérifié ne couvre encore votre secteur : notre équipe vous recontacte pour vous trouver quelqu'un.");
  res.redirect(`/demandes/${id}`);
});

router.get('/mes-demandes', requireRole('client'), (req, res) => {
  const requests = all(`SELECT r.*, (SELECT COUNT(*) FROM quotes q WHERE q.request_id = r.id) AS quote_count
    FROM requests r WHERE r.client_id = ? ORDER BY r.created_at DESC, r.id DESC`, req.user.id);
  res.render('my-requests', { title: 'Mes demandes', requests, STATUS });
});

router.get('/demandes/:id', requireRole(), (req, res) => {
  const request = loadRequest(req.params.id);
  const access = requestAccess(req.user, request);
  if (!access) throw httpError(404, 'Demande introuvable.');
  const photos = all('SELECT * FROM request_photos WHERE request_id = ?', request.id);
  const quotes = all(`SELECT q.*, u.name, a.company, a.verified,
      (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE artisan_id = q.artisan_id) AS rating,
      (SELECT COUNT(*) FROM reviews WHERE artisan_id = q.artisan_id) AS review_count
    FROM quotes q JOIN users u ON u.id = q.artisan_id JOIN artisans a ON a.user_id = q.artisan_id
    WHERE q.request_id = ? ${access === 'artisan' ? 'AND q.artisan_id = ?' : ''} ORDER BY q.total_ttc`,
  ...(access === 'artisan' ? [request.id, req.user.id] : [request.id]));
  const accepted = quotes.find((q) => q.status === 'accepted');
  const contact = accepted && access !== 'artisan' ? one('SELECT name, email, phone FROM users WHERE id = ?', accepted.artisan_id) : null;
  const review = one('SELECT * FROM reviews WHERE request_id = ?', request.id);
  const artisan = access === 'artisan' ? one('SELECT verified FROM artisans WHERE user_id = ?', req.user.id) : null;
  // L'adresse exacte et les coordonnées du client ne sont communiquées qu'à l'artisan retenu.
  const showClientContact = access === 'admin' || access === 'owner' || (access === 'artisan' && accepted?.artisan_id === req.user.id);
  res.render('request', { title: request.title, request, access, photos, quotes, accepted, contact, review, artisan, showClientContact, STATUS });
});

function ownRequest(req) {
  const request = loadRequest(req.params.id);
  if (request.client_id !== req.user.id) throw httpError(404, 'Demande introuvable.');
  return request;
}

router.post('/devis/:id/accepter', requireRole('client'), (req, res) => {
  const quote = one('SELECT * FROM quotes WHERE id = ?', req.params.id);
  if (!quote) throw httpError(404, 'Devis introuvable.');
  req.params.id = quote.request_id;
  const request = ownRequest(req);
  if (request.status !== 'open') throw httpError(400, 'Cette demande a déjà un artisan.');
  tx(() => {
    run("UPDATE quotes SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'declined' END WHERE request_id = ?", quote.id, request.id);
    run("UPDATE requests SET status = 'assigned' WHERE id = ?", request.id);
  });
  req.flash('success', "Devis accepté. Vous avez maintenant les coordonnées de l'artisan, et il a les vôtres.");
  res.redirect(`/demandes/${request.id}`);
});

router.post('/demandes/:id/terminer', requireRole('client'), (req, res) => {
  const request = ownRequest(req);
  if (request.status !== 'assigned') throw httpError(400, "Choisissez d'abord un artisan.");
  run("UPDATE requests SET status = 'done' WHERE id = ?", request.id);
  req.flash('success', "Travaux marqués comme terminés. Laissez un avis pour aider les autres particuliers.");
  res.redirect(`/demandes/${request.id}#avis`);
});

router.post('/demandes/:id/annuler', requireRole('client'), (req, res) => {
  const request = ownRequest(req);
  if (request.status !== 'open') throw httpError(400, 'Seule une demande en attente peut être annulée.');
  run("UPDATE requests SET status = 'cancelled' WHERE id = ?", request.id);
  req.flash('info', 'Demande annulée.');
  res.redirect('/mes-demandes');
});

router.post('/demandes/:id/avis', requireRole('client'), (req, res) => {
  const request = ownRequest(req);
  const accepted = one("SELECT artisan_id FROM quotes WHERE request_id = ? AND status = 'accepted'", request.id);
  const rating = Number(req.body.rating);
  if (request.status !== 'done' || !accepted) throw httpError(400, 'Vous pourrez laisser un avis une fois les travaux terminés.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Choisissez une note entre 1 et 5.');
  if (one('SELECT id FROM reviews WHERE request_id = ?', request.id)) throw httpError(400, 'Vous avez déjà laissé un avis.');
  run('INSERT INTO reviews (request_id, artisan_id, client_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
    request.id, accepted.artisan_id, req.user.id, rating, String(req.body.comment || '').trim().slice(0, 2000));
  req.flash('success', 'Merci pour votre avis !');
  res.redirect(`/demandes/${request.id}`);
});

router.get('/devis/:id', requireRole(), (req, res) => {
  const quote = one('SELECT * FROM quotes WHERE id = ?', req.params.id);
  if (!quote) throw httpError(404, 'Devis introuvable.');
  const request = loadRequest(quote.request_id);
  const allowed = req.user.role === 'admin' || request.client_id === req.user.id || quote.artisan_id === req.user.id;
  if (!allowed) throw httpError(404, 'Devis introuvable.');
  const items = all('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id', quote.id);
  const artisan = one('SELECT u.name, u.email, u.phone, a.* FROM users u JOIN artisans a ON a.user_id = u.id WHERE u.id = ?', quote.artisan_id);
  res.render('quote', { title: `Devis n° ${quote.id}`, quote, items, request, artisan, isOwner: request.client_id === req.user.id });
});

module.exports = router;
module.exports.artisanMatches = artisanMatches;
module.exports.STATUS = STATUS;
