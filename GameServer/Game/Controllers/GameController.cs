using System.Numerics;
using Server.Game.Models;
using Server.Game.Services;
using Server.Game.Services.Entities;

namespace Server.Game.Controllers;

/// <summary>
/// Main game controller that orchestrates all other controllers and provides a clean interface for game operations
/// TODO:
///  - Change spawn point generation to be done ahead of time (perhaps every 10-20 seconds)
///  - Simply store a list of valid spawns and assign on player join rather than calculate
/// </summary>
public sealed class GameController
{
    private readonly EntityManager _entityManager;
    private readonly SessionManager _sessionManager;
    private readonly InterestManager _interestManager;
    private readonly TerrainSystem _terrainSystem;
    private readonly PlayerManager _playerManager;
    private readonly PowerSystem _powerSystem;
    private readonly ChunkSystem _chunkSystem;
    private readonly CollisionSystem _collisionSystem;

    // per-tick patches we'll drain after Update
    private readonly List<object> _patchBuffer;

    public uint TerrainSeed => _terrainSystem.TerrainSeed;
    private WorldBorder WorldBorder { get; }

    private readonly List<int> _recentSpawnedAccounts = new();

    public GameController(
        EntityManager entityManager,
        SessionManager sessionManager,
        InterestManager interestManager,
        TerrainSystem terrainSystem,
        PlayerManager playerManager,
        List<object> patchBuffer,
        WorldBorder worldBorder,
        PowerSystem powerSystem,
        ChunkSystem chunkSystem,
        CollisionSystem collisionSystem)
    {
        _entityManager = entityManager;
        _sessionManager = sessionManager;
        _interestManager = interestManager;
        _terrainSystem = terrainSystem;
        _playerManager = playerManager;
        _patchBuffer = patchBuffer;
        WorldBorder = worldBorder;
        _powerSystem = powerSystem;
        _chunkSystem = chunkSystem;
        _collisionSystem = collisionSystem;

        // Generate initial world content
        GenerateStones(TerrainSeed);
        GenerateTrees(TerrainSeed);
    }


    /// <summary>
    /// Main game update loop
    /// </summary>
    public void Update(long serverTick)
    {
        // Handle session timeouts and forfeit players
        HandleSessionTimeouts();

        // Update all entities
        _entityManager.Update(); // Update entity behaviour
        _interestManager.Update(_entityManager.GetPlayersNeedingUpdatedInterest()); // Update all players views
    }

    private void HandleSessionTimeouts()
    {
        var timedOutSessions = _sessionManager.GetTimedOutSessions();
        foreach (var session in timedOutSessions)
        {
            Console.WriteLine($"Session timed out for AccountId: {session.AccountId}, forfeiting village");
            _entityManager.ClearEntitiesForPlayer(session.AccountId); // Clear entities
            _sessionManager.ClearSessionForPlayer(session.AccountId); // Clear session + bootstrapped status
        }
    }

    // ----- Session Management -----

    public List<object> DrainPatches()
    {
        if (_patchBuffer.Count == 0) return [];
        var outList = new List<object>(_patchBuffer);
        _patchBuffer.Clear();
        return outList;
    }

    // ----- World Generation -----

    private void GenerateTrees(uint terrainSeed)
    {
        var treeNoise = new TerrainSystem(terrainSeed + 1, scale: 10, octaves: 1, lacunarity: 1.6, persistence: 0.4);
        var (minX, minY, maxX, maxY) = WorldBorder.Bounds;

        for (var tx = minX; tx < maxX; tx++)
        {
            for (var ty = minY; ty < maxY; ty++)
            {
                var terrainNoise = _terrainSystem.GetNoiseValue(tx, ty);
                var treePatchNoise = treeNoise.GetNoiseValue(tx, ty);

                var shouldPlaceTree = false;
                const float guaranteedTreeThreshold = 0.66f;
                const float startingTreeThreshold = 0.50f;

                switch (terrainNoise)
                {
                    case >= guaranteedTreeThreshold:
                        shouldPlaceTree = true;
                        break;
                    case >= startingTreeThreshold and < guaranteedTreeThreshold:
                    {        
                        var t = (float)((terrainNoise - startingTreeThreshold) / (guaranteedTreeThreshold - startingTreeThreshold));
                        t = Math.Clamp(t, 0f, 1f);

                        var terrainInfluence = 0.999f + 0.001f * t;
                        var adjustedThreshold = 0.67f + (1.0f - terrainInfluence) * 0.3f;

                        if (treePatchNoise > adjustedThreshold)
                            shouldPlaceTree = true;

                        break;
                    }
                }

                if (!shouldPlaceTree) continue;
                _entityManager.TryCreateEntity(EEntityType.Tree, tx, ty, out _);
            }
        }

        Console.WriteLine($"Generated trees across the world");
    }

    private void GenerateStones(uint terrainSeed)
    {
        var stonePatch = new TerrainSystem(terrainSeed + 3, scale: 20, octaves: 1, lacunarity: 1.6, persistence: 0.4);
        var (minX, minY, maxX, maxY) = WorldBorder.Bounds;

        for (var tx = minX; tx < maxX; tx++)
        {
            for (var ty = minY; ty < maxY; ty++)
            {
                var terrainType = _terrainSystem.GetTerrainType(tx, ty);
                if (terrainType != TerrainType.Grass1 && terrainType != TerrainType.Grass2 &&
                    terrainType != TerrainType.Beach1 && terrainType != TerrainType.Beach2)
                    continue;

                var patch = stonePatch.GetNoiseValue(tx, ty);
                if (patch <= 0.82) continue;

                _entityManager.TryCreateEntity(EEntityType.Stone, tx, ty, out _);
            }
        }
        
        Console.WriteLine($"Generated stones across the world");
    }
    
    /// <summary>
    /// Ensure player is properly bootstrapped with initial entities
    /// </summary>
    public void EnsurePlayerBootstrap(int accountId)
    {
        var hasEntities = _entityManager.HasEntities(accountId);
        if (hasEntities) return;

        // Initialize player in PlayerManager
        _playerManager.InitializePlayer(accountId);

        var spawnTile = FindSpawnTile(accountId);
        _playerManager.SetHomeTile(accountId, spawnTile);

        // Create castle (building)
        _entityManager.TryCreateEntity(
            type: EEntityType.Castle,
            tx: spawnTile.tx,
            ty: spawnTile.ty,
            out _,
            ownerId: accountId
        );

        // Create villagers (units)
        _entityManager.TryCreateEntity(
            type: EEntityType.Villager,
            tx: spawnTile.tx + 2,
            ty: spawnTile.ty,
            out _,
            ownerId: accountId
        );

        _entityManager.TryCreateEntity(
            type: EEntityType.Villager,
            tx: spawnTile.tx - 1,
            ty: spawnTile.ty + 1,
            out _,
            ownerId: accountId
        );

        _entityManager.TryCreateEntity(
            type: EEntityType.Swordsman,
            tx: spawnTile.tx - 2,
            ty: spawnTile.ty + 1,
            out _,
            ownerId: accountId
        );

        _playerManager.AddHouse(accountId, 2);
        _playerManager.IncrementPopulationUsed(accountId, 2);
        RegisterSpawnedPlayer(accountId);
    }

    private TilePos FindSpawnTile(int accountId)
    {
        var (minX, minY, maxX, maxY) = WorldBorder.Bounds;
        var centerX = (minX + maxX) / 2;
        var centerY = (minY + maxY) / 2;
        var worldCenter = new TilePos(centerX, centerY);
    
        var otherAccounts = _sessionManager
            .GetAllAccountIds()
            .Where(id => id != accountId)
            .ToList();
    
        if (otherAccounts.Count == 0)
            return FindNearestClearAround(worldCenter);
    
        // All existing players with power + home
        var allPlayers = otherAccounts
            .Select(id => new
            {
                AccountId = id,
                Power = _powerSystem.GetPlayerPower(id),
                Home = _playerManager.GetHomeTile(id)
            })
            .Where(p => p.Power > 0)
            .ToList();
    
        if (allPlayers.Count == 0)
            return FindNearestClearAround(worldCenter);
    
        // Recent players we’ll *generate rings from*
        var allById = allPlayers.ToDictionary(p => p.AccountId, p => p);
    
        var spawnSources = _recentSpawnedAccounts
            .Where(id => allById.ContainsKey(id))
            .Select(id => allById[id])
            .ToList();
    
        // Fallback if we don’t yet have 10 recents (early in game)
        if (spawnSources.Count == 0)
        {
            spawnSources = allPlayers
                .OrderByDescending(p => p.Power) // or whatever heuristic
                .Take(10)
                .ToList();
        }
    
        var maxDistToCorner = Math.Sqrt(
            Math.Pow(centerX - minX, 2) +
            Math.Pow(centerY - minY, 2)
        );
    
        // ---- tuning knobs ----
        const double baseRadius = 80.0;
        const double radiusPerSqrtPower = 1.0;
        const double ringTolerance = 10.0;
        const int pointsPerRing = 24;
    
        var candidateTiles = new List<TilePos>();
    
        // 1) Generate candidates from rings of the last ~10 players (spawnSources)
        foreach (var p in spawnSources)
        {
            var targetRadius = baseRadius + radiusPerSqrtPower * Math.Sqrt(p.Power);
    
            for (var i = 0; i < pointsPerRing; i++)
            {
                var angle = 2 * Math.PI * i / pointsPerRing;
    
                var fx = p.Home.tx + targetRadius * Math.Cos(angle);
                var fy = p.Home.ty + targetRadius * Math.Sin(angle);
    
                var tx = (int)Math.Round(fx);
                var ty = (int)Math.Round(fy);
                var candidate = new TilePos(tx, ty);
    
                if (!WorldBorder.ContainsTile(candidate))
                    continue;
    
                // Inner dead‑zone: too close to ANY existing player? reject.
                var tooCloseToAnyPlayer = false;
                foreach (var other in allPlayers)
                {
                    var dx = tx - other.Home.tx;
                    var dy = ty - other.Home.ty;
                    var dist = Math.Sqrt(dx * dx + dy * dy);
    
                    var otherRadius = baseRadius + radiusPerSqrtPower * Math.Sqrt(other.Power);
                    var innerSafeRadius = otherRadius * 0.7; // tweak 0.7–0.9 as you like
    
                    if (dist < innerSafeRadius)
                    {
                        tooCloseToAnyPlayer = true;
                        break;
                    }
                }
    
                if (tooCloseToAnyPlayer)
                    continue;
    
                if (!HasClearSpawnArea(candidate))
                    continue;
    
                if (HasEnemyEntitiesAroundSpawnPoint(candidate))
                    continue;
    
                candidateTiles.Add(candidate);
            }
        }
    
        if (candidateTiles.Count == 0)
            return FindNearestClearAround(worldCenter);
    
        // 2) Score candidates: ring overlap vs ALL players + center bias
        TilePos bestPos = candidateTiles[0];
        float bestScore = float.NegativeInfinity;
    
        foreach (var candidate in candidateTiles)
        {
            var tx = candidate.tx;
            var ty = candidate.ty;
    
            var dxCenter = tx - centerX;
            var dyCenter = ty - centerY;
            var distToCenter = Math.Sqrt(dxCenter * dxCenter + dyCenter * dyCenter);
            var centerScore = 1.0f - (float)(distToCenter / maxDistToCorner);
            centerScore = Math.Clamp(centerScore, 0f, 1f);
    
            float best1 = 0f, best2 = 0f;
    
            foreach (var p in allPlayers)
            {
                var dx = tx - p.Home.tx;
                var dy = ty - p.Home.ty;
                var dist = Math.Sqrt(dx * dx + dy * dy);
    
                var targetRadius = baseRadius + radiusPerSqrtPower * Math.Sqrt(p.Power);
                var dev = Math.Abs(dist - targetRadius);
    
                var ringForThisPlayer = 1f - (float)Math.Clamp(dev / ringTolerance, 0.0, 1.0);
    
                if (ringForThisPlayer > best1)
                {
                    best2 = best1;
                    best1 = ringForThisPlayer;
                }
                else if (ringForThisPlayer > best2)
                {
                    best2 = ringForThisPlayer;
                }
            }
    
            var singleRing = best1;
            var multiRingBoost = best1 * best2;
            var ringScore = 0.5f * singleRing + 0.5f * multiRingBoost;
    
            const float centerWeight = 0.4f;
            const float ringWeight = 0.6f;
            var score = centerWeight * centerScore + ringWeight * ringScore;
    
            if (score > bestScore)
            {
                bestScore = score;
                bestPos = candidate;
            }
        }
    
        return bestPos;
    }

    private TilePos FindNearestClearAround(TilePos origin, int maxRadius = 32)
    {
        for (var r = 0; r <= maxRadius; r++)
        {
            for (var dx = -r; dx <= r; dx++)
            {
                for (var dy = -r; dy <= r; dy++)
                {
                    if (Math.Abs(dx) != r && Math.Abs(dy) != r) continue;

                    var candidate = new TilePos(origin.tx + dx, origin.ty + dy);

                    if (!HasClearSpawnArea(candidate))
                        continue;

                    if (HasEnemyEntitiesAroundSpawnPoint(candidate))
                        continue;

                    return candidate;
                }
            }
        }

        return origin;
    }

    private void RegisterSpawnedPlayer(int accountId)
    {
        _recentSpawnedAccounts.Remove(accountId);
        _recentSpawnedAccounts.Add(accountId);

        const int maxRecent = 10;
        if (_recentSpawnedAccounts.Count > maxRecent)
        {
            _recentSpawnedAccounts.RemoveAt(0);
        }
    }

    private bool HasClearSpawnArea(TilePos tilePos)
    {
        const int spawnSquareSize = 6;
        var tileOffset = spawnSquareSize / 2 - 1;

        var checkTilePos = new Vector2(tilePos.tx - tileOffset, tilePos.ty - tileOffset);
        
        var result = _collisionSystem.CheckCollision(checkTilePos, new Size(spawnSquareSize, spawnSquareSize));
        return !result.HasCollision;
    }

    private bool HasEnemyEntitiesAroundSpawnPoint(TilePos tilePos)
    {
        var chunkPos = ChunkSystem.GetChunkCoords(tilePos);
        for (var dx = -1; dx <= 1; dx++)
        {
            for (var dy = -1; dy <= 1; dy++)
            {
                var sampleChunkPos = new ChunkPos(chunkPos.cx + dx, chunkPos.cy + dy);
                if (HasEnemyEntitiesInChunk(sampleChunkPos)) return true;
            }
        }

        return false;
    }

    private bool HasEnemyEntitiesInChunk(ChunkPos chunkPos)
    {
        var entities = _chunkSystem.GetEntityIdsInChunk(chunkPos);
        foreach (var entity in entities.Select(entityId => _entityManager.GetEntity(entityId)))
        {
            if (entity?.OwnerId != null) return true;
        }

        return false;
    }

    public float GetPlayerPower(int accountId)
    {
        return _powerSystem.GetPlayerPower(accountId);
    }
}
