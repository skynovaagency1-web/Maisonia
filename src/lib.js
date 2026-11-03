const crypto = require('node:crypto');

const CATEGORIES = {
  plomberie: 'Plomberie',
  electricite: 'Électricité',
  peinture: 'Peinture',
  'petits-travaux': 'Petits travaux',
};

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Département à partir du code postal (97x/98x = 3 chiffres, Corse = 2A/2B regroupés en 20).
function departmentFromPostcode(pc) {
  const s = String(pc || '').trim();
  if (!/^\d{5}$/.test(s)) return null;
  return s.startsWith('97') || s.startsWith('98') ? s.slice(0, 3) : s.slice(0, 2);
}

// SIRET : 14 chiffres + clé de Luhn (exception La Poste, SIREN 356000000).
function isValidSiret(siret) {
  const s = String(siret || '').replace(/\s/g, '');
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith('356000000')) return [...s].reduce((a, c) => a + +c, 0) % 5 === 0;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = +s[13 - i];
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const euro = (n) => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const frDate = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR') : '');
const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

module.exports = { CATEGORIES, hashPassword, checkPassword, departmentFromPostcode, isValidSiret, euro, frDate, splitList };
