const app = require('./app');
const { one, run } = require('./db');
const { hashPassword } = require('./lib');

// Compte administrateur créé au démarrage si ADMIN_EMAIL et ADMIN_PASSWORD sont définis.
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD && !one('SELECT id FROM users WHERE email = ?', ADMIN_EMAIL.toLowerCase())) {
  run("INSERT INTO users (role, name, email, password_hash) VALUES ('admin', 'Administrateur', ?, ?)", ADMIN_EMAIL.toLowerCase(), hashPassword(ADMIN_PASSWORD));
  console.log(`Compte admin créé : ${ADMIN_EMAIL}`);
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Maisonia : http://localhost:${port}`));
