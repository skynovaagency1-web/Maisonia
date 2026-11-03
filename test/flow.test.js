process.env.DB_FILE = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { run, one } = require('../src/db');
const { hashPassword, isValidSiret, departmentFromPostcode } = require('../src/lib');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());

function agent() {
  let cookie = '';
  return async (path, { form, body, method } = {}) => {
    const init = { method: method || (form || body ? 'POST' : 'GET'), redirect: 'manual', headers: {} };
    if (cookie) init.headers.cookie = cookie;
    if (form) { init.body = new URLSearchParams(form); }
    if (body) init.body = body;
    const res = await fetch(base + path, init);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
}

test('helpers', () => {
  assert.equal(isValidSiret('99900000100001'), true);
  assert.equal(isValidSiret('99900000100002'), false);
  assert.equal(departmentFromPostcode('75011'), '75');
  assert.equal(departmentFromPostcode('97400'), '974');
  assert.equal(departmentFromPostcode('7501'), null);
});

test('parcours complet : demande, devis, acceptation, avis', async () => {
  run("INSERT INTO users (role, name, email, password_hash) VALUES ('admin', 'Admin', 'admin@t.test', ?)", hashPassword('adminpass1'));
  const client = agent(); const pro = agent(); const other = agent(); const admin = agent();

  // Client : inscription puis demande avec photo.
  let r = await client('/inscription', { form: { role: 'client', name: 'Camille Durand', email: 'c@t.test', phone: '0612345678', password: 'secret123', cgu: '1' } });
  assert.equal(r.status, 302);
  const fd = new FormData();
  Object.entries({ category: 'plomberie', title: 'Fuite évier', description: 'Fuite sous l’évier depuis une semaine, siphon à changer.', address: '1 rue Test', postcode: '75011', city: 'Paris', consent: '1' }).forEach(([k, v]) => fd.append(k, v));
  fd.append('photos', new Blob([Buffer.from('ffd8ffe000', 'hex')], { type: 'image/jpeg' }), 'a.jpg');
  r = await client('/demandes/nouvelle', { body: fd });
  assert.equal(r.status, 302);
  const reqId = r.location.split('/').pop();
  assert.equal(one('SELECT COUNT(*) AS n FROM request_photos').n, 1);

  // Consentement obligatoire.
  const fd2 = new FormData(); fd2.append('category', 'plomberie');
  assert.equal((await client('/demandes/nouvelle', { body: fd2 })).status, 400);

  // Artisan : inscription, profil, pas encore vérifié.
  await pro('/inscription', { form: { role: 'artisan', name: 'Karim B', email: 'k@t.test', phone: '0611111111', password: 'secret123', cgu: '1' } });
  r = await pro('/espace-artisan/profil', { form: { company: 'Benali Plomberie', siret: '999 000 001 00001', address: '2 rue Pro', trades: 'plomberie', departments: '75, 93', insurer: 'Assur', policy_number: 'X1', insurance_valid_until: '2099-01-01' } });
  assert.equal(r.status, 302);
  r = await pro(`/demandes/${reqId}`);
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes('1 rue Test'), "l'adresse du client reste masquée");
  assert.equal((await pro(`/demandes/${reqId}/devis/nouveau`)).status, 403);

  // Un artisan d'un autre secteur ne voit pas la demande.
  await other('/inscription', { form: { role: 'artisan', name: 'Autre', email: 'o@t.test', phone: '0622222222', password: 'secret123', cgu: '1' } });
  await other('/espace-artisan/profil', { form: { company: 'Lyon Élec', siret: '99900000200009', address: 'Lyon', trades: 'electricite', departments: '69', insurer: 'A', policy_number: 'B', insurance_valid_until: '2099-01-01' } });
  assert.equal((await other(`/demandes/${reqId}`)).status, 404);

  // Admin vérifie l'artisan.
  await admin('/connexion', { form: { email: 'admin@t.test', password: 'adminpass1' } });
  const proId = one("SELECT id FROM users WHERE email = 'k@t.test'").id;
  await admin(`/admin/artisans/${proId}/verifier`, { form: { action: 'verifier' } });
  assert.equal(one('SELECT verified FROM artisans WHERE user_id = ?', proId).verified, 1);

  // Devis : mentions obligatoires contrôlées et totaux calculés côté serveur.
  const quote = { 'items[0][label]': 'Remplacement siphon', 'items[0][qty]': '1', 'items[0][unit]': 'forfait', 'items[0][unit_price_ht]': '100', travel_fee_ht: '20', vat_rate: '10', labour_rate_ttc: '60', time_method: 'Forfait', start_date: '2099-01-10', duration: '2 heures', validity_days: '30', quote_free: '1' };
  assert.equal((await pro(`/demandes/${reqId}/devis/nouveau`, { form: { ...quote, labour_rate_ttc: '' } })).status, 400);
  r = await pro(`/demandes/${reqId}/devis/nouveau`, { form: quote });
  assert.equal(r.status, 302);
  const q = one('SELECT * FROM quotes WHERE request_id = ?', reqId);
  assert.equal(q.total_ht, 120);
  assert.equal(q.total_ttc, 132);
  r = await client(`/devis/${q.id}`);
  for (const s of ['Date de rédaction', 'SIRET', 'Total HT', 'Total TTC', 'TVA', 'Taux horaire', 'Validité', 'gratuit', 'décennale', 'Frais de déplacement']) assert.ok(r.text.includes(s), `devis : « ${s} » manquant`);

  // Le client accepte : les coordonnées s'échangent.
  r = await client(`/devis/${q.id}/accepter`, { form: {} });
  assert.equal(r.status, 302);
  assert.ok((await client(`/demandes/${reqId}`)).text.includes('0611111111'));
  assert.ok((await pro(`/demandes/${reqId}`)).text.includes('1 rue Test'));

  // Avis seulement après la fin des travaux.
  assert.equal((await client(`/demandes/${reqId}/avis`, { form: { rating: '5' } })).status, 400);
  await client(`/demandes/${reqId}/terminer`, { form: {} });
  assert.equal((await client(`/demandes/${reqId}/avis`, { form: { rating: '5', comment: 'Parfait' } })).status, 302);
  r = await client(`/artisans/${proId}`);
  assert.ok(r.text.includes('Parfait'));
  assert.ok((await client('/artisans?categorie=plomberie&departement=75')).text.includes('Benali Plomberie'));

  // Suppression du compte client (RGPD).
  r = await client('/compte/supprimer', { form: { password: 'secret123' } });
  assert.equal(r.status, 302);
  assert.equal(one("SELECT COUNT(*) AS n FROM users WHERE email = 'c@t.test'").n, 0);
  assert.equal(one('SELECT COUNT(*) AS n FROM requests').n, 0);
});
