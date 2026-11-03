const router = require('express').Router();
const { one, all, run, tx } = require('../db');
const { CATEGORIES, isValidSiret, splitList } = require('../lib');
const { requireRole, upload, httpError, removeUploads } = require('../middleware');
const { artisanMatches, STATUS } = require('./client');

const artisanOf = (id) => one('SELECT u.name, u.email, u.phone, a.* FROM users u JOIN artisans a ON a.user_id = u.id WHERE u.id = ?', id);
const profileComplete = (a) => Boolean(a.company && a.siret && a.address && a.trades && a.departments && a.insurer && a.policy_number && a.insurance_valid_until);

router.get('/espace-artisan', requireRole('artisan'), (req, res) => {
  const artisan = artisanOf(req.user.id);
  const trades = splitList(artisan.trades);
  const depts = splitList(artisan.departments);
  const matching = trades.length && depts.length ? all(`SELECT r.*, (SELECT COUNT(*) FROM quotes q WHERE q.request_id = r.id) AS quote_count,
      (SELECT COUNT(*) FROM request_photos p WHERE p.request_id = r.id) AS photo_count
    FROM requests r WHERE r.status = 'open'
      AND r.category IN (${trades.map(() => '?').join(',')})
      AND r.department IN (${depts.map(() => '?').join(',')})
      AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = r.id AND q.artisan_id = ?)
    ORDER BY r.created_at DESC`, ...trades, ...depts, req.user.id) : [];
  const quotes = all(`SELECT q.*, r.title, r.city, r.status AS request_status FROM quotes q JOIN requests r ON r.id = q.request_id
    WHERE q.artisan_id = ? ORDER BY q.created_at DESC`, req.user.id);
  const insuranceExpired = artisan.insurance_valid_until && artisan.insurance_valid_until < new Date().toISOString().slice(0, 10);
  res.render('artisan-dashboard', { title: 'Espace artisan', artisan, matching, quotes, complete: profileComplete(artisan), insuranceExpired, STATUS });
});

router.get('/espace-artisan/profil', requireRole('artisan'), (req, res) => {
  const artisan = artisanOf(req.user.id);
  const portfolio = all('SELECT * FROM portfolio WHERE artisan_id = ? ORDER BY id DESC', req.user.id);
  res.render('artisan-edit', { title: 'Mon profil artisan', artisan, values: artisan, portfolio, error: null });
});

router.post('/espace-artisan/profil', requireRole('artisan'), (req, res) => {
  const v = req.body;
  const current = artisanOf(req.user.id);
  const trades = [].concat(v.trades || []).filter((t) => CATEGORIES[t]);
  const departments = String(v.departments || '').split(/[\s,;]+/).map((d) => d.trim().toUpperCase()).filter(Boolean);
  const siret = String(v.siret || '').replace(/\s/g, '');
  let error = null;
  if (!v.company?.trim()) error = "Indiquez le nom de votre entreprise.";
  else if (!isValidSiret(siret)) error = 'Numéro SIRET invalide (14 chiffres).';
  else if (!v.address?.trim()) error = "Indiquez l'adresse de votre entreprise.";
  else if (!trades.length) error = 'Choisissez au moins un métier.';
  else if (!departments.length || departments.some((d) => !/^(\d{2}|2A|2B|97\d)$/.test(d))) error = 'Indiquez vos départements d’intervention (ex. : 75, 92, 93).';
  else if (!v.insurer?.trim() || !v.policy_number?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(v.insurance_valid_until || '')) error = 'Les informations de votre assurance (assureur, n° de contrat, date de fin de validité) sont obligatoires.';
  if (error) {
    const portfolio = all('SELECT * FROM portfolio WHERE artisan_id = ? ORDER BY id DESC', req.user.id);
    return res.status(400).render('artisan-edit', { title: 'Mon profil artisan', artisan: current, values: { ...v, trades: trades.join(',') }, portfolio, error });
  }
  const depts = departments.map((d) => (d === '2A' || d === '2B' ? '20' : d)).filter((d, i, arr) => arr.indexOf(d) === i).join(',');
  // Toute modification des pièces justificatives fait repasser le profil en vérification.
  const keyChanged = siret !== current.siret || v.insurer.trim() !== current.insurer || v.policy_number.trim() !== current.policy_number
    || v.insurance_valid_until !== current.insurance_valid_until || String(v.qualification || '').trim() !== current.qualification;
  run(`UPDATE artisans SET company = ?, siret = ?, address = ?, trades = ?, departments = ?, bio = ?, qualification = ?,
      insurer = ?, policy_number = ?, insurance_valid_until = ?, insurance_area = ?,
      verified = CASE WHEN ? THEN 0 ELSE verified END, verified_at = CASE WHEN ? THEN NULL ELSE verified_at END
    WHERE user_id = ?`,
  v.company.trim(), siret, v.address.trim(), trades.join(','), depts, String(v.bio || '').trim().slice(0, 3000),
  String(v.qualification || '').trim(), v.insurer.trim(), v.policy_number.trim(), v.insurance_valid_until,
  String(v.insurance_area || '').trim() || 'France métropolitaine', keyChanged ? 1 : 0, keyChanged ? 1 : 0, req.user.id);
  req.flash('success', keyChanged && current.verified ? 'Profil enregistré. Vos justificatifs ont changé : votre profil repasse en vérification.'
    : keyChanged ? 'Profil enregistré. Notre équipe va vérifier votre SIRET et votre assurance.' : 'Profil enregistré.');
  res.redirect('/espace-artisan');
});

router.post('/espace-artisan/realisations', requireRole('artisan'), upload.array('photos', 5), (req, res) => {
  const files = req.files || [];
  if (!files.length) throw httpError(400, 'Ajoutez au moins une photo.');
  const caption = String(req.body.caption || '').trim().slice(0, 200);
  for (const f of files) run('INSERT INTO portfolio (artisan_id, filename, caption) VALUES (?, ?, ?)', req.user.id, f.filename, caption);
  req.flash('success', 'Réalisations ajoutées.');
  res.redirect('/espace-artisan/profil#realisations');
});

router.post('/espace-artisan/realisations/:id/supprimer', requireRole('artisan'), (req, res) => {
  const p = one('SELECT * FROM portfolio WHERE id = ? AND artisan_id = ?', req.params.id, req.user.id);
  if (p) { run('DELETE FROM portfolio WHERE id = ?', p.id); removeUploads([p.filename]); }
  res.redirect('/espace-artisan/profil#realisations');
});

function quoteContext(req) {
  const request = one('SELECT * FROM requests WHERE id = ?', req.params.id);
  const artisan = artisanOf(req.user.id);
  if (!request || !artisanMatches(artisan, request)) throw httpError(404, 'Demande introuvable.');
  if (request.status !== 'open') throw httpError(400, "Cette demande n'accepte plus de devis.");
  if (!artisan.verified) throw httpError(403, 'Votre profil doit être vérifié par Maisonia avant de pouvoir envoyer des devis.');
  if (artisan.insurance_valid_until < new Date().toISOString().slice(0, 10)) throw httpError(403, 'Votre attestation d’assurance a expiré : mettez-la à jour dans votre profil.');
  if (one('SELECT id FROM quotes WHERE request_id = ? AND artisan_id = ?', request.id, req.user.id)) throw httpError(400, 'Vous avez déjà envoyé un devis pour cette demande.');
  return { request, artisan };
}

router.get('/demandes/:id/devis/nouveau', requireRole('artisan'), (req, res) => {
  const { request } = quoteContext(req);
  res.render('quote-new', { title: 'Envoyer un devis', request, values: { vat_rate: '10', validity_days: '30', quote_free: '1', items: [{}, {}, {}] }, error: null });
});

const num = (x) => Number(String(x ?? '').replace(',', '.'));

router.post('/demandes/:id/devis/nouveau', requireRole('artisan'), (req, res) => {
  const { request } = quoteContext(req);
  const v = req.body;
  const raw = [].concat(v.items || []);
  const items = raw.filter((it) => it && String(it.label || '').trim())
    .map((it) => ({ label: it.label.trim(), unit: String(it.unit || 'forfait').trim(), qty: num(it.qty), unit_price_ht: num(it.unit_price_ht) }));
  const vat = num(v.vat_rate);
  const travel = num(v.travel_fee_ht || 0);
  const labour = num(v.labour_rate_ttc);
  const validity = parseInt(v.validity_days, 10);
  const free = v.quote_free === '1';
  const cost = free ? 0 : num(v.quote_cost);
  let error = null;
  if (!items.length) error = 'Ajoutez au moins une ligne détaillée (prestation ou fourniture).';
  else if (items.some((it) => !(it.qty > 0) || !(it.unit_price_ht >= 0))) error = 'Chaque ligne doit avoir une quantité et un prix unitaire valides.';
  else if (![0, 5.5, 10, 20].includes(vat)) error = 'Taux de TVA invalide.';
  else if (!(labour >= 0) || String(v.labour_rate_ttc || '').trim() === '') error = 'Le taux horaire de main-d’œuvre TTC est obligatoire.';
  else if (!String(v.time_method || '').trim()) error = 'Précisez les modalités de décompte du temps.';
  else if (!(travel >= 0)) error = 'Frais de déplacement invalides.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.start_date || '') || !String(v.duration || '').trim()) error = 'Indiquez la date de début et la durée estimée des travaux.';
  else if (!(validity >= 1 && validity <= 365)) error = 'Durée de validité invalide.';
  else if (!free && !(cost > 0)) error = 'Indiquez le coût du devis payant.';
  if (error) return res.status(400).render('quote-new', { title: 'Envoyer un devis', request, values: { ...v, items: raw.length ? raw : [{}] }, error });

  const round = (n) => Math.round(n * 100) / 100;
  const totalHt = round(items.reduce((s, it) => s + it.qty * it.unit_price_ht, 0) + travel);
  const totalTtc = round(totalHt * (1 + vat / 100));
  const id = tx(() => {
    const q = run(`INSERT INTO quotes (request_id, artisan_id, start_date, duration, labour_rate_ttc, time_method, travel_fee_ht, vat_rate,
        total_ht, total_ttc, validity_days, quote_free, quote_cost, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    request.id, req.user.id, v.start_date, v.duration.trim(), labour, v.time_method.trim(), travel, vat, totalHt, totalTtc,
    validity, free ? 1 : 0, cost, String(v.message || '').trim().slice(0, 2000));
    for (const it of items) run('INSERT INTO quote_items (quote_id, label, unit, qty, unit_price_ht) VALUES (?, ?, ?, ?, ?)', q.lastInsertRowid, it.label, it.unit, it.qty, it.unit_price_ht);
    return q.lastInsertRowid;
  });
  req.flash('success', 'Devis envoyé au particulier.');
  res.redirect(`/devis/${id}`);
});

module.exports = router;
