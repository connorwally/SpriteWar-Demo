using System.Collections.Concurrent;
using Server.Game.Models;

namespace Server.Game.Services;

/// <summary>
/// Manages world chunks and player interest areas for efficient data distribution
/// </summary>
public sealed class ChunkSystem
{
    private const int ChunkSize = 16; // 16x16 tiles per chunk (matches client)
    private readonly ConcurrentDictionary<int, HashSet<ChunkPos>> _playerChunks = new(); // A set of chunks by player
    private readonly ConcurrentDictionary<ChunkPos, HashSet<int>> _chunkPlayers = new(); // A set of players by chunk
    private readonly ConcurrentDictionary<ChunkPos, HashSet<string>> _chunkEntities = new(); // A set of entities by chunk

    /// <summary>
    /// Get the chunk coordinates for a given tile position
    /// </summary>
    public static ChunkPos GetChunkCoords(TilePos tilePos)
    {
        // Use Math.Floor to match client-side Math.floor behavior
        // This ensures consistent chunk calculation for negative coordinates
        return new ChunkPos((int)Math.Floor((double)tilePos.tx / ChunkSize), (int)Math.Floor((double)tilePos.ty / ChunkSize));
    }

    /// <summary>
    /// Get all chunks that should be visible to a player based on their entities
    /// This includes the chunk containing the entity plus surrounding chunks
    /// </summary>
    public HashSet<ChunkPos> GetInterestChunks(HashSet<ChunkPos> entityChunks)
    {
        var interestChunks = new HashSet<ChunkPos>();

        foreach (var (cx, cy) in entityChunks)
        {
            // Add the chunk itself plus all 8 surrounding chunks
            for (int dx = -1; dx <= 1; dx++)
            {
                for (int dy = -1; dy <= 1; dy++)
                {
                    interestChunks.Add(new ChunkPos(cx + dx, cy + dy));
                }
            }
        }

        return interestChunks;
    }

    /// <summary>
    /// Update a player's subscribed chunks based on their entities
    /// </summary>
    public void UpdatePlayerChunks(int accountId, HashSet<ChunkPos> entityChunks)
    {
        var interestChunks = GetInterestChunks(entityChunks);

        if (_playerChunks.TryGetValue(accountId, out var old) && old.SetEquals(interestChunks))
            return;

        // Remove old chunks
        if (_playerChunks.TryGetValue(accountId, out var oldChunks))
        {
            foreach (var chunk in oldChunks)
            {
                if (!interestChunks.Contains(chunk))
                {
                    _chunkPlayers.AddOrUpdate(chunk,
                        new HashSet<int>(),
                        (key, existing) =>
                        {
                            existing.Remove(accountId);
                            return existing;
                        });
                }
            }
        }

        // Add new chunks
        _playerChunks.AddOrUpdate(accountId,
            interestChunks,
            (key, existing) =>
            {
                existing.Clear();
                foreach (var chunk in interestChunks)
                {
                    existing.Add(chunk);
                }

                return existing;
            });

        // Update reverse mapping
        foreach (var chunk in interestChunks)
        {
            _chunkPlayers.AddOrUpdate(chunk,
                new HashSet<int> { accountId },
                (key, existing) =>
                {
                    existing.Add(accountId);
                    return existing;
                });
        }
    }

    /// <summary>
    /// Get all players who should receive updates for a specific chunk
    /// </summary>
    public HashSet<int> GetPlayersForChunk(ChunkPos chunkPos)
    {
        return _chunkPlayers.TryGetValue(chunkPos, out var players) ? players : [];
    }

    /// <summary>
    /// Get all chunks a player is currently subscribed to
    /// </summary>
    public HashSet<ChunkPos> GetPlayerChunks(int accountId)
    {
        return _playerChunks.TryGetValue(accountId, out var chunks) ? chunks : [];
    }

    /// <summary>
    /// Register an entity in a chunk
    /// </summary>
    public void RegisterEntity(string entityId, TilePos tilePos)
    {
        var chunk = GetChunkCoords(tilePos);
        _chunkEntities.AddOrUpdate(chunk,
            [entityId],
            (key, existing) =>
            {
                existing.Add(entityId);
                return existing;
            });
    }

    /// <summary>
    /// Unregister an entity from a chunk
    /// </summary>
    public void UnregisterEntity(string entityId, TilePos tilePos)
    {
        var chunk = GetChunkCoords(tilePos);
        if (_chunkEntities.TryGetValue(chunk, out var entities))
        {
            entities.Remove(entityId);
        }
    }

    /// <summary>
    /// Get all entities in a specific chunk
    /// </summary>
    public HashSet<string> GetEntityIdsInChunk(ChunkPos chunkPos)
    {
        return _chunkEntities.TryGetValue(chunkPos, out var entities) ? entities : new HashSet<string>();
    }

    /// <summary>
    /// Get all entities that should be visible to a player based on their subscribed chunks
    /// </summary>
    public HashSet<string> GetVisibleEntities(int accountId)
    {
        var visibleEntities = new HashSet<string>();
        var playerChunks = GetPlayerChunks(accountId);

        foreach (var chunk in playerChunks)
        {
            var entities = GetEntityIdsInChunk(chunk);
            foreach (var entityId in entities)
            {
                visibleEntities.Add(entityId);
            }
        }

        return visibleEntities;
    }

    /// <summary>
    /// Remove a player and clean up their chunk subscriptions
    /// </summary>
    public void RemovePlayer(int accountId)
    {
        if (_playerChunks.TryRemove(accountId, out var chunks))
        {
            foreach (var chunk in chunks)
            {
                if (_chunkPlayers.TryGetValue(chunk, out var players))
                {
                    players.Remove(accountId);
                    if (players.Count == 0)
                    {
                        _chunkPlayers.TryRemove(chunk, out _);
                    }
                }
            }
        }
    }
}