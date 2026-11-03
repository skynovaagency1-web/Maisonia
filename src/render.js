// Rendu des gabarits précompilés (voir scripts/build-views.js).
const views = require('./views.generated');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };
const escapeFn = (s) => (s === undefined || s === null ? '' : String(s).replace(/[&<>"']/g, (c) => ESC[c]));

function resolve(from, p) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of p.split('/')) seg === '..' ? parts.pop() : seg !== '.' && parts.push(seg);
  return parts.join('/');
}

function render(name, locals) {
  const fn = views[name];
  if (!fn) throw new Error(`Gabarit introuvable : ${name}`);
  const include = (p, data) => render(resolve(name, p), data ? { ...locals, ...data } : locals);
  return fn(locals, escapeFn, include);
}

module.exports = { render };
