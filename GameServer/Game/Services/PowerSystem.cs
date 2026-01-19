using Server.Game.Models;
using Server.Game.Services.Entities;

namespace Server.Game.Services;

public class PowerSystem(PlayerManager playerManager, EntityManager entityManager, GameData gameData, float entityPowerMultiplier)
{
    public float GetPlayerPower(int accountId)
    {
        var power = GetEntityPower(accountId);
        power += GetResourcePower(accountId);
        return power;
    }

    private float GetResourcePower(int accountId)
    {
        var resources = playerManager.GetPlayerResources(accountId);
        var power = resources.food + resources.gold + resources.stone + resources.wood;
        return power;
    }

    private float GetEntityPower(int accountId)
    {
        var power = 0;
        var entities = entityManager.GetEntities(accountId);

        foreach (var entity in entities)
        {
            var data = gameData.TryGet(entity.Type);
            if (data is null) continue;

            var resources = 0;

            switch (data.category)
            {
                case EEntityCategory.Unit:
                    resources += data.unit.cost.food;
                    resources += data.unit.cost.wood;
                    resources += data.unit.cost.gold;
                    resources += data.unit.cost.stone;
                    break;
                case EEntityCategory.Building:
                    resources += data.building.cost.food;
                    resources += data.building.cost.wood;
                    resources += data.building.cost.gold;
                    resources += data.building.cost.stone;
                    break;
                case EEntityCategory.Resource:
                    break;
            }

            power += resources;
        }

        return power * entityPowerMultiplier;
    }
}