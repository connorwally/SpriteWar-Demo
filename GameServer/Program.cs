using System.Net;
using Server.Game.Controllers;
using Server.Game.Core;
using Server.Game.Handlers;
using Server.Game.Handlers.Messages;
using Server.Game.Models;
using Server.Game.Services;
using Server.Game.Services.Entities;
using Server.Game.Services.Entities.Pathfinding;

// Load .env file from global secrets
var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";
var envFile = Path.Combine("../../secrets", "gameserver.env");

if (File.Exists(envFile))
{
    foreach (var line in File.ReadAllLines(envFile))
    {
        if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#"))
            continue;

        var parts = line.Split('=', 2);
        if (parts.Length == 2)
        {
            Environment.SetEnvironmentVariable(parts[0].Trim(), parts[1].Trim());
        }
    }

    Console.WriteLine($"Loaded environment variables from {envFile}");
}

var builder = WebApplication.CreateBuilder(args);

// Configure Kestrel with environment variables
var port = Environment.GetEnvironmentVariable("GAME_SERVER_PORT") ?? "5038";

// Only listen on local host as connections go through server proxy
builder.WebHost.ConfigureKestrel(options =>
{
    options.Listen(IPAddress.Loopback, int.Parse(port));
});

Console.WriteLine($"GameServer configured to run on: http://localhost:{port}");

var terrainSeed = (uint)Random.Shared.Next();
Console.WriteLine($"Generated terrain seed: {terrainSeed}");

TilePos worldCenter = new TilePos(0,0);
var worldHalfSize = 1000;

// Services
builder.Services.AddSingleton(_ => new GameData(Path.Combine(AppContext.BaseDirectory, "entities.json"))); // Load game data (entities)
builder.Services.AddSingleton<HashSet<int>>(); // For PlayerManager
builder.Services.AddSingleton<List<object>>(); // For patchBuffer
builder.Services.AddSingleton<TerrainSystem>(_ => new TerrainSystem(terrainSeed));
builder.Services.AddSingleton<PathPlanner>();
builder.Services.AddSingleton<CollisionSystem>();
builder.Services.AddSingleton<ChunkSystem>();
builder.Services.AddSingleton<PlayerManager>();
builder.Services.AddSingleton<EntityManager>();
builder.Services.AddSingleton<InterestManager>();
builder.Services.AddSingleton<SessionManager>();
builder.Services.AddSingleton(_ => new WorldBorder(worldCenter, worldHalfSize));
builder.Services.AddSingleton(sp =>
{
    var playerManager = sp.GetRequiredService<PlayerManager>();
    var entityManager = sp.GetRequiredService<EntityManager>();
    var gameData = sp.GetRequiredService<GameData>();

    const float entityPowerMultiplier = 1.1f; // tune or later load from config
    return new PowerSystem(playerManager, entityManager, gameData, entityPowerMultiplier);
});

// Controllers
builder.Services.AddSingleton<PlayerController>();
builder.Services.AddSingleton<EntityController>();
builder.Services.AddSingleton<SessionController>();
builder.Services.AddSingleton<InterestController>();
builder.Services.AddSingleton<GameController>();

// Message handlers
builder.Services.AddSingleton<MoveMessageHandler>();
builder.Services.AddSingleton<BuildMessageHandler>();
builder.Services.AddSingleton<ForfeitMessageHandler>();
builder.Services.AddSingleton<PingMessageHandler>();
builder.Services.AddSingleton<TargetMessageHandler>();
builder.Services.AddSingleton<TrainMessageHandler>();
builder.Services.AddSingleton<PlayMessageHandler>();
builder.Services.AddSingleton<CancelTrainMessageHandler>();
builder.Services.AddSingleton<MessageHandlerRegistry>();

builder.Services.AddSingleton<GameServer>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<GameServer>());

var app = builder.Build();

app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(20)
});

// WebSocket endpoint
app.Map("/ws", async ctx =>
{
    Console.WriteLine($"WebSocket connection attempt from: {ctx.Connection.RemoteIpAddress}");
    if (!ctx.WebSockets.IsWebSocketRequest) // If not a websocket request
    {
        ctx.Response.StatusCode = 400;
        await ctx.Response.WriteAsync("WebSocket requests only.");
        return;
    }

    // Extract auth token from headers
    var authHeader = ctx.Request.Headers.Authorization.FirstOrDefault();
    var authToken = authHeader?.StartsWith("Bearer ") == true ? authHeader.Substring(7) : null;

    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    var game = ctx.RequestServices.GetRequiredService<GameServer>();
    await game.AcceptClientAsync(ws, authToken, ctx.RequestAborted);
});

app.Run();