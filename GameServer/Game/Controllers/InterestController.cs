using Server.Game.Models.DTOs;
using Server.Game.Services;

namespace Server.Game.Controllers;

/// <summary>
/// Controller responsible for interest management including visibility, chunks, and entity snapshots
/// </summary>
public sealed class InterestController(
    InterestManager interestManager)
{
    /// <summary>
    /// Get initial entities for a player when they join
    /// </summary>
    public List<EntityDto> GetInitialEntitiesFor(int accountId)
    {
        return interestManager.GetInitialEntitiesFor(accountId);
    }
}
