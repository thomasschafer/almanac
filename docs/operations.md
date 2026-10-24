# Operations

How Almanac runs on the laptop.

## Running

On a Mac set up with [dotfiles](https://github.com/thomasschafer/dotfiles), there's nothing to do:
`dp` clones this repo, deploys it and runs it as the launchd agent
`org.nix-community.home.almanac`, which starts at login and restarts if it stops. Dotfiles also
serves it over Tailscale at the machine's bare address (`https://<machine>.<tailnet>.ts.net`),
which is what to open on a phone and add to the home screen.

To ship changes, push them to `main`, then run `deploy almanac`. It builds `main` in a fresh copy
and only restarts the agent if the build succeeds. `deploy almanac <ref>` deploys another commit,
such as an older one to roll back. Open apps pick up the new version when they're next opened or
brought back to the front, and at least hourly while they're open.

Without dotfiles, install Node 26, run `npm ci && npm run build && npm start`, and serve it with
`tailscale serve --bg --https=443 http://127.0.0.1:8790`.

## Access

The server only listens on `127.0.0.1`. When it starts, it asks Tailscale which login the Mac is
signed in as, and only answers API requests that Tailscale Serve marks as coming from that login.
A new machine therefore needs no configuration: sign in to Tailscale, then start the app. After
switching the Mac to another Tailscale login, restart the app so it picks up the new one. Changes must
also come from the app's own pages, sent as JSON: requests that browsers mark as coming from
another site, including the other apps on the machine, are refused. Behind Tailscale Serve, the
page's origin is checked against the `X-Forwarded-Host` and `X-Forwarded-Proto` that Serve sets. If
Tailscale isn't running when the app starts, it exits, and launchd tries again.

## Data and configuration

| What        | Where                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Database    | `~/.local/share/almanac/almanac.db` (override with `ALMANAC_DATA_DIR`) |
| Service log | `~/.local/state/almanac/server.log`                                    |

The database holds each tool's last state and its presets. It isn't backed up: losing it means
re-entering some figures. Nothing in it may ever be committed. The repo is public.

## Environment variables

| Variable                       | Purpose                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `ALMANAC_DATA_DIR`             | Where the database lives. Defaults to `~/.local/share/almanac`.                                        |
| `ALMANAC_HOST`, `ALMANAC_PORT` | Listen address. Defaults to `127.0.0.1:8790`; keep it on localhost.                                    |
| `ALMANAC_AUTH`                 | `tailscale` (default) or `none`, which accepts any request. Only for development and tests.            |
| `ALMANAC_LINKS`                | Other apps on the machine to link from the index, as JSON: `[{ "name", "description", "httpsPort" }]`. |
