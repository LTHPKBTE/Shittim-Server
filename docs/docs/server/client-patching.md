---
id: client-patching
title: Client patching
---

The retail client talks to Nexon. Getting it to talk to loopback instead means editing the installed files, which the server does at startup as a set of hosted services. Every one of them is individually switchable from the Configuration page.

## Finding the install

`ClientInstallDirectory` blank means find it: Steam's own library folders are parsed first, then the conventional locations. Every other client path is derived from whatever that resolves to. Set it explicitly when there are two installs or when the game is somewhere Steam does not know about.

## What gets patched

| Patcher | File | What it changes |
| --- | --- | --- |
| Metadata | `global-metadata.dat` | the server's RSA public key, in three 150-byte chunks, and the region label |
| Gamescale IAS | `gamescale.core.dll` | the login endpoint |
| Inface config | the inface config file | endpoint configuration |
| Steam offline | `GameAssembly.dll` | off by default; lets the client hand out an external ticket with Steam offline |
| grap64 | the plugin directory | plugin management |
| Banners | the client's `ExcelDB.db` | recruitment banner rows |
| Region label | `global-metadata.dat` | the title-screen region name |
| Store URL | the client's store lookup | points it at this server so the shop currency check answers with no route out |

The `GameAssembly.dll` patcher is off by default because Steam restores that file on a verify, and a restored file means the patch is silently gone.

`ClientNativeIasPatchService`'s host-form stamp table carries a `live01` slot beside `live`, and
`stamp-live01-host-base` covers it. The route scan does not: the `/stamp/live` marker lands on the slot,
but the 32-byte `SlotLength` slices it to `.../stamp/liv`, which no longer holds the route, so
`LooksLikeSameIasSlot` rejects the candidate and the slot is dropped rather than reported. Without the entry
that slot keeps pointing at the real host while every other live slot in the module goes to loopback.

## The region label

The title-screen region name is not on the wire at all. It is the `ServerRegion` enum member **name** inside `global-metadata.dat`. Three things have to spell it identically - the enum member name, the standalone region literal, and the connection group name the server serves - or `Queuing_GetTicket` comes back with an empty gateway URL and the client hangs on the loading screen.

The same mechanism covers every other client-local string: rows in the client's localization table are keyed by a hash of the localization key, so patching a row is how you change any UI string that never crosses the wire.

## Signature matching and client updates

The native patches are anchored on byte signatures, not fixed offsets. A Steam auto-update replaces the DLL and silently un-applies every one of them. The symptom in `logs/log.txt` is:

```text
IAS binary patch target was not found: <name>
```

When that happens the signature has to be re-anchored against the new binary.

### Wildcards over the operands that move

A signature may only contain bytes the compiler is guaranteed to emit again. Rip-relative displacements and
`rel32` call or branch targets are not: they move whenever the code around them grows or shrinks. Every
pattern in `ClientSteamOfflinePatchService` - the signature and its `Original`/`Patched` pair alike - is
therefore written as hex with `??` over those operands. A wildcard byte matches anything and is never
written back, so it keeps whatever the shipping binary holds.

`SteamOfflinePatch` gained `ExpectedMatches`, and `Locate` returns every site a pattern resolves to instead
of insisting on exactly one. A site is accepted only when its bytes match `Original` or `Patched`, and a
pattern resolving to a count other than the one the table declares is reported and skipped - at that point
the candidate is a coincidence, and writing over it corrupts unrelated code. The price-failure entry has
`ExpectedMatches` 2, because `GetPurchasableProduct` and `GetEntitlementsAsJsonArray` reach `RequestPrices`
through display classes of their own and compile to the same instructions.

Apply and revert compose the wildcards from the file, so a displacement a patch does not own survives the
write. `patchDownload.PreCheckForEnterGame.ignoreUnreachable` anchors on the call to
`Application.get_internetReachability`, which has exactly one call site in the image, so that pattern is
unique by construction rather than by luck.

Patterns that resolve to nothing are named in a warning. Before, a table that matched only in part applied
what it could and said nothing.

## Banners and event dates

Two of the patchers write into the client's own `ExcelDB.db` rather than into a binary:

- the **banner patcher** writes recruitment banner rows
- the **event schedule** rewrites event date ranges so a chosen event reads as permanently open

Both are re-applied on every server start, because a client update replaces `ExcelDB.db` and takes them with it.

The client reads that database when it launches, so both need a game relaunch, not just a server restart. And because the file is locked while the game is running, neither can be applied with Blue Archive open.

## Undoing everything

Verify the game files through Steam. That restores every patched binary and the shipped `ExcelDB.db`, which also removes any custom characters - they live in that database. Turning the auto-patch switches off before the next server start stops them being re-applied.
