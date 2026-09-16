using Microsoft.Extensions.Logging;
using Shittim_Server.Services;
using Xunit;

namespace Shittim_Server.Tests;

// The reachability gate is the one site that decides whether the client gets as far as the title screen at all, so it is worth a test of its own even though the other six sites share the apply/revert path with it.
//
// Every fixture here fills the RIP-relative and rel32 operands with arbitrary values rather than the displacements the 1.90 client shipped, because those displacements are exactly what Steam moves on a client update: the 1.93.453174 update shifted six of the seven sites without touching a single patch target. A fixture that hardcodes the displacements passes against a matcher that cannot survive an update, which is how the breakage went unnoticed.
[Collection("steam-offline-patch")]
public class SteamOfflinePatchTests : IDisposable
{
    private const int Site = 0x400;

    // UIPatchDownload+<PreCheckForEnterGame>d__41.MoveNext: xor ecx,ecx / call internetReachability / test eax,eax / je
    private static readonly byte[] Precheck = Bytes(
        "48 8B 15 11 22 33 44 48 8B 0D 55 66 77 88 E8 99 AA BB CC 48 89 C7 31 C9 E8 DD EE FF 01 85 C0 74 3D");

    // NPA.Ex.Steam.ExternalPlatformSteam.GetAuthToken, second auth site. Its Original embeds a mov rdx,[rip+..] that the patch deliberately does not touch, so that displacement has to survive the write.
    private static readonly byte[] AuthTicket = Bytes(
        "48 8B 0D 21 22 23 24 E8 25 26 27 28 48 85 C0 0F 84 29 2A 2B 2C 48 89 C7 48 89 C1 31 D2 E8 2D 2E 2F 30 " +
        "C7 47 10 96 44 2C 04 48 8B 15 31 32 33 34 48 89 F9 48 83 C1 18 48 89 57 18");

    // GetPurchasableProduct.bypassPriceFailure. GetEntitlementsAsJsonArray reaches RequestPrices through a display class of its own, so the same shape sits at two addresses and both have to be patched.
    private static readonly byte[] PriceFailure = Bytes(
        "48 8B 0D 41 42 43 44 83 B9 E0 00 00 00 00 75 05 E8 45 46 47 48 48 89 F9 31 D2 E8 49 4A 4B 4C 84 DB 74 69");

    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"shittim-steam-{Guid.NewGuid():N}");
    private readonly RecordingLogger _log = new();

    public SteamOfflinePatchTests()
    {
        Directory.CreateDirectory(_dir);
        Environment.SetEnvironmentVariable("SHITTIM_AUTO_PATCH_STEAM_OFFLINE", "true");
    }

    [Fact]
    public async Task TheTitleScreenReachabilityGateIsNoppedOut()
    {
        var path = WriteModule(Precheck);

        await Run();

        var data = File.ReadAllBytes(path);
        Assert.Equal(new byte[] { 0x90, 0x90 }, data.AsSpan(Site + Precheck.Length - 2, 2).ToArray());
    }

    [Fact]
    public async Task TurningTheOfflinePatchOffPutsTheGateBack()
    {
        var path = WriteModule(Precheck);
        var before = File.ReadAllBytes(path);

        await Run();
        Assert.NotEqual(before, File.ReadAllBytes(path));

        Environment.SetEnvironmentVariable("SHITTIM_AUTO_PATCH_STEAM_OFFLINE", "false");
        await Run();

        Assert.Equal(before, File.ReadAllBytes(path));
    }

    // Site 2 zeroes the error code and moves the two stores onto AuthToken, and the mov rdx,[rip+..] between them is only there to be skipped. Writing a wildcard byte would drop a displacement from some other build into a live instruction.
    [Fact]
    public async Task TheAuthTicketPatchLeavesTheDisplacementItDoesNotOwn()
    {
        var path = WriteModule(AuthTicket);

        await Run();

        var data = File.ReadAllBytes(path);
        var target = Site + 34;

        Assert.Equal(Bytes("C7 47 10 00 00 00 00"), data[target..(target + 7)]);
        Assert.Equal(Bytes("48 8B 15 31 32 33 34"), data[(target + 7)..(target + 14)]);
        Assert.Equal(0x20, data[target + 20]);
        Assert.Equal(0x20, data[target + 24]);
    }

    [Fact]
    public async Task BothPriceFailureSitesArePatched()
    {
        var path = WriteModule(Precheck, PriceFailure, PriceFailure);

        await Run();

        var data = File.ReadAllBytes(path);
        var second = Site + 0x100 + PriceFailure.Length - 2;
        var third = Site + 0x200 + PriceFailure.Length - 2;

        Assert.Equal(new byte[] { 0x90, 0x90 }, data[second..(second + 2)]);
        Assert.Equal(new byte[] { 0x90, 0x90 }, data[third..(third + 2)]);
    }

    // A candidate that survives the search but whose target bytes have moved is not a match, it is a coincidence. Guessing there writes over unrelated code, so the site is left alone and the miss is reported.
    [Fact]
    public async Task ASiteWhoseTargetBytesMovedIsLeftAlone()
    {
        var moved = (byte[])Precheck.Clone();
        moved[^1] = 0x3E;
        var path = WriteModule(moved);
        var before = File.ReadAllBytes(path);

        await Run();

        Assert.Equal(before, File.ReadAllBytes(path));
        Assert.False(File.Exists(path + ".shittim_steam_offline_patch.json"));

        Assert.Contains(_log.Entries, x => x.Message.Contains(
            "Steam offline patch patchDownload.PreCheckForEnterGame.ignoreUnreachable resolved to 0 sites, expected 1",
            StringComparison.Ordinal));
    }

    private string WriteModule(params byte[][] blobs)
    {
        var data = new byte[4096];
        var offset = Site;

        foreach (var blob in blobs)
        {
            blob.CopyTo(data, offset);
            offset += 0x100;
        }

        var path = Path.Combine(_dir, "GameAssembly.dll");
        File.WriteAllBytes(path, data);
        Environment.SetEnvironmentVariable("SHITTIM_CLIENT_GAMEASSEMBLY_PATH", path);
        return path;
    }

    private async Task Run()
    {
        await new ClientSteamOfflinePatchService(_log).StartAsync(CancellationToken.None);
    }

    private static byte[] Bytes(string hex) => hex.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(x => Convert.ToByte(x, 16)).ToArray();

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("SHITTIM_CLIENT_GAMEASSEMBLY_PATH", null);
        Environment.SetEnvironmentVariable("SHITTIM_AUTO_PATCH_STEAM_OFFLINE", null);

        if (Directory.Exists(_dir))
            Directory.Delete(_dir, true);
    }

    private sealed class RecordingLogger : ILogger<ClientSteamOfflinePatchService>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception exception, Func<TState, Exception, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }
}
