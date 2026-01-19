namespace Server.Game.Models.DTOs;

/// <summary>
/// Data Transfer Object for player resource data
/// </summary>
public record PlayerResources(int wood, int food, int gold, int stone);

/// <summary>
/// Data Transfer Object for player snapshot data sent to clients
/// </summary>
public record PlayerSnapshotDto(string id, PlayerResources Resources, TilePos homeTile);