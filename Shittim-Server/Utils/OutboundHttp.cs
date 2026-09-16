using System.Net;
using BlueArchiveAPI.Configuration;

namespace Shittim.Utils
{
    /// <summary>
    /// Decides where the server's own outbound requests go, in one place for all of them: the version check
    /// against PureAPK and the Nexon patch API, the CDN downloads of the Excel and HexaMap tables, the world
    /// raid coordinator, the arena fetch. Each of those still builds its own <see cref="HttpClient"/> with its
    /// own timeout and headers, but they all take a handler from <see cref="OutboundHttp"/> and that handler
    /// is this proxy.
    ///
    /// What it is not: a proxy for the game. Everything the client asks for is answered by this server on
    /// loopback, so there is nothing on that path to route and nothing here touches it. The setting exists
    /// for the server's own fetches, and loopback is answered directly in every mode so that a proxy can
    /// never be handed a request this server is meant to answer itself.
    ///
    /// The address is read per request rather than per client on purpose. A client holds its handler for the
    /// life of the process, several of these clients are static fields built before the configuration has
    /// even been loaded, and the Control Center writes Config.json while the server runs - so anything fixed
    /// at construction would either see no configuration at all or ignore every later change to it.
    ///
    /// The reason the setting exists: with the Windows proxy setting on, the client's own requests go to that
    /// proxy, so mitmproxy never gets to rewrite them at loopback and this server never gets to answer - which
    /// is why the machine's setting has to stay off on a machine that plays. That is also the setting .NET
    /// reads by default, so without an address here, leaving it off for the client takes the server's route
    /// out with it.
    /// </summary>
    public sealed class ConfigurableProxy : IWebProxy
    {
        /// <summary>The one instance every handler shares, so the built proxy is only parsed once per change.</summary>
        public static readonly ConfigurableProxy Shared = new();

        private readonly object gate = new();
        private string builtFrom = "";
        private WebProxy? custom;
        private ICredentials? credentials;

        /// <summary>The custom proxy's credentials when one is set (which is where <c>http://user:pass@host</c> ends up), the machine proxy's otherwise.</summary>
        public ICredentials? Credentials
        {
            get
            {
                lock (gate)
                {
                    if (custom is not null)
                        return custom.Credentials;

                    return credentials ?? System()?.Credentials;
                }
            }
            set => credentials = value;
        }

        public Uri? GetProxy(Uri destination)
        {
            // This server answers its own addresses - the gateway, the admin API, the SDK endpoints the client
            // was pointed at. None of that is anybody else's to route, so loopback is answered here, ahead of
            // both the system setting and the configured list, and it stays answered whatever either says.
            if (IsLoopback(destination.Host))
                return destination;

            var (url, bypass, useSystem) = Settings();

            // Nothing configured and the machine's own setting left alone: the question goes straight to the
            // same proxy HttpClient would have consulted anyway, answer included, so an untouched Config.json
            // behaves exactly as it did before any of this existed - including the null it returns when no
            // proxy is configured at all.
            if (string.IsNullOrWhiteSpace(url))
                return useSystem ? System()?.GetProxy(destination) : destination;

            // An address is set, so the list is ours to apply.
            if (IsBypassedHost(destination.Host, destination.Port, bypass))
                return destination;

            return Custom(url, bypass)?.GetProxy(destination) ?? destination;
        }

        public bool IsBypassed(Uri host)
        {
            if (IsLoopback(host.Host))
                return true;

            var (url, bypass, useSystem) = Settings();

            if (string.IsNullOrWhiteSpace(url))
                return useSystem ? System()?.IsBypassed(host) ?? false : true;

            return IsBypassedHost(host.Host, host.Port, bypass);
        }

        internal static (string Url, string Bypass, bool UseSystem) Settings()
        {
            var config = Config.Instance.ServerConfiguration;

            return (
                config.OutboundProxyUrl?.Trim() ?? "",
                config.OutboundProxyBypass?.Trim() ?? "",
                config.OutboundProxyUseSystem);
        }

        /// <summary>
        /// Loopback is never proxied, whoever asks: this server is what is on the other end of its own
        /// addresses, and the proxy itself is reached over loopback. Everything else is the configured list -
        /// a plain host, a <c>.suffix</c> or <c>*.suffix</c> tail, <c>*</c> for everything, optionally with a
        /// <c>:port</c> that has to match too. The list is only consulted when an address is configured; with
        /// none, the machine's own list is the one that decides.
        /// </summary>
        public static bool IsBypassedHost(string? host, int port, string? bypassList)
        {
            if (IsLoopback(host))
                return true;

            if (string.IsNullOrWhiteSpace(bypassList))
                return false;

            foreach (var entry in bypassList.Split(new[] { ',', ';', ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (Matches(host!, port, entry))
                    return true;
            }

            return false;
        }

        /// <summary>
        /// <c>localhost</c>, anything under it, and every literal loopback address. Matched on the host name in
        /// the request, never on what it resolves to: a hostname the hosts file points at loopback is still
        /// routed by name, which is what offline mode relies on.
        /// </summary>
        public static bool IsLoopback(string? host)
        {
            if (string.IsNullOrEmpty(host))
                return true;

            return host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                   host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
                   (IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address));
        }

        private static bool Matches(string host, int port, string entry)
        {
            if (entry == "*")
                return true;

            var wanted = entry;
            int? wantedPort = null;

            var colon = wanted.LastIndexOf(':');
            if (colon > 0 && int.TryParse(wanted[(colon + 1)..], out var parsed))
            {
                wantedPort = parsed;
                wanted = wanted[..colon];
            }

            if (wanted.StartsWith("*."))
                wanted = wanted[2..];
            else if (wanted.StartsWith('.'))
                wanted = wanted[1..];

            if (wanted.Length == 0 || (wantedPort.HasValue && wantedPort.Value != port))
                return false;

            return host.Equals(wanted, StringComparison.OrdinalIgnoreCase) ||
                   host.EndsWith("." + wanted, StringComparison.OrdinalIgnoreCase);
        }

        private WebProxy? Custom(string url, string bypass)
        {
            lock (gate)
            {
                var signature = url + "\n" + bypass;
                if (custom is not null && builtFrom == signature)
                    return custom;

                var address = Normalise(url);
                if (address is null)
                    return null;

                custom = new WebProxy(address);
                builtFrom = signature;

                return custom;
            }
        }

        /// <summary>
        /// A bare <c>host:port</c> is what people write, and <c>new Uri</c> reads that as a scheme rather than
        /// as an address. Anything that is not a scheme WebProxy can speak is a typo, and a typo goes direct
        /// rather than failing every request with an unclear error.
        /// </summary>
        internal static Uri? Normalise(string url)
        {
            var text = url.Trim();
            if (text.Length == 0)
                return null;

            if (!text.Contains("://"))
                text = "http://" + text;

            if (!Uri.TryCreate(text, UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host))
                return null;

            return uri.Scheme switch
            {
                "http" or "https" or "socks5" or "socks5h" => uri,
                _ => null,
            };
        }

        private static IWebProxy? System()
        {
            try
            {
                return HttpClient.DefaultProxy;
            }
            catch
            {
                // A machine with a malformed proxy configuration throws here rather than answering; direct is
                // the only useful fallback.
                return null;
            }
        }
    }

    public static class OutboundHttp
    {
        /// <summary>
        /// The handler for every request this server makes to something other than itself. <c>UseProxy</c> is
        /// on with <see cref="ConfigurableProxy"/> behind it, which is what keeps the machine's own proxy
        /// setting from being consulted unless the configuration asks for it.
        /// </summary>
        public static HttpClientHandler CreateHandler() => new()
        {
            UseProxy = true,
            Proxy = ConfigurableProxy.Shared,
        };
    }
}
