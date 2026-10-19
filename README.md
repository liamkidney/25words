# 25 Words or Less

Minimal word-list web app. Displays one list of ten words at a time with a **Next list** button. Progress is retained in browser local storage.

## Environments

- Production: https://liamkidney.github.io/25words/ — branch `main`.
- Development: https://liamkidney.github.io/25words/dev/ — branch `dev`.

The [Pages deployment workflow](.github/workflows/pages.yml) checks out both branches, runs tests independently, builds each, and deploys both to GitHub Pages in a single artifact. Pushes to `main` deploy both sites. Pushes to `dev` first run the [development validation workflow](.github/workflows/check-dev.yml), which triggers deployment only if validation passes.

## Data

The app reads 100 algorithmically generated ten-word lists from the `public.twentyfive_word_lists` table in the existing Blocks Supabase project. This is a separate read-only table; no changes to Blocks' own game tables are needed.

## Local development

```sh
npm install
npm test
npm run build
```

The browser app is static and requires no server-side secrets. Its Supabase publishable key is public, and database access is restricted through row-level security.

## Linear promotion policy

All changes are implemented and tested on `dev`. Production is an older, validated commit on the same ancestry. After inspecting the live development site, use GitHub Actions → **Promote validated Dev to Main** (Run workflow on `main`) to test and fast-forward `main` to the exact `dev` SHA; the Pages workflow publishes the released commit. Do not commit directly to `main`, cherry-pick or use squash/rebase merges for releases. If ancestry fails, reconcile into `dev` before retrying. Only the base URL, PWA name, cache namespace and revision are channel-specific.
