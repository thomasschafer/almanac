# Almanac

A personal collection of small, useful tools, starting with a UK take-home pay calculator. It
runs on a laptop and is reached from a phone over Tailscale.

- [Spec](docs/spec.md): what it does and why.

## Development

Requires Node 26 (`mise install` picks it up from `.tool-versions`).

```sh
npm ci
npm run dev:server   # API on :8791, with its data in .dev-data
npm run dev          # Vite dev server with the API proxied
npm run check        # type-check, lint, format check and unit tests
```

Development uses its own port and data directory, so it never touches the deployed copy of the
app or its data.

This repository is public. Never commit personal data, databases or exports.
