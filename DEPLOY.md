# Deploying Map Base Exporter to a web link

The app is 100% client-side (map tiles load straight from OpenFreeMap, no
backend, no API keys), so it can be hosted as a static site. Two routes:

## Option A - GitHub Pages (you mentioned GitHub)

This gives you a permanent link like
`https://<your-username>.github.io/map-base-exporter/`, and it rebuilds itself
every time you push a change. A deploy workflow is already included at
`.github/workflows/deploy.yml`.

Easiest path for a non-developer:

1. Install **GitHub Desktop** from https://desktop.github.com (a friendly app,
   no command line).
2. In GitHub Desktop: File -> Add local repository -> pick the
   `map-base-exporter` folder. It'll offer to create a repository - say yes,
   name it `map-base-exporter`, keep it public.
3. Click **Publish repository** to push it to GitHub.
4. On github.com open the new repo -> **Settings** -> **Pages** ->
   under "Build and deployment" set **Source = GitHub Actions**.
5. Wait ~2 minutes. The repo's **Actions** tab shows the build; when it's green,
   your link is live (also shown under Settings -> Pages).
6. From now on, any change you push (or I push) auto-deploys.

Note: keep the repo at the `map-base-exporter` folder level (not the whole
`Map Scrapper` folder), so the workflow and paths line up.

## Option B - Netlify Drop (zero setup, fastest)

No accounts-with-git, no command line:

1. On your machine run `npm run build` once (creates a `dist` folder).
2. Go to https://app.netlify.com/drop
3. Drag the `dist` folder onto the page. You get a live URL in seconds.
4. To update later, rebuild and drag the new `dist` again (or connect the
   GitHub repo for auto-deploys).

## Which I recommend

If you want a stable link you rarely touch: **Netlify Drop** is the least
hassle. If you want it tied to GitHub so updates publish automatically when the
code changes: **GitHub Pages** (Option A) - the workflow is already in place.

Either way the app behaves exactly as it does locally; nothing about the map or
export depends on a server.
