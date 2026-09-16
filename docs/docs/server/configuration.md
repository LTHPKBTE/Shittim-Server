---
id: configuration
title: Configuration reference
---

`Config.json` sits in `Config/` next to the server executable and is generated on the first run. The Control Center's Configuration page edits the same file.

The file has three sections. `ServerConfiguration` is the one that matters; `Irc` and `DataFetcher` are small and rarely touched.

## ServerConfiguration

### Version

| Key | Default | Meaning |
| --- | --- | --- |
| `GameVersion` | `1.90.439170` | client version string |
| `AuthCurrentVersion` | `446690` | data build number reported as `Account_Auth.CurrentVersion`. The official server answers its latest build regardless of the client's |
| `OverrideVersionId` | null | pin the data version instead of resolving it |
| `OverrideCdnBaseUrl` | null | pin the CDN |
| `ServerInfoUrl` | a CloudFront URL | where the version resolver looks |
| `AutoCheckVersion` | true | resolve the current version on boot |
| `AutoUpdateVersion` | true | follow it when it moves |
| `AutoUpdateResources` | true | re-download Excel and HexaMap data when the version changes |

### Networking

| Key | Default | Meaning |
| --- | --- | --- |
| `HostAddress` | `127.0.0.1` | |
| `HostPort` | `5000` | admin API and SDK |
| `GatewayPort` | `5100` | protocol traffic |
| `EnableGateway` | true | |
| `GatewayRsaPrivateKeyPem` / `Path` | empty | the login handshake key; normally loaded from `Config/GatewayPrivateKey.pem` |
| `GatewayRsaPublicKeyPem` / `Path` | empty | the public half, patched into the client's metadata |

### Outbound proxy

| Key | Default | Meaning |
| --- | --- | --- |
| `OutboundProxyUrl` | empty | proxy for the server's own outbound requests |
| `OutboundProxyBypass` | empty | hosts that skip that proxy: `host`, `.suffix`, `*.suffix`, `host:port`, or `*`. Only read when a URL is set |
| `OutboundProxyUseSystem` | true | read only when the URL is empty: leave the machine's own proxy setting in charge, exactly as `HttpClient` does by default. Off makes every outbound request go direct |

Every request is answered by the first of these that applies:

1. **This server's own addresses are never proxied.** `localhost`, `*.localhost` and any literal loopback
   address - the gateway, the admin API, the SDK endpoints the client was pointed at - are answered here.
   A proxy is never handed one, whatever the two settings below say, and this comes first so that no
   combination of them can lose it.
2. With `OutboundProxyUrl` empty and `OutboundProxyUseSystem` true, which is the default, everything else is
   left to the machine's own proxy setting, exactly as a plain `HttpClient` would. **`OutboundProxyBypass`
   is not read in this mode** - the machine has a list of its own and that is the one that decides.
3. With an address set, that address takes every request `OutboundProxyBypass` does not name. The machine's
   setting and its list are not consulted at all.

The list is there to keep specific hosts off a proxy once you have configured one: something on the LAN the
proxy cannot reach, a host whose route out you want to be sure of, or another proxy. `*` bypasses everything,
which is a way of keeping the keys in the file while turning the proxy off. Remember that a promise like
`example.com` also covers `cdn.example.com`, because a suffix match is on the label boundary.

These settings cover **only the requests the server makes for itself**: the version check against PureAPK
and the Nexon patch API, the CDN downloads of `ExcelDB.db`, `Excel.zip` and `HexaMap.zip`, the
`ServerInfoUrl` lookup, the world raid coordinator, and the arena stats fetch. They are not a proxy for the
game. Everything the client asks for is answered by this server on loopback, and step 1 above is what keeps
that true - a request the server is meant to answer itself cannot be diverted to a proxy by a Windows proxy
setting that happens not to carry `<local>`.

The address is read per request, so the Control Center can change it while the server runs - a proxy that
comes up or goes down does not need a restart. A URL with no scheme is read as `http://`, credentials may
be inline (`http://user:pass@127.0.0.1:8080`), and `socks5` is accepted. Anything else is taken as a typo:
that request goes direct rather than failing every request over it.

The Control Center is not covered by any of this. It does its own fetching in Node, which ignores the
Windows proxy setting entirely.

### Client

| Key | Default | Meaning |
| --- | --- | --- |
| `ClientInstallDirectory` | empty | the install everything else is derived from. Blank means find it |
| `AutoPatchClientMetadata` | true | gateway public key and region label in `global-metadata.dat` |
| `AutoPatchClientSteamOffline` | **false** | lets the client hand out an external ticket with Steam offline or not running; rewrites `GameAssembly.dll`, which Steam restores on a file verify |
| `AutoPatchClientGamescaleIas` | true | `gamescale.core.dll` |
| `AutoPatchClientInfaceConfig` | true | the inface config file |
| `AutoManageGrap64` | true | grap64 plugin |
| `AutoPatchClientBanners` | true | recruitment banners into the client's `ExcelDB.db` |
| `AutoPatchClientStoreUrl` | true | sends the client's Steam store lookup to this server, so the shop currency check still answers with no route out |
| `RegionDisplayText` | empty | title-screen region label; blank restores the stock name |
| `Client*Path` | empty | per-file overrides, only needed when a file is not where the install directory implies |

### Data and database

| Key | Default | Meaning |
| --- | --- | --- |
| `SQLProvider` | `SQLite3` | |
| `SQLConnectionString` | `Data Source=shittim.sqlite3` | |
| `UseCustomExcel` | false | read Excel tables from a local override folder |
| `ExcelDbSqlCipherKey` | a 64-hex key | decrypts `ExcelDB.db`. Rotates between some game updates; overridable with `SHITTIM_EXCELDB_SQLCIPHER_KEY` |
| `ExcelDbSqlCipherLicense` | a base64 string | SQLCipher Commercial Edition licence string shipped in the client. The Community build handles the same ciphers, so nothing here uses it |

### Behaviour

| Key | Default | Meaning |
| --- | --- | --- |
| `UseEncryption` | false | packet encryption |
| `BypassAuthentication` | false | |
| `SelectedAccountId` | 0 | when nonzero, every login is answered with this account regardless of which publisher identity connects. 0 disables |
| `KoyukiIncident` | false | fills every cafe with Koyuki and swaps the lobby banner list for a single webview banner |
| `WorldRaidCoordinatorUrl` | `https://raid.shittem-server.com` | shared world raid coordinator. Empty means the raid runs off the cached manifest with a purely local HP pool |
| `AdminApiKey` | empty | shared secret for `/api/admin`, sent as `X-Admin-Key`. Empty restricts the admin surface to loopback, which is enough for the Control Center. Overridable with `SHITTIM_ADMIN_API_KEY` |

### PacketLogging

| Key | Default |
| --- | --- |
| `RequestPacket` | true |
| `ResponsePacket` | false |
| `ErrorPacket` | false |
| `WireDump` | true |

Wire dumping writes request and response bytes to `logs/wire-<date>.txt` in the same format as a packet capture, with the session key length and AES state alongside. It costs one buffered append per request and is the only way to compare a fault against a capture, which is why it defaults on.

## Environment variables

| Variable | Overrides |
| --- | --- |
| `SHITTIM_ADMIN_API_KEY` | `AdminApiKey` |
| `SHITTIM_EXCELDB_SQLCIPHER_KEY` | `ExcelDbSqlCipherKey` |
| `SHITTIM_CLIENT_EXCELDB_PATH` | the client's `ExcelDB.db` location |

## Other files

| File | Where | What |
| --- | --- | --- |
| `gacha_config.json` | one level above the build directory | rate overrides and the guaranteed pickup, hot-reloaded |
| the server notice | next to the build | notification flags and the login gate |
| the event schedule override | next to the build | which events are forced open |
| `worldraid_manifest.json` | next to the build | the cached world raid schedule |
| `Data/Mods/characters.json` | next to the build | the custom character registry |
