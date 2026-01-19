using System.Text.Json;
using Server.Game.Services;

namespace Server.Game.Handlers;

public interface IMessageHandler
{
    string MessageType { get; }
    Task HandleAsync(Guid clientId, int accountId, JsonElement data, MessageContext context);
}