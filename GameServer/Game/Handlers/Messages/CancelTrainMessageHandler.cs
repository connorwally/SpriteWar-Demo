using System.Text.Json;
using Server.Game.Controllers;

namespace Server.Game.Handlers.Messages;

public class CancelTrainMessageHandler(EntityController entityController) : IMessageHandler
{
    public string MessageType => "cancel_train";

    public async Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context)
    {
        string? buildingId = null;
        int setIndex = -1;

        try
        {
            if (data.ValueKind == JsonValueKind.Object)
            {
                if (data.TryGetProperty("entityId", out var e))
                    buildingId = e.ValueKind == JsonValueKind.String ? e.GetString() : e.GetRawText().Trim('"');

                if (data.TryGetProperty("setIndex", out var s) && s.ValueKind == JsonValueKind.Number)
                    setIndex = s.GetInt32();
            }
        }
        catch
        {
            /* ignore */
        }

        if (string.IsNullOrWhiteSpace(buildingId) || setIndex < 0)
        {
            await context.SendErrorAsync(clientId, "bad_cancel_train_payload");
            return;
        }

        var (ok, error) = entityController.TryCancelTraining(accountId, buildingId, setIndex);
        if (!ok)
        {
            await context.SendErrorAsync(clientId, error ?? "cancel_train_failed");
        }
    }
}