process.env.NODE_ENV = 'test';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../src/db');
const { nodeDriver } = require('../src/db-node');
const { setStorage } = require('../src/storage');
const { diskStorage } = require('../src/storage-node');
const { hashPassword, isValidSiret, departmentFromPostcode } = require('../src/lib');

db.setDriver(nodeDriver(':memory:'));
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'servizone-'));
setStorage(diskStorage(uploadDir));
const app = require('../src/app');

const one = (...a) => db.one(...a);
let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); fs.rmSync(uploadDir, { recursive: true, force: true }); });

function agent() {
  let cookies = {};
  return async (p, { form, body, method } = {}) => {
    const init = { method: method || (form || body ? 'POST' : 'GET'), redirect: 'manual', headers: {} };
    const c = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) init.headers.cookie = c;
    if (form) init.body = new URLSearchParams(form);
    if (body) init.body = body;
    const res = await fetch(base + p, init);
    for (const sc of res.headers.getSetCookie()) {
      const [kv] = sc.split(';');
      const i = kv.indexOf('=');
      cookies[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text(), type: res.headers.get('content-type') };
  };
}

test('helpers', () => {
  assert.equal(isValidSiret('99900000100001'), true);
  assert.equal(isValidSiret('99900000100002'), false);
  assert.equal(departmentFromPostcode('75011'), '75');
  assert.equal(departmentFromPostcode('97400'), '974');
  assert.equal(departmentFromPostcode('7501'), null);
});

test('pages publiques', async () => {
  const v = agent();
  for (const p of ['/', '/artisans', '/aide', '/contact', '/tarifs-artisans', '/plombier/paris', '/connexion', '/inscription', '/mot-de-passe-oublie', '/confidentialite', '/mentions-legales', '/conditions']) {
    assert.equal((await v(p)).status, 200, p);
  }
  assert.equal((await v('/plombier/lyon')).status, 404);
  const sm = await v('/sitemap.xml');
  assert.match(sm.type, /xml/);
  assert.ok(sm.text.includes('/electricien/montreuil'));
  assert.ok((await v('/robots.txt')).text.includes('Sitemap:'));
});

test('parcours complet : demande, devis, messages, acceptation, avis', async () => {
  await db.run("INSERT INTO users (role, name, email, password_hash) VALUES ('admin', 'Admin', 'admin@t.test', ?)", hashPassword('adminpass1'));
  const client = agent(); const pro = agent(); const other = agent(); const admin = agent();

  let r = await client('/inscription', { form: { role: 'client', name: 'Camille Durand', email: 'c@t.test', phone: '0612345678', password: 'secret123', cgu: '1' } });
  assert.equal(r.status, 302);

  // Artisan inscrit et vérifié avant la demande : il doit être prévenu par e-mail.
  await pro('/inscription', { form: { role: 'artisan', name: 'Karim B', email: 'k@t.test', phone: '0611111111', password: 'secret123', cgu: '1' } });
  r = await pro('/espace-artisan/profil', { form: { company: 'Benali Plomberie', siret: '999 000 001 00001', address: '2 rue Pro', trades: 'plomberie', departments: '75, 93', insurer: 'Assur', policy_number: 'X1', insurance_valid_until: '2099-01-01' } });
  assert.equal(r.status, 302);
  const proId = (await one("SELECT id FROM users WHERE email = 'k@t.test'")).id;
  assert.equal((await pro('/espace-artisan')).status, 200);

  await admin('/connexion', { form: { email: 'admin@t.test', password: 'adminpass1' } });
  assert.equal((await admin('/admin')).status, 200);
  await admin(`/admin/artisans/${proId}/verifier`, { form: { action: 'verifier' } });
  assert.equal((await one('SELECT verified FROM artisans WHERE user_id = ?', proId)).verified, 1);
  assert.ok(await one("SELECT id FROM outbox WHERE to_email = 'k@t.test' AND subject LIKE '%vérifié%'"));

  const fd = new FormData();
  Object.entries({ category: 'plomberie', title: 'Fuite évier', description: 'Fuite sous l’évier depuis une semaine, siphon à changer.', address: '1 rue Test', postcode: '75011', city: 'Paris', consent: '1' }).forEach(([k, v]) => fd.append(k, v));
  fd.append('photos', new Blob([Buffer.from('ffd8ffe000', 'hex')], { type: 'image/jpeg' }), 'a.jpg');
  r = await client('/demandes/nouvelle', { body: fd });
  assert.equal(r.status, 302);
  const reqId = r.location.split('/').pop();
  const photo = await one('SELECT filename FROM request_photos WHERE request_id = ?', reqId);
  assert.ok(photo);
  const img = await client(`/uploads/${photo.filename}`);
  assert.equal(img.status, 200);
  assert.match(img.type, /image\/jpeg/);
  assert.ok(await one("SELECT id FROM outbox WHERE to_email = 'k@t.test' AND subject LIKE 'Nouvelle demande%'"));

  const fd2 = new FormData(); fd2.append('category', 'plomberie');
  assert.equal((await client('/demandes/nouvelle', { body: fd2 })).status, 400);

  r = await pro(`/demandes/${reqId}`);
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes('1 rue Test'), "l'adresse du client reste masquée");

  await other('/inscription', { form: { role: 'artisan', name: 'Autre', email: 'o@t.test', phone: '0622222222', password: 'secret123', cgu: '1' } });
  await other('/espace-artisan/profil', { form: { company: 'Lyon Élec', siret: '99900000200009', address: 'Lyon', trades: 'electricite', departments: '69', insurer: 'A', policy_number: 'B', insurance_valid_until: '2099-01-01' } });
  assert.equal((await other(`/demandes/${reqId}`)).status, 404);
  assert.equal((await other(`/demandes/${reqId}/devis/nouveau`)).status, 404);

  const quote = { 'items[0][label]': 'Remplacement siphon', 'items[0][qty]': '1', 'items[0][unit]': 'forfait', 'items[0][unit_price_ht]': '100', 'items[1][label]': 'Joint', 'items[1][qty]': '2', 'items[1][unit]': 'pièce', 'items[1][unit_price_ht]': '5', travel_fee_ht: '20', vat_rate: '10', labour_rate_ttc: '60', time_method: 'Forfait', start_date: '2099-01-10', duration: '2 heures', validity_days: '30', quote_free: '1' };
  assert.equal((await pro(`/demandes/${reqId}/devis/nouveau`, { form: { ...quote, labour_rate_ttc: '' } })).status, 400);
  r = await pro(`/demandes/${reqId}/devis/nouveau`, { form: quote });
  assert.equal(r.status, 302);
  const q = await one('SELECT * FROM quotes WHERE request_id = ?', reqId);
  assert.equal(q.total_ht, 130);
  assert.equal(q.total_ttc, 143);
  assert.equal((await one('SELECT COUNT(*) AS n FROM quote_items WHERE quote_id = ?', q.id)).n, 2);
  assert.ok(await one("SELECT id FROM outbox WHERE to_email = 'c@t.test' AND subject LIKE 'Nouveau devis%'"));
  r = await client(`/devis/${q.id}`);
  for (const s of ['Date de rédaction', 'SIRET', 'Total HT', 'Total TTC', 'TVA', 'Taux horaire', 'Validité', 'gratuit', 'décennale', 'Frais de déplacement']) assert.ok(r.text.includes(s), `devis : « ${s} » manquant`);

  // Messagerie sur le devis.
  assert.equal((await client(`/devis/${q.id}/messages`, { form: { body: 'Pouvez-vous venir samedi ?' } })).status, 302);
  assert.equal((await pro(`/devis/${q.id}/messages`, { form: { body: 'Oui, à 10 h.' } })).status, 302);
  r = await pro(`/devis/${q.id}`);
  assert.ok(r.text.includes('Pouvez-vous venir samedi ?') && r.text.includes('Oui, à 10 h.'));
  assert.equal((await other(`/devis/${q.id}/messages`, { form: { body: 'intrus' } })).status, 404);
  assert.ok(await one("SELECT id FROM outbox WHERE to_email = 'c@t.test' AND subject LIKE 'Nouveau message%'"));

  r = await client(`/devis/${q.id}/accepter`, { form: {} });
  assert.equal(r.status, 302);
  assert.ok((await client(`/demandes/${reqId}`)).text.includes('0611111111'));
  assert.ok((await pro(`/demandes/${reqId}`)).text.includes('1 rue Test'));
  assert.ok(await one("SELECT id FROM outbox WHERE to_email = 'k@t.test' AND subject LIKE 'Votre devis est accepté%'"));

  assert.equal((await client(`/demandes/${reqId}/avis`, { form: { rating: '5' } })).status, 400);
  await client(`/demandes/${reqId}/terminer`, { form: {} });
  assert.equal((await client(`/demandes/${reqId}/avis`, { form: { rating: '5', comment: 'Parfait' } })).status, 302);
  assert.ok((await client(`/artisans/${proId}`)).text.includes('Parfait'));
  assert.ok((await client('/artisans?categorie=plomberie&departement=75')).text.includes('Benali Plomberie'));
  assert.ok((await client('/plombier/paris')).text.includes('Benali Plomberie'));

  r = await client('/compte/supprimer', { form: { password: 'secret123' } });
  assert.equal(r.status, 302);
  assert.equal((await one("SELECT COUNT(*) AS n FROM users WHERE email = 'c@t.test'")).n, 0);
  assert.equal((await one('SELECT COUNT(*) AS n FROM requests')).n, 0);
  assert.equal(fs.readdirSync(uploadDir).length, 0, 'photos supprimées');
});

test('mot de passe oublié', async () => {
  const u = agent();
  await u('/inscription', { form: { role: 'client', name: 'Léa', email: 'lea@t.test', phone: '0633333333', password: 'ancienmdp', cgu: '1' } });
  await u('/deconnexion', { form: {} });
  const r = await u('/mot-de-passe-oublie', { form: { email: 'lea@t.test' } });
  assert.ok(r.text.includes('Si un compte existe'));
  assert.ok((await u('/mot-de-passe-oublie', { form: { email: 'inconnu@t.test' } })).text.includes('Si un compte existe'));
  const mail = await one("SELECT body FROM outbox WHERE to_email = 'lea@t.test' AND subject LIKE 'Réinitialiser%'");
  const token = mail.body.match(/\/reinitialiser\/([\w-]+)/)[1];
  assert.equal((await u(`/reinitialiser/${token}`, { form: { password: 'nouveaumdp', password_confirm: 'autre' } })).status, 400);
  assert.equal((await u(`/reinitialiser/${token}`, { form: { password: 'nouveaumdp', password_confirm: 'nouveaumdp' } })).status, 302);
  assert.ok((await u(`/reinitialiser/${token}`)).text.includes("n'est plus valable"));
  assert.equal((await u('/connexion', { form: { email: 'lea@t.test', password: 'ancienmdp' } })).status, 401);
  assert.equal((await u('/connexion', { form: { email: 'lea@t.test', password: 'nouveaumdp' } })).status, 302);
});

test('contact et signalements', async () => {
  const v = agent();
  assert.equal((await v('/contact', { form: { name: 'Paul', email: 'pas-un-email', topic: 'question', body: 'Bonjour, une question.' } })).status, 400);
  const r = await v('/contact', { form: { name: 'Paul', email: 'paul@t.test', topic: 'artisan', reference: 'Benali', body: 'Artisan pas venu au rendez-vous.' } });
  assert.ok(r.text.includes('Message envoyé'));
  assert.ok(await one("SELECT id FROM contact_messages WHERE email = 'paul@t.test' AND topic = 'artisan'"));
});
