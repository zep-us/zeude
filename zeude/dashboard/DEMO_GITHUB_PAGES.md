# Demo-Only GitHub Pages

This branch is configured to publish a mock-data-only demo site from `zeude/dashboard` to GitHub Pages.

## Branch

- Deployment branch: `demo-gh-pages`

## What Is Included

- Demo routes only (`/demo/**`)
- Mock data only (no production data/API dependency)
- Static export (`out/`) for GitHub Pages

## Deploy

1. Push changes to `demo-gh-pages`.
2. In GitHub repo settings, enable **Pages** with **GitHub Actions** as the source.
3. Workflow `.github/workflows/demo-gh-pages.yml` will build and deploy automatically.

## Local Test

```bash
cd zeude/dashboard
npm ci
npm run build
npx serve out
```

Then open:

- `http://localhost:3000/<repo-name>/demo/landing/` (GitHub Pages base path simulation)
- or `http://localhost:3000/demo/landing/` depending on local server base path setup.
