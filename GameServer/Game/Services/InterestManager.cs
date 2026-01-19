using System.Collections.Concurrent;
using Server.Game.Models;
using Server.Game.Models.DTOs;
using Server.Game.Services.Entities;

namespace Server.Game.Services;

public class InterestManager(
    ChunkSystem chunkSystem,
    EntityManager entityManager,
    GameData gameData,
    List<object> patchBuffer)
{
    // Track which entities each player can currently see
    private readonly ConcurrentDictionary<int, HashSet<string>> _playerVisibleEntities = new();
    private const int ChunkSystemChunkSize = 16; // TODO: We need centralised values

    public void Update(HashSet<int> playersNeedingUpdate)
    {
        foreach (var accountId in playersNeedingUpdate)
        {
            // Keep chunk subscriptions aligned with current vision
            UpdatePlayerInterest(accountId);

            var circles = GetVisionCircleForPlayer(accountId);
            var candidateIds = chunkSystem.GetVisibleEntities(accountId);

            var currentVisible = new HashSet<string>(StringComparer.Ordinal);

            foreach (var id in candidateIds)
            {
                var e = entityManager.GetEntity(id);
                if (e is null) continue;

                foreach (var (cx, cy, r) in circles)
                {
                    // Fast reject by bounding box first
                    var rInt = (int)Math.Ceiling(r);
                    if (Math.Abs(e.Tx - cx) > rInt + 1 || Math.Abs(e.Ty - cy) > rInt + 1) continue;

                    // Require the entire tile (1x1) to be inside the circle, same as client fog
                    double r2 = r * r;
                    double dx1 = (e.Tx - 0.5) - cx, dy1 = (e.Ty - 0.5) - cy;
                    double dx2 = (e.Tx + 0.5) - cx, dy2 = (e.Ty - 0.5) - cy;
                    double dx3 = (e.Tx + 0.5) - cx, dy3 = (e.Ty + 0.5) - cy;
                    double dx4 = (e.Tx - 0.5) - cx, dy4 = (e.Ty + 0.5) - cy;

                    if (dx1 * dx1 + dy1 * dy1 <= r2 &&
                        dx2 * dx2 + dy2 * dy2 <= r2 &&
                        dx3 * dx3 + dy3 * dy3 <= r2 &&
                        dx4 * dx4 + dy4 * dy4 <= r2)
                    {
                        currentVisible.Add(id);
                        break;
                    }
                }
            }

            var prev = _playerVisibleEntities.TryGetValue(accountId, out var p)
                ? p
                : new HashSet<string>(StringComparer.Ordinal);

            var toAdd = currentVisible.Except(prev).ToArray();
            var toRemove = prev.Except(currentVisible).ToArray();

            if (toAdd.Length > 0)
            {
                var newEntityData = toAdd
                    .Select(entityManager.GetEntity)
                    .Where(e => e != null)
                    .Select(e => new EntityDto(
                        e!.Id,
                        e.Type.ToString(),
                        new TilePos(e.Tx, e.Ty),
                        e.OwnerId?.ToString(),
                        e.Hp))
                    .ToArray();

                patchBuffer.Add(new { t = "entity_add", entities = newEntityData, accountId });
            }

            if (toRemove.Length > 0)
            {
                patchBuffer.Add(new { t = "entity_remove", entityIds = toRemove, accountId });
            }

            _playerVisibleEntities[accountId] = currentVisible;
        }
    }

    private void UpdatePlayerInterest(int accountId)
    {
        var circles = GetVisionCircleForPlayer(accountId);

        var interestChunks = new HashSet<ChunkPos>();
        foreach (var (cx, cy, r) in circles)
        {
            int minCx = (int)Math.Floor((cx - r) / ChunkSystemChunkSize);
            int maxCx = (int)Math.Floor((cx + r) / ChunkSystemChunkSize);
            int minCy = (int)Math.Floor((cy - r) / ChunkSystemChunkSize);
            int maxCy = (int)Math.Floor((cy + r) / ChunkSystemChunkSize);

            for (int x = minCx; x <= maxCx; x++)
            for (int y = minCy; y <= maxCy; y++)
                interestChunks.Add(new ChunkPos(x, y));
        }

        chunkSystem.UpdatePlayerChunks(accountId, interestChunks);
    }

    public List<EntityDto> GetInitialEntitiesFor(int accountId)
    {
        // Ensure chunk subscriptions match current vision
        UpdatePlayerInterest(accountId);
    
        // Candidate IDs from subscribed chunks
        var candidateIds = chunkSystem.GetVisibleEntities(accountId);
    
        // Apply vision-circle filtering (same rules as Update)
        var circles = GetVisionCircleForPlayer(accountId);
        var currentVisible = new HashSet<string>(StringComparer.Ordinal);
    
        foreach (var id in candidateIds)
        {
            var e = entityManager.GetEntity(id);
            if (e is null) continue;
    
            foreach (var (cx, cy, r) in circles)
            {
                var rInt = (int)Math.Ceiling(r);
                if (Math.Abs(e.Tx - cx) > rInt + 1 || Math.Abs(e.Ty - cy) > rInt + 1) continue;
    
                double r2 = r * r;
                double dx1 = (e.Tx - 0.5) - cx, dy1 = (e.Ty - 0.5) - cy;
                double dx2 = (e.Tx + 0.5) - cx, dy2 = (e.Ty - 0.5) - cy;
                double dx3 = (e.Tx + 0.5) - cx, dy3 = (e.Ty + 0.5) - cy;
                double dx4 = (e.Tx - 0.5) - cx, dy4 = (e.Ty + 0.5) - cy;
    
                if (dx1 * dx1 + dy1 * dy1 <= r2 &&
                    dx2 * dx2 + dy2 * dy2 <= r2 &&
                    dx3 * dx3 + dy3 * dy3 <= r2 &&
                    dx4 * dx4 + dy4 * dy4 <= r2)
                {
                    currentVisible.Add(id);
                    break;
                }
            }
        }
    
        // Initialize visible set with circle-filtered results
        _playerVisibleEntities.AddOrUpdate(accountId,
            currentVisible,
            (_, existing) =>
            {
                existing.Clear();
                foreach (var entityId in currentVisible)
                {
                    existing.Add(entityId);
                }
                return existing;
            });
    
        // Return DTOs for only the filtered entities
        return currentVisible
            .Select(entityManager.GetEntity)
            .Where(e => e != null)
            .Select(e => new EntityDto(
                e!.Id,
                e.Type.ToString(),
                new TilePos(e.Tx, e.Ty),
                e.OwnerId?.ToString(),
                e.Hp))
            .ToList();
    }

    private List<(double cx, double cy, double r)> GetVisionCircleForPlayer(int accountId)
    {
        var circles = new List<(double cx, double cy, double r)>();
        var playerEntities = entityManager.GetEntities(accountId);
        foreach (var e in playerEntities)
        {
            var cfg = gameData.TryGet(e.Type);
            if (cfg is null) continue;

            int view = cfg.category switch
            {
                EEntityCategory.Unit => cfg.unit.viewRange,
                EEntityCategory.Building => cfg.building.viewRange,
                _ => 0
            };
            if (view <= 0) continue;

            var size = cfg.size;
            // center of footprint: top-left + width/2 - 0.5 (same as client)
            double cx = e.Tx + (size.w / 2.0) - 0.5;
            double cy = e.Ty + (size.h / 2.0) - 0.5;

            circles.Add((cx, cy, view));
        }
        return circles;
    }
}