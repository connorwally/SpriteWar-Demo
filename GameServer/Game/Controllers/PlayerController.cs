using Server.Game.Models;
using Server.Game.Services;

namespace Server.Game.Controllers;

/// <summary>
/// Controller responsible for player-related operations including resources, home tiles, and snapshots
/// </summary>
public sealed class PlayerController(PlayerManager playerManager)
{

    /// <summary>
    /// Build a snapshot of the player's current state
    /// </summary>
    public PlayerSnapshotDto BuildPlayerSnapshot(int accountId)
    {
        return playerManager.BuildPlayerSnapshot(accountId);
    }

    /// <summary>
    /// Mark player for snapshot update
    /// </summary>
    public void MarkPlayerForSnapshotUpdate(int accountId)
    {
        playerManager.MarkPlayerForSnapshotUpdate(accountId);
    }
}
