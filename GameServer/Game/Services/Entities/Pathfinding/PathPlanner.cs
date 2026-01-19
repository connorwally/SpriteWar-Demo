using System.Numerics;
using Server.Game.Models;

namespace Server.Game.Services.Entities.Pathfinding;

/*
 * TODO:
 * - Move path planning onto the client side
 * - Accept a "proposed path" from the client
 * - Attempt to follow the proposed path.
 * - Accept a bit-packed 8-direction step per tile (reduce network load as much as possible).
 */
public sealed class PathPlanner(TerrainSystem terrainSystem, CollisionSystem collisionSystem, ILogger<PathPlanner> logger)
{
    private const int MaxExpansions = 2000;
    
    public (bool ok, List<TilePos>?) TryPlanPath(TilePos start, TilePos goal, float weight = 1.2f)
    {
        if (IsPassable(goal.tx, goal.ty)) return PlanPathWithAStar(start, goal, weight);
        
        // If the goal tile is blocked, try to find a nearby passable tile
        var alt = FindNearestPassableGoal(start, goal, maxRadius: 8, startBias: 0.6f);
        if (alt is null)
        {
            // No suitable adjacent goal found
            return (false, null);
        }
        goal = alt;

        return PlanPathWithAStar(start, goal, weight);
    }
    
    private (bool ok, List<TilePos>?) PlanPathWithAStar(TilePos start, TilePos goal, float weight)
    {
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var expansions = 0;
        
        // Calculate search bounds
        var searchRadius = Math.Min(
            Math.Abs(goal.tx - start.tx) + Math.Abs(goal.ty - start.ty) + 10,
            30
        );
        
        var minX = Math.Min(start.tx, goal.tx) - searchRadius;
        var maxX = Math.Max(start.tx, goal.tx) + searchRadius;
        var minY = Math.Min(start.ty, goal.ty) - searchRadius;
        var maxY = Math.Max(start.ty, goal.ty) + searchRadius;
        
        var open = new PriorityQueue<Node, float>();
        var cameFrom = new Dictionary<(int, int), (int, int)>();
        var gScore = new Dictionary<(int, int), float>();
        var closed = new HashSet<(int, int)>();
        
        var startNode = (start.tx, start.ty);
        var goalNode = (goal.tx, goal.ty);
        
        gScore[startNode] = 0;
        open.Enqueue(new Node(startNode.Item1, startNode.Item2), 0);
        
        while (open.Count > 0 && expansions < MaxExpansions)
        {
            if (!open.TryDequeue(out var current, out _)) break;
            
            var currentPos = (current.X, current.Y);
            
            if (!closed.Add(currentPos)) continue;

            if (currentPos == goalNode)
            {
                stopwatch.Stop();
                logger.LogInformation("[A*] Success: {expansions} expansions, {stopwatch}ms", expansions, stopwatch.ElapsedMilliseconds);
                return (true, ReconstructPath(cameFrom, currentPos));
            }
            
            // Check bounds
            if (currentPos.Item1 < minX || currentPos.Item1 > maxX || 
                currentPos.Item2 < minY || currentPos.Item2 > maxY)
                continue;
            
            // Explore neighbors
            var neighbors = GetNeighbors(currentPos, minX, maxX, minY, maxY);
            
            foreach (var neighbor in neighbors)
            {
                if (closed.Contains(neighbor)) continue;
                
                var dx = Math.Abs(neighbor.Item1 - currentPos.Item1);
                var dy = Math.Abs(neighbor.Item2 - currentPos.Item2);
                var stepCost = (dx == 1 && dy == 1) ? MathF.Sqrt(2f) : 1f;
                
                var tentativeG = gScore[currentPos] + stepCost;
                
                if (!gScore.TryGetValue(neighbor, out var existingG) || tentativeG < existingG)
                {
                    cameFrom[neighbor] = currentPos;
                    gScore[neighbor] = tentativeG;
                    
                    var h = OctileDistance(neighbor, goalNode);
                    var f = tentativeG + weight * h;
                    
                    open.Enqueue(new Node(neighbor.Item1, neighbor.Item2), f);
                }
            }
            
            expansions++;
        }
        
        stopwatch.Stop();
        logger.LogInformation("[A*] Success: {expansions}, {stopwatch}", expansions, stopwatch.ElapsedMilliseconds);
        return (false, null);
    }

    // Finds a nearby passable tile when the intended goal is blocked.
    // Preference: closest ring around goal first, then among that ring,
    // minimize (distanceToGoal + startBias * distanceToStart) to bias toward the mover.
    private TilePos? FindNearestPassableGoal(TilePos start, TilePos goal, int maxRadius = 8, float startBias = 0.6f)
    {
        for (var r = 1; r <= maxRadius; r++)
        {
            TilePos? ringBest = null;
            var ringBestScore = float.MaxValue;

            for (var dx = -r; dx <= r; dx++)
            {
                for (var dy = -r; dy <= r; dy++)
                {
                    // Only evaluate the current ring perimeter
                    if (Math.Abs(dx) != r && Math.Abs(dy) != r) continue;

                    var cx = goal.tx + dx;
                    var cy = goal.ty + dy;

                    if (!IsPassable(cx, cy)) continue;

                    var dGoal = OctileDistance((cx, cy), (goal.tx, goal.ty));
                    var dStart = OctileDistance((cx, cy), (start.tx, start.ty));
                    var score = dGoal + startBias * dStart;

                    if (!(score < ringBestScore)) continue;
                    ringBestScore = score;
                    ringBest = new TilePos(cx, cy);
                }
            }

            if (ringBest is null) continue;
            return ringBest;
        }
        return null;
    }
    
    private IEnumerable<(int, int)> GetNeighbors((int, int) pos, int minX, int maxX, int minY, int maxY)
    {
        var (x, y) = pos;
        
        // 4-directional movement
        var directions = new[]
        {
            (0, -1), (0, 1), (-1, 0), (1, 0),
            (-1, -1), (1, -1), (1, 1), (-1, 1)
        };
        
        foreach (var (dx, dy) in directions)
        {
            var nx = x + dx;
            var ny = y + dy;
            
            if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
            if (!IsPassable(nx, ny)) continue;
            
            // For diagonal movement, check that both orthogonal directions are clear
            if (dx != 0 && dy != 0)
            {
                if (!IsPassable(x + dx, y) || !IsPassable(x, y + dy)) continue;
            }
            
            yield return (nx, ny);
        }
    }
    
    private bool IsPassable(int tx, int ty)
    {
        if (!terrainSystem.IsPassable(tx, ty)) return false;
        
        var collisionResult = collisionSystem.CheckCollision(
            new Vector2(tx, ty), 
            new Size(1, 1), 
            null,
            CollisionLayer.Buildings | CollisionLayer.Resources | CollisionLayer.WorldBorder
        );
        
        return !collisionResult.HasCollision;
    }
    
    private static float OctileDistance((int, int) a, (int, int) b)
    {
        var dx = Math.Abs(a.Item1 - b.Item1);
        var dy = Math.Abs(a.Item2 - b.Item2);
        var f = MathF.Sqrt(2f) - 1f;
        return (dx < dy) ? f * dx + dy : f * dy + dx;
    }
    
    private static List<TilePos> ReconstructPath(Dictionary<(int, int), (int, int)> cameFrom, (int, int) goal)
    {
        var path = new List<TilePos>();
        var current = goal;
        
        while (true)
        {
            path.Add(new TilePos(current.Item1, current.Item2));
            if (!cameFrom.TryGetValue(current, out current)) break;
        }
        
        path.Reverse();
        return path;
    }
    
    private readonly record struct Node(int X, int Y);
}