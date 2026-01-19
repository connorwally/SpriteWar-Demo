using System.Text.Json;
using Server.Game.Handlers.Messages;

namespace Server.Game.Handlers;

public class MessageHandlerRegistry
{
    private readonly Dictionary<string, IMessageHandler> _handlers = new();

    public MessageHandlerRegistry(
        MoveMessageHandler moveHandler,
        BuildMessageHandler buildHandler,
        ForfeitMessageHandler forfeitHandler,
        PingMessageHandler pingHandler,
        TargetMessageHandler targetHandler,
        TrainMessageHandler trainHandler,
        PlayMessageHandler playHandler,
        CancelTrainMessageHandler cancelTrainHandler)
    {
        RegisterHandler(moveHandler);
        RegisterHandler(buildHandler);
        RegisterHandler(forfeitHandler);
        RegisterHandler(pingHandler);
        RegisterHandler(targetHandler);
        RegisterHandler(trainHandler);
        RegisterHandler(playHandler);
        RegisterHandler(cancelTrainHandler);
    }

    private void RegisterHandler(IMessageHandler handler)
    {
        _handlers[handler.MessageType] = handler;
    }

    public async Task HandleMessageAsync(string messageType, Guid clientId, int accountId, JsonElement data,
        MessageContext context)
    {
        if (_handlers.TryGetValue(messageType, out var handler))
        {
            await handler.HandleAsync(clientId, accountId, data, context);
        }
        else
        {
            await context.SendErrorAsync(clientId, $"Unknown op '{messageType}'");
        }
    }
}