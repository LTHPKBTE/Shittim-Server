using System.Net;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using BlueArchiveAPI.Configuration;
using Schale.Data;
using BlueArchiveAPI.Services;

namespace Shittim.Services.IrcClient
{
    public class IrcService : BackgroundService
    {
        private IrcServer server;

        public IrcService(IDbContextFactory<SchaleDataContext> context, IMapper mapper, ExcelTableService excelTableService)
        {
            // Loopback only. Config.Load() already pins IrcAddress to 127.0.0.1, and ClanHandler hands the client that same address, so binding any address only made the chat port reachable from the LAN.
            var ircAddress = IPAddress.TryParse(Config.Instance.IrcConfiguration.IrcAddress, out var parsed)
                ? parsed
                : IPAddress.Loopback;

            server = new IrcServer(
                ircAddress,
                Config.Instance.IrcConfiguration.IrcPort,
                context, mapper, excelTableService
            );
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            await server.StartAsync(stoppingToken);
        }

        public override async Task StopAsync(CancellationToken stoppingToken)
        {
            server.Stop();
            await base.StopAsync(stoppingToken);
        }
    }

    public static class IrcServiceExtensions
    {
        public static void AddIrcService(this IServiceCollection services)
        {
            services.AddHostedService<IrcService>();
        }
    }
}
