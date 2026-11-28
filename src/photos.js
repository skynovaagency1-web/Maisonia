// Photos d'illustration. Les visuels du site sont dans public/img/ (nom-s.webp : 600 px, nom-l.webp : 1100 px).
const own = (name, size = 's') => `/img/${name}-${size}.webp`;

const PHOTOS = {
  plomberie: [own('plombier-evier'), own('cuisine-robinet')],
  electricite: [own('electricien-disjoncteurs'), own('electricien-tableau')],
  peinture: [own('peintre-mur')],
  'petits-travaux': [own('pose-etageres')],
};
const HERO = own('cuisine-robinet', 'l');

const photoFor = (category, i = 0) => {
  const list = PHOTOS[category] || PHOTOS['petits-travaux'];
  return list[Math.abs(i) % list.length];
};

module.exports = { PHOTOS, HERO, photoFor };
