namespace Server.Game.Models.DTOs;

public record EntityDto(string Id, string TypeId, TilePos Pos, string? OwnerId = null, int? Hp = null);

public record EntityPatchDto(
    string Id, 
    TilePos? Pos = null, 
    string? TypeId = null,
    string? OwnerId = null, 
    int? Hp = null);