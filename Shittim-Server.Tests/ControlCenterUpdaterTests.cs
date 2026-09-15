using System.Diagnostics;
using Xunit;

namespace Shittim_Server.Tests;

// The update path is javascript in the Control Center's main process, and it is the thing that decides whether a failed update leaves a tree that still compiles.
// Running it from here keeps `dotnet test` the one command that covers it. updater.js and paths.js themselves only use built-in modules, but test/console.test.js imports ui.js, which imports i18n.js, which imports i18next out of node_modules - so the suite needs the Control Center's dependencies installed. The release workflow installs them, and this fails with the command to run rather than with a module-not-found trace.
public class ControlCenterUpdaterTests
{
    [Fact]
    public void TheUpdaterKeepsAnInstallOnOneVersionOrTheOther()
    {
        var controlCenter = Path.Combine(RepoRoot(), "ShittimControlCenter");

        Assert.True(Directory.Exists(Path.Combine(controlCenter, "node_modules", "i18next")),
            "ShittimControlCenter/node_modules has no i18next, so the Control Center suite cannot load. Run `npm install` in ShittimControlCenter, then re-run this test.");

        var proc = Process.Start(new ProcessStartInfo("node", "--test test/updater.test.js test/paths.test.js test/console.test.js test/health.test.js test/procs.test.js test/certs.test.js")
        {
            WorkingDirectory = controlCenter,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        });

        Assert.NotNull(proc);
        var output = proc.StandardOutput.ReadToEnd() + proc.StandardError.ReadToEnd();
        proc.WaitForExit(180_000);

        Assert.True(proc.ExitCode == 0, output);
    }

    // An update only ever writes paths the release archive carries, and the archive is the git tree. The day a database gets committed is the day every update overwrites the player's accounts with the committed one.
    [Fact]
    public void NoDatabaseIsCarriedInTheReleaseArchive()
    {
        var proc = Process.Start(new ProcessStartInfo("git", "ls-files")
        {
            WorkingDirectory = RepoRoot(),
            RedirectStandardOutput = true,
            UseShellExecute = false,
        })!;

        var tracked = proc.StandardOutput.ReadToEnd().Split('\n', StringSplitOptions.RemoveEmptyEntries);
        proc.WaitForExit(60_000);

        var databases = tracked.Where(p => p.EndsWith(".sqlite3", StringComparison.OrdinalIgnoreCase)
            || p.EndsWith(".sqlite", StringComparison.OrdinalIgnoreCase)).ToList();

        Assert.True(databases.Count == 0, string.Join(", ", databases));
    }

    private static string RepoRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (dir != null && !Directory.Exists(Path.Combine(dir, "ShittimControlCenter")))
            dir = Path.GetDirectoryName(dir);

        return dir!;
    }
}
