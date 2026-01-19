using System.Text.Json;
using Server.Game.Controllers;

namespace Server.Game.Handlers.Messages;

public class ForfeitMessageHandler(SessionController sessionController) : IMessageHandler
{
    public string MessageType => "forfeit";

    public async Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context)
    {
        sessionController.ForfeitPlayer(accountId);
        await context.SendJsonAsync(clientId, new { t = "forfeit_confirmed" });

        _ = Task.Run(async () =>
        {
            await Task.Delay(1000);
        });
    }
}