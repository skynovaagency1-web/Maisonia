# Put Servizone online with Cloudflare

Servizone runs entirely on Cloudflare:

- **Workers** runs the site (the code in `src/`, entry point `src/worker.mjs`).
- **D1** is the database (tables in `migrations/`).
- **R2** stores the photos customers and artisans upload.
- Static files (CSS, fonts) in `public/` are served directly by Cloudflare.

The free plan covers a pilot. R2 asks for a payment method, but its first 10 GB are free.

## 1. Merge the code

On GitHub, open the pull request and click **Merge**. Cloudflare deploys the `main` branch.

## 2. Create the database (D1)

1. Log in at https://dash.cloudflare.com.
2. Go to **Storage & Databases → D1 SQL Database → Create database**. Name it `servizone`.
3. Copy the **Database ID** shown on the database page.
4. Paste it into `wrangler.jsonc` in place of `00000000-0000-0000-0000-000000000000` (on GitHub, open the file, click the pencil icon, then **Commit changes**), or send it to Claude, who will do it.
5. Open the database's **Console** tab, paste the contents of `migrations/0001_init.sql` and click **Execute**. This creates the tables.

## 3. Create the photo storage (R2)

1. Go to **Storage & Databases → R2 Object Storage**. If asked, enable R2 by adding a payment method.
2. Click **Create bucket** and name it `servizone-photos`. Keep the defaults.

## 4. Connect the GitHub repository

1. Go to **Compute → Workers & Pages → Create → Import a repository**.
2. Connect GitHub if needed, then choose `skynovaagency1-web/Maisonia`.
3. Keep the suggested settings: project name `servizone`, build command empty, deploy command `npx wrangler deploy`, branch `main`.
4. Click **Create and deploy**. After a minute or two the site is live at `https://servizone.<your-account>.workers.dev`.

Every later merge on `main` redeploys automatically.

## 5. Add the secrets

In the `servizone` Worker, go to **Settings → Variables and Secrets → Add**. Choose the **Secret** type for each:

| Name | Value |
| --- | --- |
| `SESSION_SECRET` | A long random string (at least 32 characters). Keeps logins secure. |
| `ADMIN_EMAIL` | Your email, used to log in as administrator |
| `ADMIN_PASSWORD` | A strong password for the admin account |
| `CONTACT_EMAIL` | Where messages from the contact form are forwarded (optional) |
| `RESEND_API_KEY` | Email sending key (see step 7). Without it, emails are not sent. |

Click **Deploy** to apply them. The admin account is created on the first visit after the secrets are set.

## 6. Use your own domain

1. Add your domain (for example `servizone.fr`) to Cloudflare: **Websites → Add a site**, then follow the steps to change the nameservers at your registrar.
2. In the `servizone` Worker, go to **Settings → Domains & Routes → Add → Custom domain** and enter `servizone.fr` (and `www.servizone.fr` if you like).
3. If your domain isn't `servizone.fr`, change `APP_URL` and `MAIL_FROM` in `wrangler.jsonc` (links in emails and the sitemap use them).

## 7. Send emails (Resend)

Notifications (new job, new quote, accepted quote, messages, password reset) go through Resend, which has a free plan of 3,000 emails per month.

1. Create an account at https://resend.com.
2. Go to **Domains → Add domain**, enter your domain, and add the DNS records it shows in Cloudflare (**DNS → Records**).
3. Go to **API Keys → Create API key** and paste it as the `RESEND_API_KEY` secret (step 5).

## 8. Before opening to the public

- Fill in the `[brackets]` in `views/legal/` (company name, address, SIREN, host, contact email).
- Log in as admin at `/connexion`, then go to `/admin` to verify the first artisans.
- Replace the illustration photos in `src/photos.js` with your own.

## Working on the code locally

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local   # creates the local database
npm run dev                # http://localhost:8787, same setup as Cloudflare
npm test                   # automatic tests (Node.js 22.13+)
```

`npm start` also runs the site with plain Node.js (SQLite database in `data/`, photos in `uploads/`), and `npm run seed` loads demo accounts for that mode.
