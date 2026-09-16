using BlueArchiveAPI.Configuration;
using Shittim.Utils;
using Xunit;

namespace Shittim_Server.Tests;

// Where an outbound request actually goes when a proxy is or is not configured. The setting exists because the
// Windows proxy setting has to stay off on a machine that plays - the client's requests would go to that proxy
// and never reach this server - and that is the same setting .NET reads by default. While an untouched
// Config.json still has to behave exactly as it did before any of this existed, which is what the last test
// here pins with the machine's own proxy object as the reference.
//
// Every test in this class touches the process-wide Config, so they stay in one class: xunit runs the tests of
// a class one at a time and the classes of a collection in parallel.
public class OutboundProxyTests
{
    [Theory]
    // Loopback is never proxied, whatever the list says - this server is what is on the other end of it.
    [InlineData("127.0.0.1", 5000, "", true)]
    [InlineData("127.4.5.6", 8080, "", true)]
    [InlineData("localhost", 80, "", true)]
    [InlineData("api.localhost", 80, "", true)]
    [InlineData("::1", 0, "", true)]
    // A list that does not mention the host does not bypass it.
    [InlineData("api-pub.nexon.com", 443, "", false)]
    [InlineData("api-pub.nexon.com", 443, "example.com,other.test", false)]
    // A plain host, a dot tail and a star tail all match the host itself.
    [InlineData("example.com", 443, "example.com", true)]
    [InlineData("example.com", 443, ".example.com", true)]
    [InlineData("cdn.example.com", 443, ".example.com", true)]
    [InlineData("cdn.example.com", 443, "*.example.com", true)]
    [InlineData("notexample.com", 443, ".example.com", false)]
    // A suffix match is on the label boundary, so the tail alone is not enough.
    [InlineData("example.com.evil.test", 443, ".example.com", false)]
    // A port in the entry has to match as well, or the entry says nothing about this request.
    [InlineData("example.com", 8080, "example.com:8080", true)]
    [InlineData("example.com", 443, "example.com:8080", false)]
    // Separators, case and the catch-all.
    [InlineData("example.com", 443, "OTHER.test, Example.COM", true)]
    [InlineData("example.com", 443, "other.test; example.com", true)]
    [InlineData("anything.test", 1, "*", true)]
    public void TheBypassListMatchesHostsTheWayItReads(string host, int port, string list, bool bypassed)
    {
        Assert.Equal(bypassed, ConfigurableProxy.IsBypassedHost(host, port, list));
    }

    [Fact]
    public void AProxyAddressWrittenWithoutASchemeIsStillAnAddress()
    {
        // "127.0.0.1:7890" is what people write, and new Uri reads that as a scheme rather than as an address.
        var uri = ConfigurableProxy.Normalise("127.0.0.1:7890");

        Assert.NotNull(uri);
        Assert.Equal("http", uri!.Scheme);
        Assert.Equal("127.0.0.1", uri.Host);
        Assert.Equal(7890, uri.Port);
    }

    [Theory]
    [InlineData("http://127.0.0.1:8080")]
    [InlineData("https://proxy.example.com:8443")]
    [InlineData("socks5://127.0.0.1:1080")]
    [InlineData("socks5h://127.0.0.1:1080")]
    [InlineData("http://user:pass@127.0.0.1:8080")]
    public void AProxyAddressWebProxyCanSpeakIsAccepted(string url)
    {
        Assert.NotNull(ConfigurableProxy.Normalise(url));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("://")]
    [InlineData("ftp://127.0.0.1:21")]
    [InlineData("file:///C:/proxy.pac")]
    public void AProxyAddressThatIsNotARouteOutIsRejected(string url)
    {
        // Rejected means direct, not a broken request: an unparseable address is a typo, and failing every
        // outbound request over it helps nobody.
        Assert.Null(ConfigurableProxy.Normalise(url));
    }

    [Fact]
    public void AConfiguredProxyTakesEveryRequestThatIsNotBypassed()
    {
        var config = Config.Instance.ServerConfiguration;
        var saved = (config.OutboundProxyUrl, config.OutboundProxyBypass, config.OutboundProxyUseSystem);

        try
        {
            config.OutboundProxyUrl = "http://127.0.0.1:7890";
            config.OutboundProxyBypass = "internal.test";
            config.OutboundProxyUseSystem = false;

            var proxy = new ConfigurableProxy();
            var outside = new Uri("https://api-pub.nexon.com/patch/v1.1/version-check");
            var inside = new Uri("https://internal.test/state");

            var chosen = proxy.GetProxy(outside);
            Assert.Equal("127.0.0.1", chosen!.Host);
            Assert.Equal(7890, chosen.Port);
            Assert.False(proxy.IsBypassed(outside));

            // Returning the destination itself is how "no proxy for this one" is spelled.
            Assert.Equal(inside, proxy.GetProxy(inside));
            Assert.True(proxy.IsBypassed(inside));

            // And this server's own address is never sent to a proxy, list or no list.
            Assert.True(proxy.IsBypassed(new Uri("http://127.0.0.1:5000/api/admin/status")));
        }
        finally
        {
            (config.OutboundProxyUrl, config.OutboundProxyBypass, config.OutboundProxyUseSystem) = saved;
        }
    }

    [Fact]
    public void WithNoProxyConfiguredTheSystemSettingIsLeftOutOfItWhenAsked()
    {
        var config = Config.Instance.ServerConfiguration;
        var saved = (config.OutboundProxyUrl, config.OutboundProxyBypass, config.OutboundProxyUseSystem);

        try
        {
            config.OutboundProxyUrl = "";
            config.OutboundProxyBypass = "";
            config.OutboundProxyUseSystem = false;

            var proxy = new ConfigurableProxy();
            var destination = new Uri("https://d2vaidpni345rp.cloudfront.net/server_config.json");

            Assert.Equal(destination, proxy.GetProxy(destination));
            Assert.True(proxy.IsBypassed(destination));
        }
        finally
        {
            (config.OutboundProxyUrl, config.OutboundProxyBypass, config.OutboundProxyUseSystem) = saved;
        }
    }

    // The default has to be indistinguishable from a plain HttpClient. An untouched Config.json is a machine
    // that has not opted into anything, so an empty URL with the system setting left in charge must produce
    // the machine's own answers - including a bypass list that nothing reads.
    [Fact]
    public void WithNothingConfiguredTheAnswerIsTheOneTheMachineWouldHaveGiven()
    {
        var config = Config.Instance.ServerConfiguration;
        var saved = (config.OutboundProxyUrl, config.OutboundProxyBypass, config.OutboundProxyUseSystem);

        try
        {
            config.OutboundProxyUrl = "";
            config.OutboundProxyBypass = "api-pub.nexon.com";
            config.OutboundProxyUseSystem = true;

            var proxy = new ConfigurableProxy();
            var destination = new Uri("https://api-pub.nexon.com/patch/v1.1/version-check");

            Assert.Equal(HttpClient.DefaultProxy.IsBypassed(destination), proxy.IsBypassed(destination));
            Assert.Equal(HttpClient.DefaultProxy.GetProxy(destination), proxy.GetProxy(destination));
        }
        finally
        {
            (config.OutboundProxyUrl, config.OutboundProxyBypass, config.OutboundProxyUseSystem) = saved;
        }
    }

    // The one thing an untouched Config.json does not inherit from the machine: this server's own addresses.
    // A Windows proxy setting that does not carry <local> would otherwise send the server's calls to its own
    // gateway out to a proxy, which is a request the server is meant to answer itself.
    [Theory]
    [InlineData("https://localhost:5100/api")]
    [InlineData("http://127.0.0.1:5000/api/admin/status")]
    [InlineData("http://127.0.0.3:5000/health")]
    [InlineData("http://[::1]:5000/health")]
    public void ThisServersOwnAddressesAreAnsweredHereAndNotByAProxy(string address)
    {
        var config = Config.Instance.ServerConfiguration;
        var saved = (config.OutboundProxyUrl, config.OutboundProxyBypass, config.OutboundProxyUseSystem);

        try
        {
            var destination = new Uri(address);
            var proxy = new ConfigurableProxy();

            // With a proxy configured and a list that does not mention any of these.
            config.OutboundProxyUrl = "http://127.0.0.1:7890";
            config.OutboundProxyBypass = "internal.test";
            config.OutboundProxyUseSystem = false;

            Assert.Equal(destination, proxy.GetProxy(destination));
            Assert.True(proxy.IsBypassed(destination));

            // And with nothing configured, where the machine's own list would otherwise be in charge.
            config.OutboundProxyUrl = "";
            config.OutboundProxyBypass = "";
            config.OutboundProxyUseSystem = true;

            Assert.Equal(destination, proxy.GetProxy(destination));
            Assert.True(proxy.IsBypassed(destination));
        }
        finally
        {
            (config.OutboundProxyUrl, config.OutboundProxyBypass, config.OutboundProxyUseSystem) = saved;
        }
    }
}
