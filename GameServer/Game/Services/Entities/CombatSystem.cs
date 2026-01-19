using System.Collections.Concurrent;
using System.Numerics;
using Server.Game.Models;
using Server.Game.Models.DTOs;

namespace Server.Game.Services.Entities;

// 1. Check the entity can attack (attack damage > 0, attack range > 0, attackableLayers > 0) -
// 2. Find all neighbours who are enemies, and are attackable layer -
// 3. Deal damage -
// 4. Send patch

public class CombatSystem(
    EntityManager entityManager,
    CollisionSystem collisionSystem,
    HashSet<int> playersNeedingUpdate,
    GameData gameData,
    ChunkSystem chunkSystem,
    PlayerManager playerManager,
    List<object> patchBuffer)
{

    public void Update(ConcurrentDictionary<string, Entity> entities)
    {
        foreach (var e in entities.Values)
        {
            // Check the entity has an owner
            if (!e.OwnerId.HasValue) continue;
            
            // Check the entity can actually attack
            var unitType = gameData.TryGet(e.Type);
            if(unitType is null) continue;

            switch (unitType.category)
            {
                case EEntityCategory.Resource:
                case EEntityCategory.Building when unitType.building is not
                    { attackDamage: > 0, attackableTypes.Count: > 0, attackRange: > 0 }:
                case EEntityCategory.Unit when unitType.unit is not
                    { attackDamage: > 0, attackableTypes.Count: > 0, attackRange: > 0 }:
                    continue;
            }
            
            // Get unit's range
            var range = unitType.category switch
            {
                EEntityCategory.Unit => unitType.unit.attackRange,
                EEntityCategory.Building => unitType.building.attackRange,
                _ => 0
            };
            if (range <= 0) continue;


        // Scan entities in Chebyshev "circle" (square) around the attacker
        List<Entity> neighbouringEntities = [];
        var seen = new HashSet<string>(StringComparer.Ordinal);

        var currentPos = new Vector2(e.Tx, e.Ty);
        for (var dx = -range; dx <= range; dx++)
        {
            for (var dy = -range; dy <= range; dy++)
            {
                var pos = currentPos + new Vector2(dx, dy);
                var collision = collisionSystem.CheckCollision(pos, e.CollisionSize, e.Id, includePassable: true);

                // If no collision or colliding entity Id, continue
                if (!collision.HasCollision || collision.CollidingEntityId == null) continue;

                // Deduplicate
                if (!seen.Add(collision.CollidingEntityId)) continue;

                // If we can't get the entity continue
                var collisionEntity = entityManager.GetEntity(collision.CollidingEntityId);
                if (collisionEntity is null) continue;

                // If it's a friendly unit, continue
                if (collisionEntity.OwnerId == e.OwnerId && collisionEntity.Type != EEntityType.Farm) continue;

                // If the entity is not an attackable type, continue
                switch (unitType.category)
                {
                    case EEntityCategory.Building when
                        !unitType.building.attackableTypes.Contains(collisionEntity.Category):
                        continue;
                    case EEntityCategory.Unit when
                        !unitType.unit.attackableTypes.Contains(collisionEntity.Category):
                        continue;
                }

                // Add unit to list of attackable entities
                neighbouringEntities.Add(collisionEntity);
            }
        }

        // Sort by the priority, then apply damage
        var sortedEntities = neighbouringEntities
            .OrderBy(target => GetPriority(e, target))
            .ToList();

        foreach (var unused in sortedEntities.Where(entity => TryDealDamage(e, entity)))
            {
                break;
            }
        }
    }

    private static int GetPriority(Entity self, Entity target)
    {
        if (self.TargetUnitId != null && target.Id == self.TargetUnitId)
            return 0; // Highest priority
        
        return target.Category switch
        {
            EEntityCategory.Unit => 1,
            EEntityCategory.Building => 2,
            _ => target.Category == EEntityCategory.Resource
                ? 3
                : // resource
                4
        };
    }

    private bool TryDealDamage(Entity self, Entity target)
    {
        var selfEntityData = gameData.TryGet(self.Type);
        if (selfEntityData == null) return false;

        var targetEntityData = gameData.TryGet(target.Type);
        if (targetEntityData == null) return false;

        // Deal damage or kill
        var damage = Math.Max(selfEntityData.unit.attackDamage, selfEntityData.building.attackDamage);
        if (target.Hp - damage > 0)
        {
            target.Hp -= damage;
            Console.WriteLine($"[CombatSystem] {self.Id[..5]} dealt {damage} to {target.Id[..5]}");
        }
        else
            entityManager.DeleteEntity(target.Id);

        if (self.OwnerId.HasValue && targetEntityData.resource is { } res &&
            (res.wood > 0 || res.food > 0 || res.gold > 0 || res.stone > 0))
        {
            // Provide the player with the proportionate amount of resources to damage dealt
            var appliedDamage = Math.Min(damage, target.Hp);
            var percentDamageDealt = (double)appliedDamage / targetEntityData.baseHp;

            var resourceToProvide = new Resources(
                (int)Math.Round(res.wood * percentDamageDealt),
                (int)Math.Round(res.food * percentDamageDealt),
                (int)Math.Round(res.gold * percentDamageDealt),
                (int)Math.Round(res.stone * percentDamageDealt)
            );
            
            playerManager.AddResources(self.OwnerId.Value, resourceToProvide);
            playerManager.MarkPlayerForSnapshotUpdate(self.OwnerId.Value);
        }
        
        patchBuffer.Add(new EntityPatchDto(Id: target.Id, Hp: target.Hp));
        // Update on client side
        var chunkCoords = ChunkSystem.GetChunkCoords(new TilePos(target.Tx, target.Ty));
        foreach (var player in chunkSystem.GetPlayersForChunk(chunkCoords))
        {
            playersNeedingUpdate.Add(player); //TODO: We don't want to use the players needing update (full update - we want incremental)
            patchBuffer.Add(new
            {
                t = "attack",
                accountId = player,
                attackerId = self.Id,
                targetId = target.Id,
                damage
            });
        }
        
        return true;
    }
}