# Deployment

LockScope deploys as **two independent things**:

1. **The static dashboard** (HTML, JS, CSS, bundled JSON datasets) on a free static host.
2. **The Java engine** on each user's own computer, for running new benchmarks and checks.

The hosted dashboard never runs Java and never implies that it does: without a local engine it
shows bundled and imported results and labels every dataset with its source.

## 1. Build the dashboard

```bash
cd frontend
npm ci
npm run check     # type check, lint, format check, tests, production build
npm run preview   # serves dist/ on http://localhost:4173 for a final look
```

The output is `frontend/dist/`. It contains `_redirects` (single-page-app fallback) and
`_headers` (Content-Security-Policy and caching), both understood by Cloudflare Pages.

To serve from a sub-path (e.g. a GitHub Pages project site), build with
`BASE_PATH=/lockscope/ npm run build`.

## 2. GitHub Pages (the live deployment)

Live: **https://gthanishqreddy-hue.github.io/lockscope/**

`.github/workflows/pages.yml` builds and publishes the dashboard on every push to `main` that
touches `frontend/`. GitHub Pages is free for public repositories (subject to GitHub's published
usage limits) and needs no secrets: the workflow uses the repository's own token. Because Pages
cannot set headers or rewrites, the build:

- serves from the `/<repository>/` sub-path (`BASE_PATH`),
- embeds the Content-Security-Policy as a `<meta>` tag (`CSP_META=1`; `frame-ancestors` cannot be
  set this way),
- copies `index.html` to `404.html` so deep links load the app (with HTTP status 404).

One-time setup on a fork: **Settings → Pages → Build and deployment → Source: GitHub Actions**, then
push or run the workflow manually.

On a hosted copy the dashboard does not probe for a local engine until the visitor clicks
**Look for a local engine** (Settings, or any experiment form); after one successful connection it
keeps detecting automatically in that browser. This avoids failed requests and browser
local-network permission prompts for visitors who have no engine.

## 3. Vercel (alternative, free)

`frontend/vercel.json` configures Vercel's free Hobby plan when the project is linked to the GitHub
repository, so every push to `main` builds and redeploys it and pull requests get preview URLs.
It sets the build (`npm ci`, `npm run build`, output `dist`), the
single-page-app fallback and the same security headers as `_headers`. The commit hash and the
repository link shown in Settings are taken from Vercel's git environment variables.

To set it up on your own account:

1. Push the repository to GitHub.
2. Vercel dashboard → **Add New… → Project** → import the repository.
3. Set **Root Directory** to `frontend`; everything else comes from `vercel.json`.
4. Deploy. No payment details are needed on the Hobby plan; Vercel's fair-use limits apply and
   may change.

## 4. Cloudflare Pages (alternative, free)

Free-plan limits, as documented by Cloudflare on 2026-10-30
(<https://developers.cloudflare.com/pages/platform/limits/>): 500 builds per month, 1 concurrent
build, 20-minute build timeout, 20,000 files per site, 25 MiB per file, 100 custom domains per
project. That page lists no bandwidth or request limit for static assets, but this is Cloudflare's
policy to change; LockScope does not guarantee permanent free availability. The dashboard is about
1 MB and well under every limit. No payment details are needed for these steps.

### Option A: Git integration (no secrets in GitHub)

1. Push the repository to GitHub (public or private).
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, pick
   the repository.
3. Build settings:
   - Framework preset: *None* (or Vite)
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
   - Root directory: `frontend`
   - Environment variable `NODE_VERSION` = `22`
   - Optional: `VITE_REPO_URL` = your repository URL (enables documentation links in Settings)
4. Save and deploy. Every push to the production branch redeploys; pull requests get preview URLs.

### Option B: GitHub Actions

`.github/workflows/frontend-deploy.yml` deploys with Wrangler when you add the repository secrets
`CLOUDFLARE_API_TOKEN` (permission *Cloudflare Pages: Edit*) and `CLOUDFLARE_ACCOUNT_ID`, and the
repository variable `CF_PAGES_PROJECT`. Without the variable the job is skipped.

### Option C: direct upload

```bash
cd frontend && npm run build
npx wrangler pages deploy dist --project-name lockscope
```

## 5. Verify a deployment

- Open the site and each route directly (e.g. `/results`, `/learn/linearizability`): the
  `_redirects` fallback must serve the app, not a 404.
- Overview shows "Bundled sample" datasets; the Results Explorer lists them.
- Settings shows the build's commit and "Static (no engine connected)" unless you run an engine.
- Browser devtools: no console errors; response headers include `Content-Security-Policy`.

## 6. Using a deployed dashboard with a local engine

Start the engine with the deployed origin allowed:

```bash
cd engine && ./gradlew :server:run --args="--allowed-origins https://gthanishqreddy-hue.github.io"
```

Browsers increasingly restrict public websites from calling `localhost` (Chromium's Private
Network Access / Local Network Access may show a permission prompt or block the call; the server
answers the PNA preflight). If it is blocked, run the dashboard locally (`npm run dev`), which
always works, or use the CLI and import the JSON files.

## 7. Publishing updated results

```bash
cd engine && ./gradlew :bench:run --args="bench --profile set-balanced --out benchmark-results/sample/sets-balanced.json"
cd .. && node scripts/export-results.mjs benchmark-results/sample/*.json
git add benchmark-results/sample frontend/public/data && git commit -m "Update measured datasets"
```

## Troubleshooting deployments

| Symptom | Fix |
|---|---|
| Direct links to routes return 404 | `_redirects` missing from `dist/` (check `frontend/public/_redirects`); on hosts without `_redirects` support, configure an SPA fallback to `index.html` |
| Blank page, assets 404 under a sub-path | rebuild with `BASE_PATH=/your-path/` |
| "Bundled datasets unavailable" | `data/index.json` missing or blocked; rerun `scripts/export-results.mjs` |
| Build fails on Cloudflare with Node errors | set `NODE_VERSION=22` |
| Engine calls blocked from the deployed site | see section 6 |
