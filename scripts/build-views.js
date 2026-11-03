// Précompile les gabarits EJS en fonctions JavaScript (Cloudflare Workers interdit eval / new Function).
// Résultat : src/views.generated.js, utilisé sur Node comme sur Cloudflare.
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..', 'views');
const KEYWORDS = new Set('break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof var void while with yield await async of undefined include locals'.split(' '));

// Variables lues par un gabarit : identifiants du code EJS, hors mots-clés, globales et noms déclarés dans le gabarit.
function localsOf(src) {
  const code = [...src.matchAll(/<%[-=_]?([\s\S]*?)[-_]?%>/g)].map((m) => m[1]).join('\n')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '""');
  const declared = new Set();
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+[{[]([^}\]]*)[}\]]/g)) m[1].split(',').forEach((x) => declared.add(x.split(':').pop().trim()));
  for (const m of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) declared.add(m[1]);
  const names = new Set();
  for (const m of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?!\s*:(?!:))/g)) {
    const n = m[1];
    if (!KEYWORDS.has(n) && !(n in globalThis) && !declared.has(n)) names.add(n);
  }
  return [...names];
}

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) walk(path.join(dir, f.name));
    else if (f.name.endsWith('.ejs')) files.push(path.join(dir, f.name));
  }
})(ROOT);

let out = '// Fichier généré par scripts/build-views.js : ne pas modifier.\n/* eslint-disable */\nmodule.exports = {\n';
for (const file of files.sort()) {
  const name = path.relative(ROOT, file).replace(/\\/g, '/').replace(/\.ejs$/, '');
  const src = fs.readFileSync(file, 'utf8');
  const t = new ejs.Template(src, { strict: true, _with: false, localsName: 'locals', destructuredLocals: localsOf(src), filename: file, compileDebug: false });
  t.compile(); // vérifie la syntaxe et produit t.source
  out += `  ${JSON.stringify(name)}: function (locals, escapeFn, include) {\n${t.source}},\n`;
}
out += '};\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'views.generated.js'), out);
console.log(`${files.length} gabarits compilés.`);
