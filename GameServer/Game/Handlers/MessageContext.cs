using Server.Game.Controllers;
using Server.Game.Core;

namespace Server.Game.Handlers;

/// <summary>
/// Communication bridge for message handlers - provides access to game state and client responses.
/// </summary>
public class MessageContext(GameServer gameServer, GameController gameController)
{
    /// <summary>Access to game state and operations</summary>
    public GameController Game { get; } = gameController;

    /// <summary>Send JSON response to client</summary>
    public async Task SendJsonAsync(Guid clientId, object payload)
    {
        await gameServer.SendJsonAsync(clientId, payload);
    }

    /// <summary>Send error response to client</summary>
    public async Task SendErrorAsync(Guid clientId, string reason)
    {
        await gameServer.SendErrorAsync(clientId, reason);
    }
}