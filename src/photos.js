// Photos d'illustration (licence Unsplash, affichage via le CDN Unsplash).
// À remplacer par vos propres visuels : il suffit de changer les identifiants ci-dessous.
const u = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

const PHOTOS = {
  plomberie: [u('photo-1749532125405-70950966b0e5'), u('photo-1785682118449-21da8825754d')],
  electricite: [u('photo-1786411726572-d43a0e169d5f'), u('photo-1768321916877-8cf4e4ef7487')],
  peinture: [u('photo-1562259949-e8e7689d7828'), u('photo-1693985120993-e9b203ce7631'), u('photo-1671681739893-e8d027788284'), u('photo-1595640115473-714d7e80cb48')],
  'petits-travaux': [u('photo-1505798577917-a65157d3320a'), u('photo-1786204697642-328c597b6f05'), u('photo-1676311396794-f14881e9daaa')],
};
const HERO = u('photo-1768321915873-4032155d2605', 1600);

const photoFor = (category, i = 0) => {
  const list = PHOTOS[category] || PHOTOS['petits-travaux'];
  return list[Math.abs(i) % list.length];
};

module.exports = { PHOTOS, HERO, photoFor };
