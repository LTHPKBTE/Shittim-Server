using BlueArchiveAPI.Services;
using Xunit;

namespace Shittim_Server.Tests;

// Most of the interesting behaviour in this suite is decided by the game's own excel tables - CurrencyExcel's OverChargeLimit, CampaignStageExcel's reward groups, InteractiveWorldRaidSeasonManageExcel's phase rows - and those live in Shittim-Server/Resources/Dumped, which the server downloads from the CDN the first time it runs. The dumps are roughly 300 MB, so they stay out of the repo and out of CI, and a machine that has never started the server does not have them.
//
// Tests that need them are marked [ExcelDumpFact] rather than [Fact], which skips them with an explanation instead of failing. That is the same call ExcelLayoutDriftTests already makes for the same reason; the difference is only that this one is reusable, so the fourteen classes that used to die with a TypeInitializationException inside their own private LoadExcels() now report what is actually missing.
internal static class ExcelDumps
{
    // Null when nothing has been downloaded on this machine yet.
    public static string? Dir { get; } = Locate();

    public const string SkipReason =
        "No Shittim-Server/Resources/Dumped on this machine. Those tables are downloaded from the game's CDN, not committed - start the server once (or copy the folder across) and re-run this test.";

    // ExcelTableService resolves Resources against AppContext.BaseDirectory, which during a test run is this project's own output folder, not the server's. The data belongs to the server, so find the repo root and look there.
    private static string? Locate()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var server = Path.Combine(dir.FullName, "Shittim-Server");

            // Shittim-Server.Tests also sits under a Shittim-Server directory at the workspace root, so the project file is what tells them apart.
            if (!File.Exists(Path.Combine(server, "Shittim-Server.csproj")))
                continue;

            return new[]
            {
                Path.Combine(server, "Resources", "Dumped"),
                Path.Combine(server, "bin", "Debug", "net10.0", "Resources", "Dumped"),
                Path.Combine(server, "bin", "Release", "net10.0", "Resources", "Dumped"),
            }.FirstOrDefault(Directory.Exists);
        }

        return null;
    }

    // Points ExcelTableService at the dumps and hands back a service that reads them. Only reachable once Dir is non-null, because every caller is behind [ExcelDumpFact].
    public static ExcelTableService Service()
    {
        ExcelTableService.DumpedDir = Dir!;
        return new ExcelTableService();
    }
}

// A [Fact] whose fixtures come from the downloaded excel dumps. Skips, with the reason above, on a machine that has never run the server.
internal sealed class ExcelDumpFactAttribute : FactAttribute
{
    public ExcelDumpFactAttribute()
    {
        if (ExcelDumps.Dir is null)
            Skip = ExcelDumps.SkipReason;
    }
}
