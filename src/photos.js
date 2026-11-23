// Photos d'illustration. Les visuels du site sont dans public/img/ (nom-s.webp : 600 px, nom-l.webp : 1100 px).
// L'électricité utilise encore une photo Unsplash, en attendant un visuel maison.
const own = (name, size = 's') => `/img/${name}-${size}.webp`;
const u = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

const PHOTOS = {
  plomberie: [own('plombier-evier'), own('cuisine-robinet')],
  electricite: [u('photo-1786411726572-d43a0e169d5f'), u('photo-1768321916877-8cf4e4ef7487')],
  peinture: [own('peintre-mur')],
  'petits-travaux': [own('pose-etageres')],
};
const HERO = own('cuisine-robinet', 'l');

const photoFor = (category, i = 0) => {
  const list = PHOTOS[category] || PHOTOS['petits-travaux'];
  return list[Math.abs(i) % list.length];
};

module.exports = { PHOTOS, HERO, photoFor };
