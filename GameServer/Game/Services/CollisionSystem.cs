using System.Collections.Concurrent;
using System.Numerics;
using Server.Game.Models;

namespace Server.Game.Services;

/// <summary>
/// Represents different types of collision layers
/// </summary>
[Flags]
public enum CollisionLayer
{
    Units = 1,
    Buildings = 2,
    Resources = 4,
    WorldBorder = 8,
    Terrain = 16
}

/// <summary>
/// Represents a collision box for an entity
/// </summary>
public record CollisionBox(Vector2 Position, Size Size)
{
    public float Left => Position.X;
    public float Right => Position.X + Size.w;
    public float Top => Position.Y;
    public float Bottom => Position.Y + Size.h;
    public Vector2 Center => Position + new Vector2(Size.w * 0.5f, Size.h * 0.5f);
}

/// <summary>
/// Collision component attached to entities
/// </summary>
public sealed class CollisionComponent(
    string entityId,
    CollisionLayer layer,
    CollisionBox bounds,
    bool isPassable = false)
{
    public string EntityId { get; } = entityId;
    public CollisionLayer Layer { get; } = layer;
    public CollisionBox Bounds { get; set; } = bounds;
    public bool IsPassable { get; } = isPassable; // Some entities might be passable (like decorations)
}

/// <summary>
/// Result of a collision check
/// </summary>
public record CollisionResult(bool HasCollision, string? CollidingEntityId = null);

/// <summary>
/// Main collision detection system
/// </summary>
public sealed class CollisionSystem(TerrainSystem? terrainSystem = null, WorldBorder? worldBorder = null)
{
    private readonly ConcurrentDictionary<string, CollisionComponent> _collisionComponents = new();
    private readonly Lock _spatialIndexLock = new();
    private readonly Dictionary<(int, int), List<string>> _spatialIndex = new(); // Grid-based spatial partitioning

    // Grid cell size for spatial partitioning (adjust based on your game scale)
    private const int GridCellSize = 10;

    /// <summary>
    /// Add or update a collision component for an entity
    /// </summary>
    public void AddOrUpdateCollisionComponent(CollisionComponent component)
    {
        _collisionComponents.AddOrUpdate(component.EntityId, component, (_, _) => component);
        UpdateSpatialIndex(component);
    }

    /// <summary>
    /// Remove a collision component
    /// </summary>
    public bool RemoveCollisionComponent(string entityId)
    {
        if (_collisionComponents.TryRemove(entityId, out var component))
        {
            RemoveFromSpatialIndex(component);
            return true;
        }

        return false;
    }

    /// <summary>
    /// Check if a position is free for movement
    /// </summary>
    /// <returns>Always returns a collision result</returns>
    public CollisionResult CheckCollision(Vector2 position, Size size, string? excludeEntityId = null,
        CollisionLayer layersToCheck = CollisionLayer.Units | CollisionLayer.Buildings | CollisionLayer.Resources | CollisionLayer.WorldBorder | CollisionLayer.Terrain, bool includePassable = false)
    {
        var testBox = new CollisionBox(position, size);

        // WorldBorder check
        if ((layersToCheck & CollisionLayer.WorldBorder) != 0 && worldBorder != null)
        {
            var tx = (int)Math.Floor(position.X);
            var ty = (int)Math.Floor(position.Y);
            if (!worldBorder.ContainsArea(new TilePos(tx, ty), size))
            {
                return new CollisionResult(true, "world_border");
            }
        }
        
        // Terrain check
        if ((layersToCheck & CollisionLayer.Terrain) != 0 && terrainSystem != null)
        {
            var tx = (int)Math.Floor(position.X);
            var ty = (int)Math.Floor(position.Y);
            
            if (!terrainSystem.IsAreaPassable(tx, ty, size.w, size.h))
            {
                return new CollisionResult(true, "terrain");
            }
        }

        var gridCells = GetGridCellsForBox(testBox);

        lock (_spatialIndexLock)
        {
            foreach (var cell in gridCells)
            {
                if (!_spatialIndex.TryGetValue(cell, out var entitiesInCell))
                    continue;

                foreach (var entityId in entitiesInCell)
                {
                    if (excludeEntityId == entityId)
                        continue;

                    if (!_collisionComponents.TryGetValue(entityId, out var component))
                        continue;

                    // Check if we should test against this layer
                    if ((component.Layer & layersToCheck) == 0)
                        continue;

                    // Skip passable entities
                    if (component.IsPassable && !includePassable)
                        continue;

                    if (BoxesIntersect(testBox, component.Bounds))
                    {
                        return new CollisionResult(true, entityId);
                    }
                }
            }
        }

        return new CollisionResult(false);
    }

    /// <summary>
    /// Check if an entity can move to a new position
    /// </summary>
    public CollisionResult CanMoveTo(string entityId, Vector2 newPosition, Size size)
    {
        if (!_collisionComponents.TryGetValue(entityId, out var component))
            return new CollisionResult(false);

        // Determine which layers to check based on entity type
        var layersToCheck = component.Layer switch
        {
            CollisionLayer.Units => CollisionLayer.Units | CollisionLayer.Buildings,
            CollisionLayer.Buildings => CollisionLayer.Buildings,
            CollisionLayer.Resources => CollisionLayer.Resources | CollisionLayer.Buildings | CollisionLayer.Units,
            _ => CollisionLayer.Units | CollisionLayer.Buildings
        };

        return CheckCollision(newPosition, size, entityId, layersToCheck);
    }

    /// <summary>
    /// Update entity position in collision system
    /// </summary>
    public void UpdateEntityPosition(string entityId, Vector2 newPosition)
    {
        if (_collisionComponents.TryGetValue(entityId, out var component))
        {
            var oldBounds = component.Bounds;
            component.Bounds = new CollisionBox(newPosition, component.Bounds.Size);

            // Update spatial index
            RemoveFromSpatialIndex(oldBounds, entityId);
            UpdateSpatialIndex(component);
        }
    }

    /// <summary>
    /// Check if two collision boxes intersect
    /// </summary>
    private static bool BoxesIntersect(CollisionBox a, CollisionBox b)
    {
        return a.Left < b.Right && a.Right > b.Left && a.Top < b.Bottom && a.Bottom > b.Top;
    }

    /// <summary>
    /// Get grid cells that a collision box occupies
    /// </summary>
    private static List<(int, int)> GetGridCellsForBox(CollisionBox box)
    {
        var cells = new List<(int, int)>();

        var minX = (int)Math.Floor(box.Left / GridCellSize);
        var maxX = (int)Math.Floor(box.Right / GridCellSize);
        var minY = (int)Math.Floor(box.Top / GridCellSize);
        var maxY = (int)Math.Floor(box.Bottom / GridCellSize);

        for (int x = minX; x <= maxX; x++)
        {
            for (int y = minY; y <= maxY; y++)
            {
                cells.Add((x, y));
            }
        }

        return cells;
    }

    /// <summary>
    /// Update spatial index for a collision component
    /// </summary>
    private void UpdateSpatialIndex(CollisionComponent component)
    {
        var gridCells = GetGridCellsForBox(component.Bounds);

        lock (_spatialIndexLock)
        {
            foreach (var cell in gridCells)
            {
                if (!_spatialIndex.ContainsKey(cell))
                    _spatialIndex[cell] = new List<string>();

                if (!_spatialIndex[cell].Contains(component.EntityId))
                    _spatialIndex[cell].Add(component.EntityId);
            }
        }
    }

    /// <summary>
    /// Remove entity from spatial index
    /// </summary>
    private void RemoveFromSpatialIndex(CollisionComponent component)
    {
        RemoveFromSpatialIndex(component.Bounds, component.EntityId);
    }

    /// <summary>
    /// Remove entity from spatial index using bounds
    /// </summary>
    private void RemoveFromSpatialIndex(CollisionBox bounds, string entityId)
    {
        var gridCells = GetGridCellsForBox(bounds);

        lock (_spatialIndexLock)
        {
            foreach (var cell in gridCells)
            {
                if (_spatialIndex.TryGetValue(cell, out var entitiesInCell))
                {
                    entitiesInCell.Remove(entityId);
                    if (entitiesInCell.Count == 0)
                        _spatialIndex.Remove(cell);
                }
            }
        }
    }
}
