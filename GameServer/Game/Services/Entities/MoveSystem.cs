using System.Collections.Concurrent;
using System.Numerics;
using Server.Game.Models;
using Server.Game.Models.DTOs;
using Server.Game.Services.Entities.Pathfinding;

namespace Server.Game.Services.Entities;

public class MoveSystem(
    CollisionSystem collisionSystem,
    ChunkSystem chunkSystem,
    List<object> patchBuffer,
    PathPlanner pathPlanner)
{
    public void Update(ConcurrentDictionary<string, Entity> movableEntities, HashSet<int> playersNeedingUpdate, ConcurrentDictionary<string, Entity> allEntities)
    {
        foreach (var e in movableEntities.Values)
        {
            // Set target Tx and Ty to the targeted entities, unless the entity has moved out of our vision.
            if (e.TargetUnitId != null && allEntities.TryGetValue(e.TargetUnitId, out var value))
            {
                var targetTilePos = new TilePos(value.Tx, value.Ty);
                var targetChunk = ChunkSystem.GetChunkCoords(new TilePos(targetTilePos.tx, targetTilePos.ty));

                // Entity has moved out of our vision
                if (e.OwnerId.HasValue && !chunkSystem.GetPlayersForChunk(new ChunkPos(targetChunk.cx, targetChunk.cy))
                        .Contains(e.OwnerId.Value))
                {
                    e.TargetUnitId = null;
                    e.TargetTx = null;
                    e.TargetTy = null;
                    e.CurrentPath = null;
                    e.PathIndex = 0;
                    continue;
                }

                // Move towards target
                e.TargetTx = value.Tx;
                e.TargetTy = value.Ty;
            }

            if (e.TargetTx is null || e.TargetTy is null) continue;

            // Build the new path
            if (e.CurrentPath == null || e.PathIndex >= e.CurrentPath.Count)
            {
                var start = new TilePos(e.Tx, e.Ty);
                var goal = new TilePos(e.TargetTx.Value, e.TargetTy.Value);

                var (success, newPath) = pathPlanner.TryPlanPath(start, goal);
                if (success)
                {
                    e.CurrentPath = newPath;
                    e.PathIndex = 0;

                    // Adjust final node so it doesnt continuously re-calculate
                    if (e.TargetUnitId == null)
                    {
                        var finalNode = e.CurrentPath?[^1];
                        if (finalNode != null)
                        {
                            e.TargetTx = finalNode.tx;
                            e.TargetTy = finalNode.ty;
                        }
                    }
                }
                else
                {
                    e.TargetTx = null;
                    e.TargetTy = null;
                    e.TargetUnitId = null;
                }
            }

            // Move along current path
            if (e.CurrentPath != null && e.PathIndex < e.CurrentPath.Count)
            {
                var wp = e.CurrentPath[e.PathIndex];
                var newTx = wp.tx;
                var newTy = wp.ty;

                if (e.Tx == newTx && e.Ty == newTy)
                {
                    e.PathIndex++;
                    if (e.PathIndex >= e.CurrentPath.Count) continue;
                    wp = e.CurrentPath[e.PathIndex];
                    newTx = wp.tx;
                    newTy = wp.ty;
                }

                if (CanMoveTo(e, newTx, newTy))
                {
                    collisionSystem.UpdateEntityPosition(e.Id, new Vector2(newTx, newTy));
                    var oldChunk = ChunkSystem.GetChunkCoords(new TilePos(e.Tx, e.Ty));
                    var newChunk = ChunkSystem.GetChunkCoords(new TilePos(newTx, newTy));
                    if (oldChunk != newChunk)
                    {
                        chunkSystem.UnregisterEntity(e.Id, new TilePos(e.Tx, e.Ty));
                        chunkSystem.RegisterEntity(e.Id, new TilePos(newTx, newTy));
                    }

                    // Commit move
                    e.Tx = newTx;
                    e.Ty = newTy;
                    e.PathIndex++;

                    patchBuffer.Add(new EntityPatchDto(Id: e.Id, Pos: new TilePos(e.Tx, e.Ty)));

                    if (e.OwnerId.HasValue)
                        playersNeedingUpdate.Add(e.OwnerId.Value);

                    var curChunk = ChunkSystem.GetChunkCoords(new TilePos(e.Tx, e.Ty));
                    foreach (var pid in chunkSystem.GetPlayersForChunk(curChunk))
                        playersNeedingUpdate.Add(pid);
                }
                else
                {
                    e.CurrentPath = null;
                    e.PathIndex = 0;
                }
            }

            // Arrive at destination
            if (e.Tx == e.TargetTx && e.Ty == e.TargetTy)
            {
                e.TargetTx = null;
                e.TargetTy = null;
                e.CurrentPath = null;
                e.PathIndex = 0;
            }
        }
    }

    private bool CanMoveTo(Entity entity, int tx, int ty)
    {
        var position = new Vector2(tx, ty);

        if (entity.CollisionSize != null)
        {
            var collisionResult = collisionSystem.CanMoveTo(entity.Id, position, entity.CollisionSize);
            return !collisionResult.HasCollision;
        }

        return false;
    }
}