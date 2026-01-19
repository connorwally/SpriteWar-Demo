using Server.Game.Services;
using Server.Game.Services.Entities;

namespace Server.Game.Controllers;

/// <summary>
/// Controller responsible for session management including timeouts, activity tracking, and player connections
/// </summary>
public sealed class SessionController(
    SessionManager sessionManager,
    EntityManager entityManager)
{

    /// <summary>
    /// Forfeit a player (make all their entities barbarian)
    /// </summary>
    public void ForfeitPlayer(int accountId)
    {
        entityManager.ClearEntitiesForPlayer(accountId);
        sessionManager.ClearSessionForPlayer(accountId);
        Console.WriteLine($"Player {accountId} has forfeited. All their entities are now barbarian");
    }
}
