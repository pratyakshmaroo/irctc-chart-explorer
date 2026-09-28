# IRCTC Chart Explorer

Live IRCTC Online Charts in the browser. Zero server — the page calls IRCTC directly from each visitor's own network, so there is no central IP to block. Free hosting on GitHub Pages.

## Run locally

```sh
nvm use   # or: export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
npm install
npm run dev
# open http://127.0.0.1:5173
```

## Build

```sh
npm run build   # writes frontend/dist/
npm run preview # serve the build locally
```

## Publish (GitHub Pages, free)

1. Push this repo to GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. Push to `main` — `.github/workflows/pages.yml` builds and deploys `frontend/dist/`.

## CLI (optional, Node debugging)

```sh
npm run chart -- 22637 24-09-2026 MAS --class 2A --from TUP --to CBE
npm test
```

## How it works

- `frontend/src/App.tsx` — 7-step UI: search → train → route → availability → coaches → berths → cross-boarding compare.
- `frontend/src/lib/chart/` — IRCTC clients + seat logic + free per-user `localStorage` cache (schedule 7d, journey 12h, coach 2h).
- `src/` — same logic for the Node CLI + tests. No server remains.
