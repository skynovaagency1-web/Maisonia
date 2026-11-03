// Pages locales « métier + ville » pour le référencement. Zone pilote : Paris et petite couronne.
const TRADES = {
  plombier: { category: 'plomberie', label: 'Plombier', plural: 'plombiers', jobs: 'fuite, débouchage, chauffe-eau, robinetterie, sanitaires' },
  electricien: { category: 'electricite', label: 'Électricien', plural: 'électriciens', jobs: 'prises, tableau électrique, éclairage, mise aux normes' },
  peintre: { category: 'peinture', label: 'Peintre', plural: 'peintres', jobs: 'murs, plafonds, boiseries, enduits, papier peint' },
  'petits-travaux': { category: 'petits-travaux', label: 'Artisan petits travaux', plural: 'artisans pour petits travaux', jobs: 'montage de meubles, pose d’étagères, réparations' },
};
const CITIES = {
  paris: { name: 'Paris', department: '75' },
  'boulogne-billancourt': { name: 'Boulogne-Billancourt', department: '92' },
  nanterre: { name: 'Nanterre', department: '92' },
  montreuil: { name: 'Montreuil', department: '93' },
  'saint-denis': { name: 'Saint-Denis', department: '93' },
  vincennes: { name: 'Vincennes', department: '94' },
  creteil: { name: 'Créteil', department: '94' },
};
module.exports = { TRADES, CITIES };
