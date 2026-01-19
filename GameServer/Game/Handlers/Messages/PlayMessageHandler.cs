using System.Text.Json;
using Server.Game.Controllers;
using Server.Game.Models;
using Server.Game.Services;

namespace Server.Game.Handlers.Messages;

public class PlayMessageHandler(PlayerController playerController, InterestController interestController, SessionManager sessionManager, GameController gameController, WorldBorder worldBorder) : IMessageHandler
{
    public string MessageType => "play";

    public async Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context)
    {
        gameController.EnsurePlayerBootstrap(accountId);
        sessionManager.MarkAccountBootstrapped(accountId);

        var player = playerController.BuildPlayerSnapshot(accountId);
        var entities = interestController.GetInitialEntitiesFor(accountId);

        playerController.MarkPlayerForSnapshotUpdate(accountId);

        var (minX, minY, maxX, maxY) = worldBorder.Bounds;

        await context.SendJsonAsync(clientId, new
        {
            t = "start",
            player,
            entities,
            terrainSeed = context.Game.TerrainSeed,
            worldBorder = new { minX, minY, maxX, maxY}
        });
    }
}