using System.Text.Json;
using BlueArchiveAPI.Configuration;

namespace Shittim_Server.Services
{
    public class ClientSteamOfflinePatchService : IHostedService
    {
        // NPA.Ex.Steam.ExternalPlatformSteam is where the login flow reaches Steamworks, and the two auth sites are inside its GetAuthToken. Each signature sits clear of the bytes it patches, so it still matches once applied and one lookup serves both apply and revert.
        // Steam itself still has to be running - offline mode is fine, but with SteamAPI_Init never called the SDK version reads back as 0 and NXPSteamHelper.ThrowIfPlatformNotSupported kills the prologue coroutine long before login.
        // Every pattern is masked with ?? over whole RIP-relative and rel32 operands. Steam restores GameAssembly.dll on each client update, so a literal displacement baked into a signature dies the moment the code around it shifts by one byte. That is what 1.93.453174 did: six of these seven sites stopped matching while their patch targets had not changed at all. Original and Patched are masked for the same reason - site 2's Original embeds the operands of the mov rdx,[rip+..] that follows it. A wildcard byte is never written, so it keeps whatever the shipping binary holds there.
        // ExpectedMatches is 2 for the price-failure pattern because GetEntitlementsAsJsonArray reaches RequestPrices through a display class of its own and the two sites compile to the same shape.
        private static readonly SteamOfflinePatch[] Patches =
        [
            // BLoggedOn wants a live connection, and offline it returns false, which lands on the branch that builds a failed result object.
            new(
                "steam.GetAuthToken.bypassBLoggedOn",
                Hex("48 8B 15 ?? ?? ?? ?? 48 89 F1 E8 ?? ?? ?? ?? 48 89 C6 31 C9"),
                20,
                Hex("E8 AD 35 01 00 84 C0"),
                Hex("90 90 90 90 90 31 C0"),
                1),

            // that branch sets Code 70010006 and Message "GetAuthToken Failed - SteamUser() is offline.", so zero the code and move both stores off Message (+18) onto AuthToken (+20). Message is only read back when Code is non-zero, and inface hands AuthToken straight on as the external ticket without looking at it. Reusing that literal rather than a nicer one is deliberate: il2cpp pins string literals per method and it is the only one this method already pins.
            new(
                "steam.GetAuthToken.tokenFromMessageLiteral",
                Hex("48 8B 0D ?? ?? ?? ?? E8 ?? ?? ?? ?? 48 85 C0 0F 84 ?? ?? ?? ?? 48 89 C7 48 89 C1 31 D2 E8 ?? ?? ?? ??"),
                34,
                Hex("C7 47 10 96 44 2C 04 48 8B 15 ?? ?? ?? ?? 48 89 F9 48 83 C1 18 48 89 57 18"),
                Hex("C7 47 10 00 00 00 00 48 8B 15 ?? ?? ?? ?? 48 89 F9 48 83 C1 20 48 89 57 20"),
                1),

            // GetPurchasableProduct and GetEntitlementsAsJsonArray both reach RequestPrices, the latter through a display class of its own, so with only one of the pair patched the shop still throws a 70012005 notice over the lobby. The cash shop will not draw until Steam quotes prices and a live connection is needed for that, so offline the callback reports failure and the answer is 70012005 with no products at all. Skip the failure branch and let it carry on to LoadItemDefinitions. Both sites are patched, hence ExpectedMatches.
            new(
                "steam.bypassPriceFailure.GetPurchasableProductAndGetEntitlementsAsJsonArray",
                Hex("48 8B 0D ?? ?? ?? ?? 83 B9 E0 00 00 00 00 75 05 E8 ?? ?? ?? ?? 48 89 F9 31 D2 E8 ?? ?? ?? ?? 84 DB"),
                33,
                Hex("74 69"),
                Hex("90 90"),
                2),

            // GetItemDefinitionIDs then fails the same way (70012001), so jump straight to the callback invoke. it sits after Products has been allocated but before anything that needs Steam, so the shop gets an empty dictionary and a zero Code - the tabs draw and the entries have no price. falling through into the item loop instead would reach Double.Parse on a price string Steam never filled in.
            new(
                "steam.GetPurchasableProduct.emptyItemDefinitions",
                Hex("0F 84 ?? ?? ?? ?? 4C 8D 44 24 44 31 D2 45 31 C9 E8 ?? ?? ?? ?? 84 C0"),
                23,
                Hex("0F 84 4C 03 00 00"),
                Hex("E9 6F 03 00 00 90"),
                1),

            // that leaves 70013004 from the GetAllItems leg: OnSteamInventoryResultReady only builds the details list when the Steam callback reports k_EResultOK, so offline it stays null. every failure path still carries Array.Empty in r12, so taking the branch unconditionally yields an empty list rather than null and the entitlements result comes back with a zero Code.
            new(
                "steam.OnSteamInventoryResultReady.detailsWhenResultFailed",
                Hex("49 83 C7 10 49 C7 46 10 ?? ?? ?? ?? 4C 89 F9 31 D2 E8 ?? ?? ?? ?? 83 FB 01"),
                25,
                Hex("75 38"),
                Hex("90 90"),
                1),

            // none of the above is reached with the adapter itself down rather than Steam merely put into offline mode: Application.internetReachability reads NotReachable and UIPatchDownload's enter-game precheck opens popup_message_network_error over the title screen before a single request goes out. it is the only read of internetReachability in the whole assembly, and loopback stays up with every adapter disabled, so dropping the branch lets the flow carry on to the server config it fetches from us.
            // The body lives in the compiler-generated state machine UIPatchDownload+<PreCheckForEnterGame>d__41.MoveNext, whose old signature lost the `48 89 C7` in front of the compare, so the whole shape stopped matching. Anchor on the call itself instead: the getter has exactly one call site in the image, which makes this the one pattern here that is unique by construction rather than by luck.
            new(
                "patchDownload.PreCheckForEnterGame.ignoreUnreachable",
                Hex("31 C9 E8 ?? ?? ?? ?? 85 C0"),
                9,
                Hex("74 3D"),
                Hex("90 90"),
                1)
        ];

        private readonly ILogger<ClientSteamOfflinePatchService> logger;
        private string gameAssemblyPath;

        public ClientSteamOfflinePatchService(ILogger<ClientSteamOfflinePatchService> logger)
        {
            this.logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            try
            {
                gameAssemblyPath = GetGameAssemblyPath();

                if (string.IsNullOrWhiteSpace(gameAssemblyPath) || !File.Exists(gameAssemblyPath))
                {
                    logger.LogWarning("GameAssembly.dll not found for the Steam offline patch: {GameAssemblyPath}", gameAssemblyPath);
                    return Task.CompletedTask;
                }

                if (!IsEnabled())
                {
                    Revert();
                    logger.LogInformation("Steam offline patch disabled");
                    return Task.CompletedTask;
                }

                Apply();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to apply the Steam offline patch");
            }

            return Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            try
            {
                Revert();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to revert the Steam offline patch");
            }

            return Task.CompletedTask;
        }

        private void Apply()
        {
            var data = File.ReadAllBytes(gameAssemblyPath);
            var applied = new List<SteamOfflinePatchEntry>();
            var pending = new List<(long Offset, BytePattern Target)>();
            var unresolved = new List<string>();

            foreach (var patch in Patches)
            {
                var sites = Locate(data, patch);
                if (sites.Count == 0)
                {
                    unresolved.Add(patch.Name);
                    continue;
                }

                foreach (var offset in sites)
                {
                    applied.Add(new SteamOfflinePatchEntry
                    {
                        Name = patch.Name,
                        Offset = offset,
                        Original = Convert.ToBase64String(Compose(data, offset, patch.Original)),
                        Patched = Convert.ToBase64String(Compose(data, offset, patch.Patched))
                    });

                    if (!MatchesAt(data, offset, patch.Patched))
                        pending.Add((offset, patch.Patched));
                }
            }

            if (applied.Count == 0)
            {
                logger.LogWarning("No Steam offline patch signatures matched: {GameAssemblyPath}", gameAssemblyPath);
                return;
            }

            // A partially matched table is the failure mode a client update produces, and it used to pass silently while the game came up broken, so say which sites are stale.
            if (unresolved.Count > 0)
                logger.LogWarning("Steam offline patch could not be located for {UnresolvedPatches} - the client build has probably changed and the signatures need re-anchoring", string.Join(", ", unresolved));

            if (pending.Count > 0)
            {
                using var stream = File.Open(gameAssemblyPath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read);
                foreach (var (offset, target) in pending)
                {
                    var patched = Compose(data, offset, target);
                    stream.Position = offset;
                    stream.Write(patched, 0, patched.Length);
                }

                stream.Flush(true);
            }

            File.WriteAllText(GetStatePath(), JsonSerializer.Serialize(new SteamOfflinePatchState
            {
                GameAssemblyPath = gameAssemblyPath,
                Patches = applied
            }, JsonOptions));

            if (pending.Count == 0)
                logger.LogInformation("Steam offline patch already applied at {SiteCount} sites: {GameAssemblyPath}", applied.Count, gameAssemblyPath);
            else
                logger.LogInformation("Applied the Steam offline patch at {SiteCount} sites: {GameAssemblyPath}", pending.Count, gameAssemblyPath);
        }

        private void Revert()
        {
            if (!File.Exists(gameAssemblyPath))
                return;

            var data = File.ReadAllBytes(gameAssemblyPath);
            var restore = new List<(long Offset, BytePattern Target)>();

            foreach (var patch in Patches)
            {
                foreach (var offset in Locate(data, patch))
                {
                    if (MatchesAt(data, offset, patch.Patched))
                        restore.Add((offset, patch.Original));
                }
            }

            if (restore.Count > 0)
            {
                using var stream = File.Open(gameAssemblyPath, FileMode.Open, FileAccess.ReadWrite, FileShare.Read);
                foreach (var (offset, target) in restore)
                {
                    var original = Compose(data, offset, target);
                    stream.Position = offset;
                    stream.Write(original, 0, original.Length);
                }

                stream.Flush(true);
                logger.LogInformation("Reverted the Steam offline patch at {SiteCount} sites: {GameAssemblyPath}", restore.Count, gameAssemblyPath);
            }

            var statePath = GetStatePath();
            if (File.Exists(statePath))
                File.Delete(statePath);
        }

        /// Returns the validated patch sites, or an empty list when the pattern does not resolve to exactly the sites the table expects. Candidates are accepted on a masked compare against the pattern that follows, so the signature itself only has to be narrowing, not exact.
        private List<long> Locate(byte[] data, SteamOfflinePatch patch)
        {
            var sites = new List<long>();

            foreach (var candidate in FindAll(data, patch.Signature))
            {
                var offset = candidate + patch.PatchOffset;

                if (MatchesAt(data, offset, patch.Original) || MatchesAt(data, offset, patch.Patched))
                    sites.Add(offset);
            }

            if (sites.Count != patch.ExpectedMatches)
            {
                logger.LogWarning("Steam offline patch {PatchName} resolved to {SiteCount} sites, expected {ExpectedMatches}", patch.Name, sites.Count, patch.ExpectedMatches);
                return [];
            }

            return sites;
        }

        private static bool MatchesAt(byte[] data, long offset, BytePattern pattern)
        {
            if (offset < 0 || offset + pattern.Length > data.Length)
                return false;

            for (var i = 0; i < pattern.Length; i++)
            {
                if (pattern.Values[i] is byte expected && data[offset + i] != expected)
                    return false;
            }

            return true;
        }

        /// Wildcard bytes keep the value already in the file, so a pattern never has to know a displacement that moves between builds.
        private static byte[] Compose(byte[] data, long offset, BytePattern pattern)
        {
            var composed = new byte[pattern.Length];

            for (var i = 0; i < pattern.Length; i++)
                composed[i] = pattern.Values[i] ?? data[offset + i];

            return composed;
        }

        private static List<long> FindAll(byte[] data, BytePattern pattern)
        {
            var matches = new List<long>();
            var (anchorStart, anchorLength) = pattern.Anchor();

            if (anchorLength == 0)
                return matches;

            var anchor = new byte[anchorLength];
            for (var i = 0; i < anchorLength; i++)
                anchor[i] = pattern.Values[anchorStart + i]!.Value;

            var span = data.AsSpan();
            var search = 0;

            while (search <= span.Length - anchorLength)
            {
                var index = span[search..].IndexOf(anchor);
                if (index < 0)
                    break;

                var candidate = search + index - anchorStart;
                if (MatchesAt(data, candidate, pattern))
                    matches.Add(candidate);

                search += index + 1;
            }

            return matches;
        }

        private static bool IsEnabled()
        {
            var value = Environment.GetEnvironmentVariable("SHITTIM_AUTO_PATCH_STEAM_OFFLINE");
            return bool.TryParse(value, out var enabled)
                ? enabled
                : Config.Instance.ServerConfiguration.AutoPatchClientSteamOffline;
        }

        private static string GetGameAssemblyPath()
        {
            var configuredPath = Environment.GetEnvironmentVariable("SHITTIM_CLIENT_GAMEASSEMBLY_PATH");
            if (string.IsNullOrWhiteSpace(configuredPath))
                configuredPath = Config.Instance.ServerConfiguration.ClientGameAssemblyPath;

            if (!string.IsNullOrWhiteSpace(configuredPath))
                return Path.IsPathRooted(configuredPath) ? configuredPath : Path.GetFullPath(configuredPath);

            return SteamGameLocator.FindGameFile("GameAssembly.dll") ?? "";
        }

        private string GetStatePath()
        {
            return $"{gameAssemblyPath}.shittim_steam_offline_patch.json";
        }

        /// Parses a space-separated hex pattern. A `??` token is a wildcard: it matches any byte and is never written back.
        private static BytePattern Hex(string hex)
        {
            var values = hex
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x == "??" ? (byte?)null : Convert.ToByte(x, 16))
                .ToArray();

            return new BytePattern(values);
        }

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true
        };

        private sealed record BytePattern(byte?[] Values)
        {
            public int Length => Values.Length;

            /// Longest run of fixed bytes, used as the needle for the wildcard scan.
            public (int Start, int Length) Anchor()
            {
                var bestStart = 0;
                var bestLength = 0;
                var i = 0;

                while (i < Values.Length)
                {
                    if (Values[i] is null)
                    {
                        i++;
                        continue;
                    }

                    var start = i;
                    while (i < Values.Length && Values[i] is not null)
                        i++;

                    if (i - start > bestLength)
                    {
                        bestStart = start;
                        bestLength = i - start;
                    }
                }

                return (bestStart, bestLength);
            }
        }

        private sealed record SteamOfflinePatch(string Name, BytePattern Signature, int PatchOffset, BytePattern Original, BytePattern Patched, int ExpectedMatches);

        private sealed class SteamOfflinePatchState
        {
            public string GameAssemblyPath { get; set; } = "";
            public List<SteamOfflinePatchEntry> Patches { get; set; } = [];
        }

        private sealed class SteamOfflinePatchEntry
        {
            public string Name { get; set; } = "";
            public long Offset { get; set; }
            public string Original { get; set; } = "";
            public string Patched { get; set; } = "";
        }
    }
}
