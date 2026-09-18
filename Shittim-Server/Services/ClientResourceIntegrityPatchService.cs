using System.Text.Json;
using BlueArchiveAPI.Configuration;

namespace Shittim_Server.Services
{
    public class ClientResourceIntegrityPatchService : IHostedService
    {
        // The client walks every file under PUB\Resource when the lobby comes up and compares a {length, crc32} record
        // from its own file table against what is on disk, length first: when the two lengths agree it never even opens
        // the file. A file it does open is hashed and, on a mismatch, a flag is set that a later pass turns into the
        // "Abnormal client." popup and a drop back to the title screen. Nothing else consumes that flag, which is what
        // makes skipping the branch safe rather than merely convenient.
        //
        // The server cannot win this comparison. ExcelDB.db ships at 326,123,520 bytes and the event schedule rewrite
        // leaves it at 326,156,288 - eight sqlite pages of rows the shipped table does not record - and the record's
        // crc32 is the shipped file's, not the modded one's. Rewriting the table the client actually reads has not been
        // possible: it is not TableCatalog.bytes (that stores {name, crc32} with no length at all and both of its
        // ExcelDB.db numbers differ from the client's), not MediaCatalog, not catalog_Windows, and not anything the
        // server serves. The one-byte branch below is what makes the shipped table stop mattering.
        //
        // Site: <Check>b__1, the per-file body of the pass. The compare against al is the length equality test and both
        // arms are already resolved - the je on the left skips to the clean exit at +0x77 while the fall-through opens
        // the file, hashes it and stores 1 at [obj+0x10] on a mismatch. Turning the conditional jump into an
        // unconditional one sends every file down the skip arm, so no file is ever opened and hashed and the flag is
        // never set. The following bytes are left alone; they are the FileInfo leg the skip arm jumps over.
        //
        // The signature is masked nowhere on purpose: the 21 bytes contain no RIP-relative or rel32 operand, so unlike
        // the Steam offline table there is no displacement that moves between builds, and the pattern is unique in the
        // image. Steam restores GameAssembly.dll on a file verify, and the whole table below is re-derived on the next
        // start, so a mismatch is reported rather than guessed at.
        private static readonly ResourceIntegrityPatch[] Patches =
        [
            new(
                "resource.integrityCheck.skipModifiedFiles",
                Hex("84 C0 74 77 48 8B 45 F8 48 85 C0 0F 84 9D 00 00 00 48 8B 78 10"),
                2,
                Hex("74 77"),
                Hex("EB 77"),
                1)
        ];

        private readonly ILogger<ClientResourceIntegrityPatchService> logger;
        private string gameAssemblyPath;

        public ClientResourceIntegrityPatchService(ILogger<ClientResourceIntegrityPatchService> logger)
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
                    logger.LogWarning("GameAssembly.dll not found for the resource integrity patch: {GameAssemblyPath}", gameAssemblyPath);
                    return Task.CompletedTask;
                }

                if (!IsEnabled())
                {
                    Revert();
                    logger.LogInformation("Resource integrity patch disabled");
                    return Task.CompletedTask;
                }

                Apply();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to apply the resource integrity patch");
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
                logger.LogError(ex, "Failed to revert the resource integrity patch");
            }

            return Task.CompletedTask;
        }

        private void Apply()
        {
            var data = File.ReadAllBytes(gameAssemblyPath);
            var applied = new List<ResourceIntegrityPatchEntry>();
            var pending = new List<(long Offset, BytePattern Target)>();

            foreach (var patch in Patches)
            {
                var sites = Locate(data, patch);
                if (sites.Count == 0)
                {
                    logger.LogWarning("Resource integrity patch {PatchName} could not be located - the client build has probably changed and the signature needs re-anchoring", patch.Name);
                    return;
                }

                foreach (var offset in sites)
                {
                    applied.Add(new ResourceIntegrityPatchEntry
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

            File.WriteAllText(GetStatePath(), JsonSerializer.Serialize(new ResourceIntegrityPatchState
            {
                GameAssemblyPath = gameAssemblyPath,
                Patches = applied
            }, JsonOptions));

            if (pending.Count == 0)
                logger.LogInformation("Resource integrity patch already applied at {SiteCount} site(s): {GameAssemblyPath}", applied.Count, gameAssemblyPath);
            else
                logger.LogInformation("Applied the resource integrity patch at {SiteCount} site(s): {GameAssemblyPath}", pending.Count, gameAssemblyPath);
        }

        private void Revert()
        {
            if (string.IsNullOrWhiteSpace(gameAssemblyPath) || !File.Exists(gameAssemblyPath))
                return;

            var data = File.ReadAllBytes(gameAssemblyPath);
            var restore = new List<(long Offset, BytePattern Target)>();

            foreach (var patch in Patches)
            {
                foreach (var offset in Locate(data, patch, quiet: true))
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
                logger.LogInformation("Reverted the resource integrity patch at {SiteCount} site(s): {GameAssemblyPath}", restore.Count, gameAssemblyPath);
            }

            var statePath = GetStatePath();
            if (File.Exists(statePath))
                File.Delete(statePath);
        }

        /// Returns the validated patch sites, or an empty list when the pattern does not resolve to exactly the sites the table expects. Candidates are accepted on a masked compare against either the original or the patched form, so one lookup serves both apply and revert.
        private List<long> Locate(byte[] data, ResourceIntegrityPatch patch, bool quiet = false)
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
                if (!quiet)
                    logger.LogWarning("Resource integrity patch {PatchName} resolved to {SiteCount} sites, expected {ExpectedMatches}", patch.Name, sites.Count, patch.ExpectedMatches);
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
            var value = Environment.GetEnvironmentVariable("SHITTIM_AUTO_PATCH_RESOURCE_INTEGRITY");
            return bool.TryParse(value, out var enabled)
                ? enabled
                : Config.Instance.ServerConfiguration.AutoPatchClientResourceIntegrity;
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
            return $"{gameAssemblyPath}.shittim_resource_integrity_patch.json";
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

        private sealed record ResourceIntegrityPatch(string Name, BytePattern Signature, int PatchOffset, BytePattern Original, BytePattern Patched, int ExpectedMatches);

        private sealed class ResourceIntegrityPatchState
        {
            public string GameAssemblyPath { get; set; } = "";
            public List<ResourceIntegrityPatchEntry> Patches { get; set; } = [];
        }

        private sealed class ResourceIntegrityPatchEntry
        {
            public string Name { get; set; } = "";
            public long Offset { get; set; }
            public string Original { get; set; } = "";
            public string Patched { get; set; } = "";
        }
    }
}
