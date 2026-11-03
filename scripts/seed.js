// Données de démonstration : npm run seed (efface la base existante). SIRET fictifs.
const fs = require('node:fs');
const path = require('node:path');
const dbFile = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'servizone.db');
for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) fs.rmSync(f, { force: true });

const { setDriver, run } = require('../src/db');
const { nodeDriver } = require('../src/db-node');
const { hashPassword } = require('../src/lib');
setDriver(nodeDriver(dbFile));

const pw = hashPassword('servizone123');
const user = async (role, name, email, phone) => Number((await run('INSERT INTO users (role, name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?)', role, name, email, pw, phone)).lastInsertRowid);
const inYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

(async () => {
  await user('admin', 'Équipe Servizone', 'admin@servizone.test', '0100000000');
  const artisans = [
    ['Karim Benali', 'karim@servizone.test', 'Benali Plomberie', '99900000100001', '12 rue Oberkampf, 75011 Paris', 'plomberie', '75,93,94', 'Plombier chauffagiste depuis 15 ans. Dépannage, salle de bain, chauffe-eau.', 'CAP Installateur sanitaire'],
    ['Sophie Martin', 'sophie@servizone.test', 'Atelier Couleurs', '99900000200009', '4 avenue de Paris, 94300 Vincennes', 'peinture,petits-travaux', '75,94', 'Peintre décoratrice : enduits, peinture intérieure, papier peint. Chantiers propres et soignés.', 'Qualibat 6111'],
    ['Thomas Leroy', 'thomas@servizone.test', 'Leroy Électricité', '99900000300007', '8 rue Gallieni, 92100 Boulogne-Billancourt', 'electricite', '75,92', 'Électricien certifié : mise aux normes NF C 15-100, tableaux, éclairage.', 'RGE Qualifelec'],
  ];
  const ids = [];
  for (const [i, [name, email, company, siret, address, trades, depts, bio, qual]] of artisans.entries()) {
    const id = await user('artisan', name, email, `06 12 34 56 7${i}`);
    await run(`INSERT INTO artisans (user_id, company, siret, address, trades, departments, bio, qualification, insurer, policy_number, insurance_valid_until, insurance_area, verified, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Assurances du Bâtiment', ?, ?, 'France métropolitaine', 1, datetime('now'))`,
    id, company, siret, address, trades, depts, bio, qual, `DEC-2026-${1000 + i}`, inYear);
    ids.push(id);
  }
  const client = await user('client', 'Camille Durand', 'camille@servizone.test', '06 98 76 54 32');
  const r1 = (await run(`INSERT INTO requests (client_id, category, title, description, address, postcode, city, department, status, created_at)
    VALUES (?, 'plomberie', 'Fuite sous l''évier de la cuisine', 'Une fuite goutte à goutte au niveau du siphon depuis une semaine. Le meuble sous évier commence à gonfler.', '23 rue de la Roquette', '75011', 'Paris', '75', 'open', datetime('now', '-1 day'))`, client)).lastInsertRowid;
  await run(`INSERT INTO requests (client_id, category, title, description, address, postcode, city, department)
    VALUES (?, 'peinture', 'Repeindre un salon de 20 m²', 'Murs et plafond à repeindre en blanc cassé, quelques fissures à reboucher. Hauteur sous plafond 2,70 m.', '23 rue de la Roquette', '75011', 'Paris', '75')`, client);
  const q = (await run(`INSERT INTO quotes (request_id, artisan_id, start_date, duration, labour_rate_ttc, time_method, travel_fee_ht, vat_rate, total_ht, total_ttc, validity_days, quote_free, message)
    VALUES (?, ?, date('now', '+3 days'), '2 heures', 66, 'Forfait, sans supplément si le temps est dépassé', 25, 10, 145, 159.5, 30, 1, 'Je peux passer en fin de semaine.')`, r1, ids[0])).lastInsertRowid;
  await run("INSERT INTO quote_items (quote_id, label, unit, qty, unit_price_ht) VALUES (?, 'Remplacement du siphon et des joints', 'forfait', 1, 90), (?, 'Siphon PVC 40 mm', 'pièce', 1, 30)", q, q);

  // Un chantier terminé avec avis, pour peupler les profils.
  const done = (await run(`INSERT INTO requests (client_id, category, title, description, address, postcode, city, department, status, created_at)
    VALUES (?, 'electricite', 'Ajout de deux prises dans la chambre', 'Ajouter deux prises doubles sur le mur côté lit, cloison en plaque de plâtre.', '23 rue de la Roquette', '75011', 'Paris', '75', 'done', datetime('now', '-30 days'))`, client)).lastInsertRowid;
  const q2 = (await run(`INSERT INTO quotes (request_id, artisan_id, start_date, duration, labour_rate_ttc, time_method, travel_fee_ht, vat_rate, total_ht, total_ttc, validity_days, quote_free, status)
    VALUES (?, ?, date('now', '-25 days'), '3 heures', 60, 'Au temps passé, sur la base du taux horaire', 20, 10, 200, 220, 30, 1, 'accepted')`, done, ids[2])).lastInsertRowid;
  await run("INSERT INTO quote_items (quote_id, label, unit, qty, unit_price_ht) VALUES (?, 'Pose de prises doubles encastrées', 'pièce', 2, 90)", q2);
  await run("INSERT INTO reviews (request_id, artisan_id, client_id, rating, comment) VALUES (?, ?, ?, 5, 'Ponctuel, propre et de bon conseil. Je recommande.')", done, ids[2], client);

console.log(`Base de démonstration créée : ${dbFile}
  Mot de passe pour tous les comptes : servizone123
  Particulier : camille@servizone.test
  Artisans    : karim@ (plomberie), sophie@ (peinture), thomas@ (électricité) — @servizone.test
  Admin       : admin@servizone.test`);
})();
