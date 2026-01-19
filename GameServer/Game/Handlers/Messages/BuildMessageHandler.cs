using System.Text.Json;
using Server.Game.Controllers;
using Server.Game.Models;
using Server.Game.Models.DTOs;

namespace Server.Game.Handlers.Messages;

public class BuildMessageHandler(EntityController entityController) : IMessageHandler
{
    public string MessageType => "build";

    public async Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context)
    {
        string? buildingTypeId = null;
        int tx = 0, ty = 0;

        try
        {
            if (data.ValueKind == JsonValueKind.Object)
            {
                if (data.TryGetProperty("buildingTypeId", out var b))
                {
                    buildingTypeId = b.ValueKind switch
                    {
                        JsonValueKind.String => b.GetString(),
                        // Support number or other JSON literal → get raw text like "2"
                        _ => b.GetRawText().Trim('"')
                    };
                }

                if (data.TryGetProperty("tx", out var x)) tx = x.GetInt32();
                if (data.TryGetProperty("ty", out var y)) ty = y.GetInt32();
            }
        }
        catch
        {
            /* fall through */
        }

        if (string.IsNullOrWhiteSpace(buildingTypeId))
        {
            await context.SendErrorAsync(clientId, "bad_build_payload");
            return;
        }

        // Convert the payload to EEntityType (accepts either name or numeric value)
        if (!Enum.TryParse<EEntityType>(buildingTypeId, ignoreCase: true, out var entityType))
        {
            if (int.TryParse(buildingTypeId, out var numeric) &&
                Enum.IsDefined(typeof(EEntityType), numeric))
            {
                entityType = (EEntityType)numeric;
            }
            else
            {
                await context.SendErrorAsync(clientId, "bad_build_type");
                return;
            }
        }

        var (ok, error) = entityController.TryPlaceBuilding(accountId, entityType, tx, ty);
        if (!ok)
        {
            await context.SendErrorAsync(clientId, error ?? "build_failed");
        }
        else
        {
            await context.SendJsonAsync(clientId, new { t = "build_success" });
        }
    }
}