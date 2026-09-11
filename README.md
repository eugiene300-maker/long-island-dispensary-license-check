# Long Island Dispensary License Check

Free lookup tool: type a Long Island (Nassau/Suffolk) dispensary name → see its NY OCM license number, status, type, and the date it opened to the public. Sponsored "Dispensary of the Week": Planet Nugg (Farmingdale).

Plain static site — no build step, no framework.

## Deploy (GitHub + Vercel)
1. Create a GitHub repo and upload everything in this folder.
   - Then move `update-licenses.yml` to `.github/workflows/update-licenses.yml` (on GitHub: Add file → Create new file → name it `.github/workflows/update-licenses.yml` and paste the contents). That's what makes the weekly auto-update run.
2. In Vercel: **Add New → Project → Import** the repo. Framework preset: **Other**. No build command, output directory = root.
3. Add your domain in Vercel, then search-and-replace `https://longislanddispensarycheck.com` (and `hello@longislanddispensarycheck.com`) across the files with your real domain/email.

## Weekly auto-update
`.github/workflows/update-licenses.yml` runs every Monday 9 AM ET. It calls `scripts/update-licenses.mjs`, which:
- pulls the latest Nassau/Suffolk dispensary licenses from the official NY OCM open-data API (data.ny.gov, dataset `jskf-tt3q`)
- rewrites `data/licenses.json` + `data/licenses.js`
- re-bakes the directory, stats and "Updated" date into `index.html`, and the sitemap date
- commits → Vercel redeploys automatically

Run it any time from GitHub → Actions → "Weekly license refresh" → Run workflow. If the state API fails or returns too little data, the job aborts and the last good data stays live.

## Forms (newsletter + contact)
Edit `FORM_ENDPOINT` at the top of `assets/js/site.js` (Formspree, Getform, Basin, etc.). Until set, forms open an email to `CONTACT_EMAIL`.

## Things to update by hand
- **Dispensary of the Week** (name, Google rating/review count + "as of" date, hours) lives in `index.html` (search `dispensary-of-the-week`), the footer of every page, and `assets/js/app.js` (`sponsorStrip`).
- Compliance: the 21+ age gate and NY cannabis warnings are included; have the sponsor's compliance contact review before launch.
