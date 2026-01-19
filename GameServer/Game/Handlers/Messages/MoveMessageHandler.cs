using System.Text.Json;
using Server.Game.Controllers;

namespace Server.Game.Handlers.Messages;

public class MoveMessageHandler(EntityController entityController) : IMessageHandler
{
    public string MessageType => "move";

    public async Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context)
    {
        string? unitId = null;
        int tx = 0, ty = 0;

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

                if (data.TryGetProperty("tx", out var x)) tx = x.GetInt32();
                if (data.TryGetProperty("ty", out var y)) ty = y.GetInt32();
            }
        }
        catch
        {
            /* fall through */
        }

        if (string.IsNullOrWhiteSpace(unitId))
        {
            await context.SendErrorAsync(clientId, "bad_move_payload");
            return;
        }

        var (ok, error) = entityController.TryEnqueueMove(accountId, unitId, tx, ty);
        if (!ok)
            await context.SendErrorAsync(clientId, error ?? "move_failed");
    }
}