using System.Text.Json;
using Server.Game.Controllers;

namespace Server.Game.Handlers.Messages;

public class TargetMessageHandler(EntityController entityController) : IMessageHandler
{
    public string MessageType => "target";

    public async Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context)
    {
        string? unitId = null;
        string? targetUnitId = null;

        try
        {
            if (data.ValueKind == JsonValueKind.Object)
            {
                if (data.TryGetProperty("unitId", out var u))
                {
                    unitId = u.ValueKind switch
                    {
                        JsonValueKind.String => u.GetString(),
                        JsonValueKind.Number => u.TryGetInt64(out var n) ? n.ToString() : null,
                        _ => u.GetRawText().Trim('"')
                    };
                }

                if (data.TryGetProperty("targetUnitId", out var tu))
                {
                    targetUnitId = tu.ValueKind switch
                    {
                        JsonValueKind.String => tu.GetString(),
                        JsonValueKind.Number => tu.TryGetInt64(out var n) ? n.ToString() : null,
                        _ => tu.GetRawText().Trim('"')
                    };
                }
            }
        }
        catch
        {
            /* fall through */
        }

        if (string.IsNullOrWhiteSpace(unitId) ||  string.IsNullOrWhiteSpace(targetUnitId))
        {
            await context.SendErrorAsync(clientId, "bad_move_payload");
            return;
        }
        
        var (ok, error) = entityController.TrySetTarget(accountId, unitId, targetUnitId);
        if (!ok)
            await context.SendErrorAsync(clientId, error ?? "move_failed");
    }
}