using AutoMapper;
using BlueArchiveAPI.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Schale.Data;
using Schale.Data.GameModel;
using Schale.FlatData;
using Schale.MappingProfiles;
using Schale.MX.GameLogic.Parcel;
using Shittim_Server.Services;
using Xunit;

namespace Shittim_Server.Tests;

// The client clamps the AP counter at CurrencyExcel's OverChargeLimit (999), so any stored value past it makes spending look like a no-op: 1400 minus 30 still displays 999. Official never stores the excess - it goes to the mailbox as an InventoryFull mail.
public class ActionPointOverflowTests
{
    [ExcelDumpFact]
    public async Task AGrantPastTheCapClampsTo999AndMailsTheExcess()
    {
        using var db = NewContext();
        var account = NewAccount(db, actionPoint: 990);

        await Handler().BuildParcel(db, account, new ParcelResult(ParcelType.Currency, (long)CurrencyTypes.ActionPoint, 100));

        Assert.Equal(999, db.Currencies.Single().CurrencyDict[CurrencyTypes.ActionPoint]);

        var mail = Assert.Single(db.Mails);
        Assert.Equal(MailType.InventoryFull, mail.Type);
        var excess = Assert.Single(mail.ParcelInfos!);
        Assert.Equal(ParcelType.Currency, excess.Key.Type);
        Assert.Equal((long)CurrencyTypes.ActionPoint, excess.Key.Id);
        Assert.Equal(91, excess.Amount);
    }

    [ExcelDumpFact]
    public async Task SpendingFromTheCapMovesTheCounter()
    {
        using var db = NewContext();
        var account = NewAccount(db, actionPoint: 999);

        await Handler().BuildParcel(db, account, new ParcelResult(ParcelType.Currency, (long)CurrencyTypes.ActionPoint, 30), isConsume: true);

        Assert.Equal(969, db.Currencies.Single().CurrencyDict[CurrencyTypes.ActionPoint]);
        Assert.Empty(db.Mails);
    }

    [ExcelDumpFact]
    public async Task AGrantUnderTheCapMailsNothing()
    {
        using var db = NewContext();
        var account = NewAccount(db, actionPoint: 100);

        await Handler().BuildParcel(db, account, new ParcelResult(ParcelType.Currency, (long)CurrencyTypes.ActionPoint, 100));

        Assert.Equal(200, db.Currencies.Single().CurrencyDict[CurrencyTypes.ActionPoint]);
        Assert.Empty(db.Mails);
    }

    private static ParcelHandler Handler() => new(Excels, Mapper);

    private static readonly ExcelTableService Excels = LoadExcels();

    private static ExcelTableService LoadExcels() => ExcelDumps.Service();

    private static SchaleDataContext NewContext()
    {
        var path = Path.Combine(Path.GetTempPath(), $"shittim-apoverflow-{Guid.NewGuid():N}.sqlite3");
        var context = new SchaleDataContext(
            new DbContextOptionsBuilder<SchaleDataContext>().UseSqlite($"Data Source={path}").Options);

        context.Database.EnsureCreated();
        return context;
    }

    private static AccountDBServer NewAccount(SchaleDataContext db, long actionPoint)
    {
        var account = new AccountDBServer { ServerId = 1, Nickname = "Sensei" };
        var currency = new AccountCurrencyDBServer(1);
        currency.CurrencyDict[CurrencyTypes.ActionPoint] = actionPoint;
        db.Accounts.Add(account);
        db.Currencies.Add(currency);
        db.SaveChanges();
        return account;
    }

    private static readonly IMapper Mapper = BuildMapper();

    private static IMapper BuildMapper()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAutoMapper(cfg => { }, typeof(GameModelsMappingProfile).Assembly);
        return services.BuildServiceProvider().GetRequiredService<IMapper>();
    }
}
