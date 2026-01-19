using System.Text.Json;
using Server.Game.Controllers;
using Server.Game.Models;
using Server.Game.Models.DTOs;

namespace Server.Game.Handlers.Messages;

public class TrainMessageHandler(EntityController entityController) : IMessageHandler
{
    public string MessageType => "train";

    public async Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context)
    {
        string? buildingId = null;
        string? unitTypeId = null;

        try
        {
            if (data.ValueKind == JsonValueKind.Object)
            {
                if (data.TryGetProperty("entityId", out var e))
                    buildingId = e.ValueKind == JsonValueKind.String ? e.GetString() : e.GetRawText().Trim('"');
                if (data.TryGetProperty("unitTypeId", out var u))
                    unitTypeId = u.ValueKind == JsonValueKind.String ? u.GetString() : u.GetRawText().Trim('"');
            }
        }
        catch
        {
            /* fall through */
        }

        if (string.IsNullOrWhiteSpace(buildingId) || string.IsNullOrWhiteSpace(unitTypeId))
        {
            await context.SendErrorAsync(clientId, "bad_train_payload");
            return;
        }

        // Convert the payload to EEntityType (accepts either name or numeric value)
        if (!Enum.TryParse(unitTypeId, ignoreCase: true, out EEntityType unitType))
        {
            if (int.TryParse(unitTypeId, out var numeric) &&
                Enum.IsDefined(typeof(EEntityType), numeric))
            {
                unitType = (EEntityType)numeric;
            }
            else
            {
                await context.SendErrorAsync(clientId, "bad_train_type");
                return;
            }
        }

        var (ok, error) = entityController.TryEnqueueTraining(accountId, buildingId, unitType);
        if (!ok)
        {
            await context.SendErrorAsync(clientId, error ?? "train_failed");
        }
    }
}