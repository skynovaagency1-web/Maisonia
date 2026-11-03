// Envoi des e-mails via l'API HTTP de Resend (fonctionne sur Cloudflare Workers comme sur Node).
// Sans RESEND_API_KEY (développement, tests), les e-mails sont enregistrés dans la table « outbox ».
const { run } = require('./db');

const cfg = () => ({
  key: process.env.RESEND_API_KEY,
  from: process.env.MAIL_FROM || 'Servizone <noreply@servizone.fr>',
  url: (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
});
const link = (p) => cfg().url + p;

async function send(to, subject, lines) {
  const { key, from, url } = cfg();
  const text = [...lines, '', '—', "L'équipe Servizone", url].join('\n');
  if (!key) {
    await run('INSERT INTO outbox (to_email, subject, body) VALUES (?, ?, ?)', to, subject, text);
    if (process.env.NODE_ENV !== 'test') console.log(`[e-mail] à ${to} : ${subject}`);
    return;
  }
  // Un e-mail qui échoue ne doit jamais bloquer l'action de l'utilisateur.
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!r.ok) console.error('Échec e-mail', to, r.status, await r.text());
  } catch (e) {
    console.error('Échec e-mail', to, e.message);
  }
}

module.exports = { send, link, get APP_URL() { return cfg().url; } };
