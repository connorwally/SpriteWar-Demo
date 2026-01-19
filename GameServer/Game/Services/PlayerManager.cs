using System.Collections.Concurrent;
using Server.Game.Models;

namespace Server.Game.Services;

public record Resources(int wood, int food, int gold, int stone);

public record PlayerSnapshotDto(string id, Resources resources, TilePos homeTile, int popUsed, int popCap);

public class PlayerManager(HashSet<int> playersNeedingSnapshot, List<object> patchBuffer)
{
    private readonly ConcurrentDictionary<int, Resources> _playerResources = new();
    private readonly ConcurrentDictionary<int, TilePos> _playerHomeTiles = new();
    private readonly ConcurrentDictionary<int, int> _playerHouseCounts = new();
    private readonly ConcurrentDictionary<int, int> _playerPopUsed = new();

    /// <summary>
    /// Initialise the player with starting resources and a home tile
    /// Called on player bootstrap
    /// </summary>
    /// <param name="accountId"></param>
    public void InitializePlayer(int accountId)
    {
        _playerResources.TryAdd(accountId, new Resources(wood: 50, food: 50, gold: 0, stone: 0));
        _playerHomeTiles.TryAdd(accountId, new TilePos(0, 0));
        _playerPopUsed.TryAdd(accountId, 0);
        _playerHouseCounts.TryAdd(accountId, 0);
    }

    /// <summary>
    /// Build a snapshot of the current player's resources and home tile.
    /// </summary>
    /// <param name="accountId"></param>
    /// <returns></returns>
    public PlayerSnapshotDto BuildPlayerSnapshot(int accountId)
    {

        var resources = GetPlayerResources(accountId);
        
        var homeTile = _playerHomeTiles.TryGetValue(accountId, out var home) 
            ? home 
            : new TilePos(0, 0);

        return new PlayerSnapshotDto(
            id: accountId.ToString(),
            resources: resources,
            homeTile: homeTile,
            popUsed: GetPopulationUsed(accountId),
            popCap: GetPopulationCap(accountId)
        );
    }

    /// <summary>
    /// Checked when player tries to place building
    /// </summary>
    /// <param name="accountId"></param>
    /// <param name="cost"></param>
    /// <returns></returns>
    public bool CanAfford(int accountId, Resources cost)
    {
        if (!_playerResources.TryGetValue(accountId, out var resources))
            return false;

        return resources.food >= cost.food && resources.wood >= cost.wood && resources.stone >= cost.stone &&
               resources.gold >= cost.gold;
    }

    /// <summary>
    /// Remove the resource cost from the player's materials
    /// </summary>
    /// <param name="accountId"></param>
    /// <param name="cost"></param>
    public void Deduct(int accountId, Resources cost)
    {
        if (!_playerResources.TryGetValue(accountId, out var currentResources))
            return;
        
        var newResources = new Resources(
            Math.Max(0, currentResources.wood - cost.wood), 
            Math.Max(0, currentResources.food - cost.food), 
            Math.Max(0, currentResources.gold - cost.gold), 
            Math.Max(0, currentResources.stone - cost.stone));
        
        _playerResources.AddOrUpdate(accountId, newResources, (_, _) => newResources);
        SendResourceUpdate(accountId);
    }

    /// <summary>
    /// Add resources to the player
    /// Called on resource gathering (aggregated per tick)
    /// </summary>
    /// <param name="accountId"></param>
    /// <param name="toAdd"></param>
    public void AddResources(int accountId, Resources toAdd)
    {
        if (!_playerResources.TryGetValue(accountId, out var currentResources))
            currentResources = new Resources(wood: 0, food: 0, gold: 0, stone: 0);
        
        var newResources = new Resources(
            Math.Max(0, currentResources.wood + toAdd.wood), 
            Math.Max(0, currentResources.food + toAdd.food), 
            Math.Max(0, currentResources.gold + toAdd.gold), 
            Math.Max(0, currentResources.stone + toAdd.stone));
        
        
        _playerResources.AddOrUpdate(accountId, newResources, (_, _) => newResources);
        SendResourceUpdate(accountId);
    }

    public Resources GetPlayerResources(int accountId)
    {
        return _playerResources.TryGetValue(accountId, out var resources) 
            ? resources 
            : new Resources(wood: 50, food: 50, gold: 0, stone: 0);
    }

    public void SetHomeTile(int accountId, TilePos homeTile)
    {
        _playerHomeTiles.AddOrUpdate(accountId, homeTile, (_, _) => homeTile);
    }

    public TilePos GetHomeTile(int accountId)
    {
        return _playerHomeTiles.TryGetValue(accountId, out var homeTile) 
            ? homeTile 
            : new TilePos(0, 0);
    }

    public void RemovePlayer(int accountId)
    {
        _playerResources.TryRemove(accountId, out _);
        _playerHomeTiles.TryRemove(accountId, out _);
        _playerHouseCounts.TryRemove(accountId, out _);
        _playerPopUsed.TryRemove(accountId, out _);
    }

    public void MarkPlayerForSnapshotUpdate(int accountId)
    {
        playersNeedingSnapshot.Add(accountId);
    }

    public int GetPopulationUsed(int accountId)
    {
        return _playerPopUsed.GetValueOrDefault(accountId, 0);
    }

    public int GetPopulationCap(int accountId)
    {
        var houses = _playerHouseCounts.GetValueOrDefault(accountId, 0);
        return Math.Max(0, houses * 5);
    }

    public void AddHouse(int accountId, int count = 1)
    {
        var current = _playerHouseCounts.GetValueOrDefault(accountId);
        _playerHouseCounts.AddOrUpdate(accountId, current + count, (_, _) => current + count);
        SendPopulationUpdate(accountId);
    }

    public void RemoveHouse(int accountId)
    {
        var current = _playerHouseCounts.GetValueOrDefault(accountId);
        var next = Math.Max(0, current - 1);
        _playerHouseCounts.AddOrUpdate(accountId, next, (_, _) => next);
        SendPopulationUpdate(accountId);
    }

    public void IncrementPopulationUsed(int accountId, int count = 1)
    {
        var current = _playerPopUsed.GetValueOrDefault(accountId);
        _playerPopUsed.AddOrUpdate(accountId, current + count, (_, _) => current + count);
        SendPopulationUpdate(accountId);
    }

    public void DecrementPopulationUsed(int accountId)
    {
        var current = _playerPopUsed.GetValueOrDefault(accountId);
        var next = Math.Max(0, current - 1);
        _playerPopUsed.AddOrUpdate(accountId, next, (_, _) => next);
        SendPopulationUpdate(accountId);
    }

    private void SendResourceUpdate(int accountId)
    {

        var resources = GetPlayerResources(accountId);
        var resourceList = new List<object>
        {
            resources.wood,
            resources.food,
            resources.gold,
            resources.stone
        };

        patchBuffer.Add(new
        {
            t = "resource_update", 
            resources = new
            {
                resources.wood,
                resources.food,
                resources.gold,
                resources.stone
            }, 
            accountId
        });
    }

    private void SendPopulationUpdate(int accountId)
    {
        patchBuffer.Add(new
        {
            t = "population_update",
            popUsed = GetPopulationUsed(accountId),
            popCap = GetPopulationCap(accountId),
            accountId
        });
    }
}