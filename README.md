# Maisonia

Maisonia met en relation les particuliers avec des artisans vérifiés près de chez eux pour leurs travaux de plomberie, d'électricité, de peinture et leurs petits travaux.

Première version (pilote) : gratuite, sans paiement en ligne.

## Fonctionnalités

**Particuliers**
- Publier une demande de travaux (métier, description, jusqu'à 5 photos, lieu, date souhaitée) avec consentement et information RGPD.
- Recevoir et comparer les devis des artisans vérifiés du secteur (prix, avis, délais).
- Accepter un devis : les coordonnées sont alors échangées avec l'artisan choisi (avant, l'adresse exacte et le téléphone restent privés).
- Marquer les travaux terminés et laisser un avis.
- Échanger avec l'artisan par la messagerie du devis.
- Supprimer son compte et toutes ses données ; mot de passe oublié par e-mail.

**Pages publiques** : annuaire, profils, pages locales « métier + ville » (ex. `/plombier/paris`), questions fréquentes, contact et signalements, tarifs artisans, sitemap.

**E-mails** : nouvelle demande (artisans du secteur), nouveau devis, devis accepté, nouveau message, profil vérifié, mot de passe oublié.

**Artisans**
- Profil professionnel : entreprise, SIRET (contrôle de format), adresse, métiers, départements d'intervention, qualifications, assurance décennale (assureur, contrat, validité, couverture), présentation.
- Portfolio de réalisations (photos).
- Tableau de bord des demandes correspondant à leurs métiers et départements.
- Messagerie avec le particulier sur chaque devis.
- Envoi de devis comportant les mentions obligatoires des devis de travaux : date, entreprise et client, lieu d'exécution, décompte détaillé (quantités, unités, prix unitaires), taux horaire TTC, modalités de décompte du temps, frais de déplacement, totaux HT/TTC et TVA, durée de validité, devis gratuit ou payant, et rappel de l'assurance décennale.

**Administration**
- Vérification manuelle des artisans (lien direct vers l'annuaire des entreprises) : seuls les artisans vérifiés, avec une assurance en cours de validité, peuvent envoyer des devis et apparaître dans l'annuaire.

## Hébergement

Le site tourne entièrement sur Cloudflare : Workers (application), D1 (base de données), R2 (photos). La mise en ligne pas à pas est décrite dans [DEPLOY.md](DEPLOY.md).

## Développement

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev        # http://localhost:8787 (Cloudflare en local : D1 et R2 simulés)
npm test
```

Mode Node.js seul (base SQLite dans `data/`, photos dans `uploads/`) : `npm run seed` puis `npm start` (http://localhost:3000). Comptes de démonstration (mot de passe `maisonia123`) : `camille@maisonia.test` (particulier), `karim@`, `sophie@`, `thomas@maisonia.test` (artisans), `admin@maisonia.test` (admin).

| Variable | Rôle |
| --- | --- |
| `SESSION_SECRET` | Secret des cookies de session (obligatoire en production) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Compte administrateur créé automatiquement |
| `APP_URL` | Adresse publique du site (liens des e-mails, sitemap) |
| `RESEND_API_KEY`, `MAIL_FROM` | Envoi des e-mails via Resend (sinon : table `outbox`) |
| `CONTACT_EMAIL` | Adresse qui reçoit les messages du formulaire de contact |

## Structure

- `src/app.js` : application Express, commune à Cloudflare et Node
- `src/worker.mjs` : point d'entrée Cloudflare (D1, R2) ; `src/server.js` : point d'entrée Node
- `src/routes/` : pages par espace (public, compte, particulier, artisan, admin)
- `views/` : gabarits EJS, précompilés par `npm run build` (Cloudflare interdit la compilation à la volée)
- `migrations/` : schéma de la base D1
- `public/` : CSS, polices auto-hébergées, favicon
- `src/photos.js` : photos d'illustration ; `src/seo.js` : métiers et villes des pages locales

## Avant la mise en ligne

- Compléter les mentions entre crochets dans `views/legal/` (éditeur, hébergeur, contact RGPD) et faire relire les conditions d'utilisation.
- Remplacer les photos Unsplash par des visuels hébergés sur le site.
- Configurer l'envoi des e-mails (Resend) et le domaine : voir DEPLOY.md.
