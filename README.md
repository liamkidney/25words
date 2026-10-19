# 25 Words or Less

Minimal word-list web app. Displays one list of ten words at a time with a **Next list** button. Progress is retained in browser local storage.

## Environments

- Production: https://liamkidney.github.io/25words/ — branch `main`.
- Development: https://liamkidney.github.io/25words/dev/ — branch `dev`.

The [GitHub Actions deploy workflow](.github/workflows/deploy.yml) checks out both branches, runs tests independently, builds each, and deploys both to GitHub Pages in a single artifact. Any push to `main` or `dev` triggers deployment.

## Data

The app reads 100 algorithmically generated ten-word lists from the `public.twentyfive_word_lists` table in the existing Blocks Supabase project. This is a separate read-only table; no changes to Blocks' own game tables are needed.

## Local development

```sh
npm install
npm test
npm run build
```

The browser app is static and requires no server-side secrets. Its Supabase publishable key is public, and database access is restricted through row-level security.
