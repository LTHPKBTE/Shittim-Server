# Shittim Server

A private server for Blue Archive's Steam release, written in C# on ASP.NET Core (.NET 10). Progress lives in a local SQLite database, and it's far enough along that the game is just playable: log in, pull, clear stages, decorate the cafe.

This is a downstream fork of [Neoexm/Shittim-Server](https://github.com/Neoexm/Shittim-Server). See [Credits and provenance](#credits-and-provenance) for exactly which upstream and community changes are in here.

Questions, bugs, support, or anything else: https://discord.gg/GANwPn9xX6 (the upstream project's Discord)

## Features

- Play without touching the official servers
- Pull on gacha banners with the real rates or custom rates, or set up whatever banner you want from the Control Center
- Replay the koyuki incident
- See hidden game notices
- Replay any old event and minigame
- Clear campaign stages: normal, hard, extra, sweeps, and strategy maps with a working enemy phase
- Decorate the cafe, save and load presets, and get rotating visitors to invite
- Claim daily/weekly missions, achievements and attendance rewards
- Craft, open item boxes and select tickets, and spend in the shops (AP, eligma, secret stones)
- Read the story at your own pace, or unlock all of it with one button
- Give yourself any student, item or currency through the admin panel, and send yourself mail
- Run as many accounts as you like from one install


## Installation

Grab Shittim Control Center from the [releases page](https://github.com/Neoexm/Shittim-Server/releases). It handles the whole setup: downloads the server, installs the .NET 10 SDK and mitmproxy if they're missing, and trusts the proxy's CA certificate. When the readiness card says everything is ok, press the start server button, wait for the server to start then launch Blue Archive from Steam.

The Control Center acts as the admin panel. accounts, inventory, mail, gacha, events, and all other features can be found there. The console also keeps itself, aswell as the server fully up to date

## Credits and provenance

Shittim Server was written by [Neoexm](https://github.com/Neoexm) and is developed at
[Neoexm/Shittim-Server](https://github.com/Neoexm/Shittim-Server). This repository is a derivative
that tracks that project and merges community work on top of it, so anything upstream you find
useful belongs to its original authors.

### Merged from [HollisMeynell/Shittim-Server](https://github.com/HollisMeynell/Shittim-Server)

Fork point `5f3910e`, merged as `Merge branch 'hollis/main'` (upstream tags `v2026.9.13` and `v2026.9.1-3.d2`).
Five commits, all confined to `ShittimControlCenter/` (the Electron admin app) — the .NET server,
the `Schale` library and every protocol handler are untouched:

- **Chinese localisation of the Control Center.** The UI is now built on [i18next](https://www.i18next.com/)
  with `src/locales/en.json` and `src/locales/zh-CN.json`, a `src/js/i18n.js` bootstrap, and a
  language picker in the Settings view that persists through the existing settings IPC channel.
- **One-click max out now covers gear.** The bulk "max characters" action runs the `max <student>`
  command for every student on the account, shows `(done/total)` progress, and now checks the
  command's actual output instead of trusting the HTTP status, so a student the account does not
  own is reported as a failure rather than a silent no-op.
- **Auto-update feed corrected.** `package.json` `build.publish.owner` was changed from `Neoexm` to
  `HollisMeynell`, so a packaged Control Center pulls its own updates from the fork's releases.
- **Assorted hardening.** `src/index.html` gained `'self'` in its CSP `connect-src`, a few renderer
  strings that were interpolated into `innerHTML` now go through `escapeHtml`, and two pages had a
  local variable named `t` shadowing the new translation function.

> **Known inconsistency carried in from the fork:** the constant
> `const GH = { owner: 'Neoexm', repo: 'Shittim-Server', branch: 'main' }` in
> `ShittimControlCenter/main.js` was *not* updated. It still drives the portable build's manual
> update check, its "open download page" button, the `codeload.github.com` source download used by
> **Install / update server**, and the `Neoexm/Shittim-Server - main` label shown in the project
> gate. So a packaged build self-updates from the fork while source installs still come from
> upstream. Point that constant wherever you actually want the server source to come from.

## Disclaimer

For educational and research purposes only. Not affiliated with Nexon.
