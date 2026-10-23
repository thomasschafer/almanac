# Agent notes

This app is maintained by agents, so keep it easy to change safely.

- The repo is public. Never commit personal data: no real salaries, balances or presets in code,
  tests, fixtures, screenshots or docs. Use obviously made-up figures. Databases and exports
  never belong in the repo; `scripts/check-no-data.sh` and gitleaks run in CI.
- TypeScript is strict everywhere. Validate data at every boundary with the zod schemas in
  `src/shared` and fail loudly on anything unexpected rather than guessing.
- The server runs TypeScript directly with Node's type stripping, so only erasable syntax is
  allowed (no enums, namespaces or parameter properties) and imports use `.ts` extensions.
- Money is whole pence (`Pence` in `src/shared/money.ts`) everywhere except at the edges where
  it's typed or shown.
- The take-home engine is pure and has no I/O. Every rule it applies comes from the tax-year data
  in `src/shared/take-home/rules/`, with its source; never hard-code a threshold or rate.
- Keep `docs/` current when behaviour changes. `docs/spec.md` is what the app does,
  `docs/design.md` how it looks, and `docs/operations.md` how it runs.
- Before pushing, run `npm run check`, then `npm run build && npm run test:e2e`.
