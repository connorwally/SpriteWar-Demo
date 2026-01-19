using System.Text.Json;

namespace Server.Game.Handlers.Messages;

public class PingMessageHandler : IMessageHandler
{
    public string MessageType => "ping";

    public async Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context)
    {
        await context.SendJsonAsync(clientId, new { t = "pong" });
    }
}