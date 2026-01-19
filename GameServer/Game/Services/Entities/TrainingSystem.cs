using System.Collections.Concurrent;
using System.Numerics;
using Server.Game.Models;

namespace Server.Game.Services.Entities;

internal sealed class TrainingSystem(
    EntityManager entityManager, 
    CollisionSystem collisionSystem, 
    ChunkSystem chunkSystem, 
    PlayerManager playerManager, 
    GameData gameData, 
    HashSet<int> playersNeedingInterest,
    TerrainSystem terrainSystem,
    List<object> patchBuffer)
{

    private sealed class QueueState
    {
        public int OwnerId;
        public readonly Queue<EEntityType> Queue = new();
        public int TicksLeft;
        public int TotalTicks;
        public EEntityType? CurrentType;
    }

    private readonly ConcurrentDictionary<string, QueueState> _queues = new(StringComparer.Ordinal);

    public (bool ok, string? error) TryEnqueueTraining(int accountId, string buildingId, EEntityType unitType)
    {
        Console.WriteLine($"Attempting to enqueue training for account {accountId}, unit {unitType.ToString()}");
        // Validate building
        var building = entityManager.GetEntity(buildingId);
        if (building is null) return (false, "not_found");
        if (building.OwnerId != accountId) return (false, "forbidden");
        if (building.Category != EEntityCategory.Building) return (false, "not_a_building");
        
        // Validate unit is trainable and trained here
        var unitConfig = gameData.TryGet(unitType);
        if (unitConfig is null || unitConfig.category != EEntityCategory.Unit) return (false, "not_a_unit");
        if (unitConfig.unit.trainedAt is null || unitConfig.unit.trainedAt.Value != building.Type)
            return (false, "wrong_building");
        
        // Get or create queue before cost deduction
        var state = _queues.GetOrAdd(buildingId, _ => new QueueState { OwnerId = accountId });

        var currentCount = state.Queue.Count + (state.CurrentType is not null ? 1 : 0);
        if (currentCount >= 10)
            return (false, "queue_full");

        // Organise units into 5 sequence groups.
        var sequence = new List<EEntityType>();
        if (state.CurrentType is not null)
            sequence.Add(state.CurrentType.Value);
        sequence.AddRange(state.Queue);
        sequence.Add(unitType);

        var setCount = 0;
        EEntityType? lastType = null;
        foreach (var t in sequence)
        {
            if (lastType is null || t != lastType.Value)
            {
                setCount++;
                lastType = t;
                if (setCount > 5)
                    return (false, "too_many_training_sets");
            }
        }
        
        // Validate and deduct cost
        var cost = unitConfig.unit.cost;
        if (!playerManager.CanAfford(accountId, cost))
            return (false, "insufficient_resources");

        var popCap = playerManager.GetPopulationCap(accountId);
        var used = playerManager.GetPopulationUsed(accountId);
        if (used + 1 > popCap)
            return (false, "insufficient_population");
        
        playerManager.Deduct(accountId, cost);
        
        state.Queue.Enqueue(unitType);

        if (state is { TicksLeft: <= 0, CurrentType: null })
            StartNext(buildingId, building, state, accountId);

        EmitQueuePatch(buildingId, state, accountId);
        
        Console.WriteLine($"Unit {unitType.ToString()} queued for account {accountId}");
        return (true, null);
    }

    public (bool ok, string? error) TryCancelTraining(int accountId, string buildingId, int setIndex)
    {
        if (!_queues.TryGetValue(buildingId, out var state))
            return (false, "no_training_queue");
    
        var building = entityManager.GetEntity(buildingId);
        if (building is null) return (false, "not_found");
        if (building.OwnerId != accountId) return (false, "forbidden");
    
        // Build contiguous sets over [CurrentType?, Queue...]
        var types = new List<EEntityType>();
        if (state.CurrentType is not null)
            types.Add(state.CurrentType.Value);
        types.AddRange(state.Queue);
    
        if (types.Count == 0) return (false, "empty_queue");
    
        var segments = new List<(int start, int end, EEntityType type)>();
        EEntityType? last = null;
        var segStart = 0;
        for (var i = 0; i < types.Count; i++)
        {
            if (last is null || types[i] != last.Value)
            {
                if (last is not null)
                    segments.Add((segStart, i - 1, last.Value));
                segStart = i;
                last = types[i];
            }
        }
        if (last is not null)
            segments.Add((segStart, types.Count - 1, last.Value));
    
        if (setIndex < 0 || setIndex >= segments.Count)
            return (false, "bad_set_index");
    
        var (start, end, type) = segments[setIndex];
    
        // Cancel from the end of this segment
        var cancelIndex = end;
        var hasCurrent = state.CurrentType is not null;
    
        if (cancelIndex == 0 && hasCurrent)
        {
            // cancel the currently training unit
            state.CurrentType = null;
            state.TicksLeft = 0;
            state.TotalTicks = 0;
    
            if (state.Queue.Count > 0 && building.OwnerId.HasValue)
                StartNext(buildingId, building, state, building.OwnerId.Value);
        }
        else
        {
            var queueIndex = cancelIndex - (hasCurrent ? 1 : 0);
            if (queueIndex < 0 || queueIndex >= state.Queue.Count)
                return (false, "bad_cancel_index");
    
            var newQueue = new Queue<EEntityType>();
            var idx = 0;
            foreach (var q in state.Queue)
            {
                if (idx != queueIndex)
                    newQueue.Enqueue(q);
                idx++;
            }
            state.Queue.Clear();
            foreach (var q in newQueue)
                state.Queue.Enqueue(q);
        }
        
        var cfg = gameData.TryGet(type);
        if (cfg is { category: EEntityCategory.Unit })
        {
            playerManager.AddResources(accountId, cfg.unit.cost);
        }
    
        if (building.OwnerId.HasValue)
            EmitQueuePatch(buildingId, state, building.OwnerId.Value);
    
        return (true, null);
    }
    
    public void Update(ConcurrentDictionary<string, Entity> buildings)
    {
        foreach (var kvp in _queues)
        {
            var buildingId = kvp.Key;
            var state = kvp.Value;

            if (!buildings.TryGetValue(buildingId, out var building) || building.OwnerId is null)
            {
                _queues.TryRemove(buildingId, out _);
                continue;
            }

            var ownerId = building.OwnerId.Value;

            if (state.TicksLeft > 0)
            {
                state.TicksLeft--;

                EmitQueuePatch(buildingId, state, ownerId);
                
                if (state.TicksLeft > 0) continue;

                if (TrySpawnTrainedUnit(building, state.CurrentType!.Value, building.OwnerId.Value))
                {
                    state.CurrentType = null;
                    StartNext(buildingId, building, state, ownerId);
                }
                else
                {
                    state.TicksLeft = 0;
                    state.TotalTicks = 0;
                    EmitQueuePatch(buildingId, state, ownerId);
                }
            }
            else if (state.CurrentType is not null)
            {
                if (TrySpawnTrainedUnit(building, state.CurrentType.Value, building.OwnerId.Value))
                {
                    state.CurrentType = null;
                    StartNext(buildingId, building, state, ownerId);
                }
            }
            else if (state.Queue.Count > 0)
            {
                StartNext(buildingId, building, state, ownerId);
            }
        }
    }

    private void StartNext(string buildingId, Entity building, QueueState state, int ownerId)
    {
        if (state.Queue.Count == 0)
        {
            state.CurrentType = null;
            state.TicksLeft = 0;
            state.TotalTicks = 0;
            EmitQueuePatch(buildingId, state, ownerId);
            return;
        }

        var nextType = state.Queue.Peek();
        var config = gameData.TryGet(nextType);
        var time = Math.Max(0, config?.unit.trainingTime ?? 0);

        state.CurrentType = state.Queue.Dequeue();
        state.TicksLeft = time;
        state.TotalTicks = time;

        EmitQueuePatch(buildingId, state, ownerId);
    }

    private bool TrySpawnTrainedUnit(Entity building, EEntityType unitType, int ownerId)
    {
        Console.WriteLine($"Trying to spawn unit {unitType.ToString()}");
        var size = building.CollisionSize ?? new Size(1, 1);
        var centerX = building.Tx + size.w / 2;
        var centerY = building.Ty + size.h / 2;

        if (!TryFindFreeTile(centerX, centerY, out var spawnTx, out var spawnTy))
            return false;

        var popCap = playerManager.GetPopulationCap(ownerId);
        var used = playerManager.GetPopulationUsed(ownerId);
        if (used + 1 > popCap)
            return false;

        entityManager.TryCreateEntity(unitType, spawnTx, spawnTy, out _, ownerId);
        
        playerManager.IncrementPopulationUsed(ownerId);

        var chunk = ChunkSystem.GetChunkCoords(new TilePos(spawnTx, spawnTy));
        foreach (var pid in chunkSystem.GetPlayersForChunk(chunk))
            playersNeedingInterest.Add(pid);
        
        Console.WriteLine($"Spawned unit {unitType.ToString()}");
        return true;
    }

    private bool TryFindFreeTile(int cx, int cy, out int tx, out int ty, int maxRadius = 5)
    {
        var unitSize = new Size(1, 1);

        for (var r = 0; r <= maxRadius; r++)
        {
            for (var dx = -r; dx <= r; dx++)
            {
                for (var dy = -r; dy <= r; dy++)
                {
                    if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                    var x = cx + dx;
                    var y = cy + dy;

                    if (!terrainSystem.IsAreaPassable(x, y, unitSize.w, unitSize.h)) continue;

                    var result = collisionSystem.CheckCollision(new Vector2(x, y), unitSize);
                    if (!result.HasCollision)
                    {
                        tx = x;
                        ty = y;
                        return true;
                    }
                }
            }
        }

        tx = 0;
        ty = 0;
        return false;
    }

    private void EmitQueuePatch(string buildingId, QueueState state, int ownerId)
    {
        var payload = new
        {
            t = "training_queue",
            buildingId,
            queue = state.Queue.Select(x => x.ToString()).ToArray(),
            currentTypeId = state.CurrentType?.ToString(),
            ticksLeft = state.TicksLeft,
            totalTicks = state.TotalTicks,
            accountId = ownerId
        };
        
        patchBuffer.Add(payload);
    }

}