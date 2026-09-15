# Shittim Server

A private server for Blue Archive's Steam release, written in C# on ASP.NET Core (.NET 10). Progress lives in a local SQLite database, and it's far enough along that the game is just playable: log in, pull, clear stages, decorate the cafe.

This is a fork of [Neoexm/Shittim-Server](https://github.com/Neoexm/Shittim-Server), with the Chinese localisation and bulk "max character" fixes from [HollisMeynell/Shittim-Server](https://github.com/HollisMeynell/Shittim-Server) merged in. Updates and server source are pulled from this fork (`LTHPKBTE/Shittim-Server`).

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

Grab Shittim Control Center from this fork's [releases page](https://github.com/LTHPKBTE/Shittim-Server/releases). It handles the whole setup: downloads the server, installs the .NET 10 SDK and mitmproxy if they're missing, and trusts the proxy's CA certificate. When the readiness card says everything is ok, press the start server button, wait for the server to start then launch Blue Archive from Steam.

The Control Center acts as the admin panel. accounts, inventory, mail, gacha, events, and all other features can be found there. The console also keeps itself, aswell as the server fully up to date

## Credits

Written by [Neoexm](https://github.com/Neoexm) — see [Neoexm/Shittim-Server](https://github.com/Neoexm/Shittim-Server).
Forked and maintained here by [LTHPKBTE](https://github.com/LTHPKBTE/Shittim-Server), with the
Control Center localisation and bulk max-character fixes merged from
[HollisMeynell/Shittim-Server](https://github.com/HollisMeynell/Shittim-Server).

## Disclaimer

For educational and research purposes only. Not affiliated with Nexon.
