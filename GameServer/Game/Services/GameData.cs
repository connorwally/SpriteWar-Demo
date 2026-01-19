using System.Text.Json;
using System.Text.Json.Serialization;
using Server.Game.Models;
using Server.Game.Models.DTOs;

namespace Server.Game.Services;

public sealed class GameData
{
    public IReadOnlyDictionary<EEntityType, CleanEntityConfig> Entities => _entities;
    private readonly Dictionary<EEntityType, CleanEntityConfig> _entities;

    // Read all entity data into _entities dictionary.
    public GameData(string jsonPath)
    {
        var json = File.ReadAllText(jsonPath);

        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
        // Allow "unit" | "building" | "gatherable" strings to map to EEntityCategory enum
        jsonOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));

        var list = JsonSerializer.Deserialize<List<EntityConfig>>(json, jsonOptions) ?? [];

        var cleaned = list.Select(EntityConfigCleaner.Clean).ToList();
		
        _entities = cleaned.ToDictionary(e => e.id, e => e);
        Console.WriteLine($"[GameData] Loaded {_entities.Count} entities.");
    }
	
    public CleanEntityConfig? TryGet(EEntityType entityType) => _entities.GetValueOrDefault(entityType);
}