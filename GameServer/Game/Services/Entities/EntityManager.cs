using System.Collections.Concurrent;
using System.Numerics;
using Server.Game.Models;
using Server.Game.Models.DTOs;
using Server.Game.Services.Entities.Pathfinding;

namespace Server.Game.Services.Entities;

public class EntityManager
{
    private readonly CollisionSystem _collisionSystem;
    private readonly ChunkSystem _chunkSystem;
    private readonly TerrainSystem _terrainSystem;
    private readonly SessionManager _sessionManager;
    private readonly List<object> _patchBuffer;
    private readonly PlayerManager _playerManager;
    private readonly GameData _gameData;

    private readonly ConcurrentDictionary<string, Entity> _entities = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<int, HashSet<string>> _entitiesByOwner = new();
    private readonly ConcurrentDictionary<string, Entity> _combatEntities = new();
    private readonly ConcurrentDictionary<string, Entity> _movableEntities = new();

    private readonly HashSet<int> _playersNeedingUpdate = [];

    private readonly MoveSystem _moveSystem;
    private readonly CombatSystem _combatSystem;
    private readonly TrainingSystem _trainingSystem;

    public EntityManager(CollisionSystem collisionSystem, ChunkSystem chunkSystem, TerrainSystem terrainSystem, 
        SessionManager sessionManager, List<object> patchBuffer, PlayerManager playerManager, GameData gameData, PathPlanner pathPlanner)
    {
        _collisionSystem = collisionSystem;
        _chunkSystem = chunkSystem;
        _terrainSystem = terrainSystem;
        _patchBuffer = patchBuffer;
        _playerManager = playerManager;
        _sessionManager = sessionManager;
        _gameData = gameData;

        _moveSystem = new MoveSystem(_collisionSystem, _chunkSystem, _patchBuffer, pathPlanner);
        _combatSystem = new CombatSystem(this, _collisionSystem, _playersNeedingUpdate, _gameData, _chunkSystem, _playerManager, _patchBuffer);
        _trainingSystem = new TrainingSystem(this, _collisionSystem, _chunkSystem, _playerManager, _gameData,
            _playersNeedingUpdate, _terrainSystem, _patchBuffer);
    }

    public void Update()
    {
        _moveSystem.Update(_movableEntities,
            _playersNeedingUpdate, _entities); // TODO: Can we change this "_playersNeedingUpdate" from full refresh to single entity DTO's - patchBuffer?
        _combatSystem.Update(_combatEntities);     
  
        _trainingSystem.Update(_entities);
    }

    public void ClearEntitiesForPlayer(int accountId)
    {
        _entitiesByOwner.TryGetValue(accountId, out var entities);
        if(entities == null) return;
        
        foreach (var entityId in entities)
        {
            if (!_entities.TryGetValue(entityId, out var entity)) continue;
            
            entity.OwnerId = null;
            _patchBuffer.Add(new EntityPatchDto(Id: entity.Id, OwnerId: "-1"));

            lock (entities) entities.Remove(entityId);
        }
    }

    public void TryCreateEntity(EEntityType type, int tx, int ty, out Entity? entityOut, int? ownerId = null)
    {
        var entityData = _gameData.TryGet(type);
        if (entityData == null || !CanPlace(tx, ty, entityData.size))
        {
            entityOut = null;
            return;
        }

        var entity = new Entity
        {
            Id = GenerateEntityId(),
            Type = type,
            Tx = tx,
            Ty = ty,
            OwnerId = ownerId,
            Category = entityData.category,
            CollisionSize = entityData.size,
            Hp = entityData.baseHp,
        };

        _entities.TryAdd(entity.Id, entity);

        // byOwnerId
        if (ownerId.HasValue)
        {
            var set = _entitiesByOwner.GetOrAdd(ownerId.Value, _ => new HashSet<string>(StringComparer.Ordinal));
            lock (set) set.Add(entity.Id);
        }
        
        // movable
        if (entityData.unit.moveSpeed > 0)
            _movableEntities.TryAdd(entity.Id, entity);
        
        // combatable
        if (entityData.unit is { attackRange: > 0, attackDamage: > 0, attackableTypes.Count: > 0 } ||
            entityData.building is { attackDamage: > 0, attackRange: > 0, attackableTypes.Count: > 0 })
            _combatEntities.TryAdd(entity.Id, entity);
        
        AddCollisionComponent(entity);
        _chunkSystem.RegisterEntity(entity.Id, new TilePos(entity.Tx, entity.Ty));

        entityOut = entity;
    }

    public void DeleteEntity(string entityId)
    {
        if (!_entities.TryRemove(entityId, out var entity)) return;
        _collisionSystem.RemoveCollisionComponent(entityId);
        _chunkSystem.UnregisterEntity(entityId, new TilePos(entity.Tx, entity.Ty));

        if (entity.OwnerId.HasValue)
        {
            if (entity is { Category: EEntityCategory.Building, Type: EEntityType.House })
            {
                _playerManager.RemoveHouse(entity.OwnerId.Value);
            }
            else if (entity.Category == EEntityCategory.Unit)
            {
                _playerManager.DecrementPopulationUsed(entity.OwnerId.Value);
            }
            
            var set = _entitiesByOwner.GetOrAdd(entity.OwnerId.Value, _ => new HashSet<string>(StringComparer.Ordinal));
            lock (set) set.Remove(entity.Id);
        }

        if (entity is { OwnerId: not null, Type: EEntityType.Castle })
        {
            OnKingdomFallen(entity.OwnerId.Value);
        }

        var entityData = _gameData.TryGet(entity.Type);
        if (entityData == null) return;
        
        _movableEntities.TryRemove(entity.Id, out _);
        _combatEntities.TryRemove(entity.Id, out _);
    }

    public bool HasEntities(int accountId)
    {
        return _entitiesByOwner.TryGetValue(accountId, out var ids) && ids.Count > 0;
    }

    public List<Entity?> GetEntities(int accountId)
    {
        if (!_entitiesByOwner.TryGetValue(accountId, out var ids) || ids.Count == 0)
            return [];

        lock (ids)
        {
            return ids
                .Select(GetEntity)
                .Where(e => e is not null)
                .ToList(); // snapshot
        }
    }

    public Entity? GetEntity(string entityId)
    {
        _entities.TryGetValue(entityId, out var entity);
        return entity ?? null;
    }

    public (bool ok, string? error) TryPlaceBuilding(int accountId, EEntityType entityType, int tx,
        int ty)
    {
        var buildingData = _gameData.TryGet(entityType);
        if (buildingData == null) return (false, "no_building_of_type");

        // Check if player can afford the building
        if (!_playerManager.CanAfford(accountId, buildingData.building.cost))
            return (false, "insufficient_resources");

        // Check if position is within player's interest area
        if (!IsPositionInPlayerInterest(accountId, tx, ty))
            return (false, "outside_interest_area");
        
        TryCreateEntity(entityType, tx, ty, out var entity, accountId);

        if (entity is null)
            return (false, "failed_to_create");

        // Deduct resources using PlayerManager
        _playerManager.Deduct(accountId, buildingData.building.cost);
        
        // Update pop cap if house
        if (entityType == EEntityType.House)
        {
            _playerManager.AddHouse(accountId);
        }

        // Mark players in chunk for an update
        var c = ChunkSystem.GetChunkCoords(new TilePos(tx, ty));
        var oldInterestedPlayers = _chunkSystem.GetPlayersForChunk(c);
        foreach (var playerId in oldInterestedPlayers)
        {
            _playersNeedingUpdate.Add(playerId);
        }

        return (true, null);
    }

    public (int tx, int ty)? GetEntityPosition(string entityId)
    {
        if (_entities.TryGetValue(entityId, out var entity))
        {
            return (entity.Tx, entity.Ty);
        }

        return null;
    }

    public (bool ok, string? error) TryEnqueueMove(int accountId, string unitId, int tx, int ty)
    {
        if (!_entities.TryGetValue(unitId, out var e))
            return (false, "not_found");

        // Ownership check: only let the owner move their unit
        if (e.OwnerId != accountId)
            return (false, "forbidden");
        
        if (e.Category != EEntityCategory.Unit)
            return (false, "not_movable");

        e.TargetUnitId = null;
        e.CurrentPath = null;
        e.PathIndex = 0;
        e.TargetTx = tx;
        e.TargetTy = ty;

        return (true, null);
    }

    public (bool ok, string? error) TrySetTarget(int accountId, string unitId, string targetUnitId)
    {
        if (!_entities.TryGetValue(unitId, out var e) || !_entities.TryGetValue(targetUnitId, out _))
            return (false, "not_found");

        if (e.OwnerId != accountId)
            return (false, "forbidden");

        e.TargetTx = null;
        e.TargetTy = null;
        e.CurrentPath = null;
        e.PathIndex = 0;
        e.TargetUnitId = targetUnitId;
        return (true, null);
    }

    public (bool ok, string? error) TryEnqueueTraining(int accountId, string buildingId, EEntityType unitType)
    {
        return _trainingSystem.TryEnqueueTraining(accountId, buildingId, unitType);
    }

    public (bool ok, string? error) TryCancelTraining(int accountId, string buildingId, int setIndex)
    {
        return _trainingSystem.TryCancelTraining(accountId, buildingId, setIndex);
    }

    private void AddCollisionComponent(Entity entity)
    {
        var layer = entity.Category switch
        {
            EEntityCategory.Building => CollisionLayer.Buildings,
            EEntityCategory.Unit => CollisionLayer.Units,
            EEntityCategory.Resource => CollisionLayer.Resources,
            _ => CollisionLayer.Units
        };

        if (entity.CollisionSize == null) return;
        var collisionBox = new CollisionBox(
            new Vector2(entity.Tx, entity.Ty),
            entity.CollisionSize
        );

        var isPassable = entity.Type == EEntityType.Farm;

        var component = new CollisionComponent(
            entity.Id,
            layer,
            collisionBox,
            isPassable
        );

        _collisionSystem.AddOrUpdateCollisionComponent(component);
    }

    private bool CanPlace(int tx, int ty, Size? size)
    {
        size ??= new Size(1, 1);

        if (!_terrainSystem.IsAreaPassable(tx, ty, size.w, size.h))
            return false;

        var position = new Vector2(tx, ty);
        var collisionResult = _collisionSystem.CheckCollision(position, size);
        return !collisionResult.HasCollision;
    }

    private bool IsPositionInPlayerInterest(int accountId, int tx, int ty)
    {
        var playerChunks = _chunkSystem.GetPlayerChunks(accountId);
        var targetChunk = ChunkSystem.GetChunkCoords(new TilePos(tx, ty));
        return playerChunks.Contains(targetChunk);
    }

    public HashSet<int> GetPlayersNeedingUpdatedInterest()
    {
        var result = new HashSet<int>(_playersNeedingUpdate);
        _playersNeedingUpdate.Clear();
        return result;
    }

    public void MarkPlayerForInterestUpdate(int accountId)
    {
        _playersNeedingUpdate.Add(accountId);
    }
    
    private static string GenerateEntityId() => Guid.NewGuid().ToString("N");

    private void OnKingdomFallen(int accountId)
    {
        ClearEntitiesForPlayer(accountId);
        _sessionManager.ClearSessionForPlayer(accountId);
    }
}