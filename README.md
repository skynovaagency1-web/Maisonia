# Maisonia

Maisonia met en relation les particuliers avec des artisans vérifiés près de chez eux pour leurs travaux de plomberie, d'électricité, de peinture et leurs petits travaux.

Première version (pilote) : gratuite, sans paiement en ligne.

## Fonctionnalités

**Particuliers**
- Publier une demande de travaux (métier, description, jusqu'à 5 photos, lieu, date souhaitée) avec consentement et information RGPD.
- Recevoir et comparer les devis des artisans vérifiés du secteur (prix, avis, délais).
- Accepter un devis : les coordonnées sont alors échangées avec l'artisan choisi (avant, l'adresse exacte et le téléphone restent privés).
- Marquer les travaux terminés et laisser un avis.
- Supprimer son compte et toutes ses données.

**Artisans**
- Profil professionnel : entreprise, SIRET (contrôle de format), adresse, métiers, départements d'intervention, qualifications, assurance décennale (assureur, contrat, validité, couverture), présentation.
- Portfolio de réalisations (photos).
- Tableau de bord des demandes correspondant à leurs métiers et départements.
- Envoi de devis comportant les mentions obligatoires des devis de travaux : date, entreprise et client, lieu d'exécution, décompte détaillé (quantités, unités, prix unitaires), taux horaire TTC, modalités de décompte du temps, frais de déplacement, totaux HT/TTC et TVA, durée de validité, devis gratuit ou payant, et rappel de l'assurance décennale.

**Administration**
- Vérification manuelle des artisans (lien direct vers l'annuaire des entreprises) : seuls les artisans vérifiés, avec une assurance en cours de validité, peuvent envoyer des devis et apparaître dans l'annuaire.

## Démarrer

Prérequis : Node.js 22.13 ou plus récent (utilise le module SQLite intégré à Node).

```bash
npm install
npm run seed     # données de démonstration (facultatif)
npm start        # http://localhost:3000
npm test
```

Comptes de démonstration (mot de passe `maisonia123`) : `camille@maisonia.test` (particulier), `karim@`, `sophie@`, `thomas@maisonia.test` (artisans), `admin@maisonia.test` (admin).

En production, créez le compte administrateur avec `ADMIN_EMAIL` et `ADMIN_PASSWORD`, et définissez `SESSION_SECRET` et `NODE_ENV=production`.

| Variable | Rôle |
| --- | --- |
| `PORT` | Port HTTP (3000 par défaut) |
| `SESSION_SECRET` | Secret des cookies de session |
| `DB_FILE` | Chemin de la base SQLite (`data/maisonia.db` par défaut) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Compte administrateur créé au démarrage |

## Structure

- `src/` : application Express (`app.js`, routes par espace, base SQLite dans `db.js`)
- `views/` : pages EJS (en français)
- `public/style.css` : design (palette chaude, polices Jost, DM Sans et Plus Jakarta Sans auto-hébergées)
- `src/photos.js` : photos d'illustration Unsplash, à remplacer par vos visuels
- `uploads/` : photos envoyées par les utilisateurs

## Avant la mise en ligne

- Compléter les mentions entre crochets dans `views/legal/` (éditeur, hébergeur, contact RGPD) et faire relire les conditions d'utilisation.
- Remplacer les photos Unsplash par des visuels hébergés sur le site.
- Les sessions sont gardées en mémoire : prévoir un stockage persistant (ex. SQLite ou Redis) pour plusieurs serveurs.
- Ajouter l'envoi d'e-mails (nouvelle demande, nouveau devis, devis accepté) et la réinitialisation du mot de passe.
