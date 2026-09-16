using BlueArchiveAPI.Configuration;
using BlueArchiveAPI.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Shittim_Server.Services;
using Xunit;

namespace Shittim_Server.Tests;

// The host-stopping bug, pinned. HttpClient.Timeout surfaces as TaskCanceledException, which is also exactly
// what a shutdown looks like, so filtering the coordinator's request loop on the exception type alone - which
// is what the original code did - let the coordinator's own timeout past the handler and out of ExecuteAsync.
// An unhandled exception in a BackgroundService stops the host under the default
// BackgroundServiceExceptionBehavior, so one slow poll took the whole server down mid-session.
public class WorldRaidSyncServiceTests
{
    [Fact]
    public async Task ACoordinatorThatTimesOutLeavesTheHostRunning()
    {
        var config = Config.Instance.ServerConfiguration;
        var savedUrl = config.WorldRaidCoordinatorUrl;

        var attempts = 0;
        var timeout = new TaskCanceledException(
            "The request was canceled due to the configured HttpClient.Timeout of 10 seconds elapsing.",
            new TimeoutException());

        using var http = new HttpClient(new StubHandler(_ =>
        {
            Interlocked.Increment(ref attempts);
            throw timeout;
        }));

        var service = new WorldRaidSyncService(
            NullLogger<WorldRaidSyncService>.Instance,
            new ExcelTableService(),
            http,
            TimeSpan.FromMilliseconds(10));

        try
        {
            config.WorldRaidCoordinatorUrl = "https://coordinator.invalid";

            await service.StartAsync(CancellationToken.None);
            await Task.Delay(250);

            // StopAsync rethrows whatever ExecuteAsync threw, so this is the host's own view of the service.
            await service.StopAsync(CancellationToken.None);

            Assert.False(service.ExecuteTask!.IsFaulted);
            Assert.True(attempts > 1, $"the poll loop gave up after {attempts} attempt(s)");
        }
        finally
        {
            config.WorldRaidCoordinatorUrl = savedUrl;
        }
    }

    // A coordinator with nothing configured is not an error either: the service returns and the raid runs off
    // the cached manifest.
    [Fact]
    public async Task WithNoCoordinatorConfiguredTheServiceJustStops()
    {
        var config = Config.Instance.ServerConfiguration;
        var savedUrl = config.WorldRaidCoordinatorUrl;

        try
        {
            config.WorldRaidCoordinatorUrl = "";

            var service = new WorldRaidSyncService(NullLogger<WorldRaidSyncService>.Instance, new ExcelTableService());
            await service.StartAsync(CancellationToken.None);
            await service.StopAsync(CancellationToken.None);

            Assert.False(service.ExecuteTask!.IsFaulted);
        }
        finally
        {
            config.WorldRaidCoordinatorUrl = savedUrl;
        }
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Action<HttpRequestMessage> answer;

        public StubHandler(Action<HttpRequestMessage> answer) => this.answer = answer;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            answer(request);
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK));
        }
    }
}
