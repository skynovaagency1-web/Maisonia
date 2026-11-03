// Envoi des e-mails. Avec SMTP_URL (ex. smtps://user:pass@smtp.exemple.fr:465), les e-mails partent vraiment.
// Sans SMTP_URL (développement, tests), ils sont enregistrés dans la table « outbox » et affichés dans la console.
const nodemailer = require('nodemailer');
const { run } = require('./db');

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const FROM = process.env.MAIL_FROM || 'Maisonia <noreply@maisonia.fr>';
const APP_URL = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

const link = (p) => APP_URL + p;

function send(to, subject, lines) {
  const text = [...lines, '', '—', "L'équipe Maisonia", APP_URL].join('\n');
  if (!transport) {
    run('INSERT INTO outbox (to_email, subject, body) VALUES (?, ?, ?)', to, subject, text);
    if (process.env.NODE_ENV !== 'test') console.log(`[e-mail] à ${to} : ${subject}`);
    return Promise.resolve();
  }
  // Un e-mail qui échoue ne doit jamais bloquer l'action de l'utilisateur.
  return transport.sendMail({ from: FROM, to, subject, text }).catch((e) => console.error('Échec e-mail', to, e.message));
}

module.exports = { send, link, APP_URL };
