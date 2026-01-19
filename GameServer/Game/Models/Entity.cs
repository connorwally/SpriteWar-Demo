using System.Numerics;
using Server.Game.Models.DTOs;

namespace Server.Game.Models;

public enum EEntityCategory
{
    Unit,
    Building,
    Resource
}

public enum EEntityType
{
    Villager,
    Castle,
    House,
    Tree,
    Stone,
    Barracks,
    Range,
    Workshop,
    Farm,
    Wall,
    Ballista,
    Musketeer,
    Mage,
    Bowman,
    Knight,
    Spearman,
    Swordsman
}

public sealed class Entity
{
    public string Id { get; init; } = null!;
    public EEntityCategory Category { get; init; } = EEntityCategory.Unit;
    public EEntityType Type { get; init; }
    public int Tx { get; set; }
    public int Ty { get; set; }
    public int Hp { get; set; } = 100;
    public int? OwnerId { get; set; }

    // Movement target
    public int? TargetTx { get; set; }
    public int? TargetTy { get; set; }
    
    public string? TargetUnitId { get; set; }
    
    public List<TilePos>? CurrentPath { get; set; }
    public int PathIndex { get; set; }

    // Collision properties
    public Size? CollisionSize { get; set; } = new(1, 1);
}