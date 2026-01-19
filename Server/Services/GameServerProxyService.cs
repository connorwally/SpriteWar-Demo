using System.Net.WebSockets;
using System.Text;

namespace Server.Services;

public class GameServerProxyService(IConfiguration config, ILogger<GameServerProxyService> logger)
{
// Server/Services/GameServerProxyService.cs
    public async Task ProxyWebSocketAsync(WebSocket clientSocket, CancellationToken cancellationToken)
    {
        var gameServerUrl = config["GameServer:WebSocketUrl"];
        if (string.IsNullOrEmpty(gameServerUrl))
        {
            gameServerUrl = "ws://localhost:5038/ws";
            logger.LogWarning("GameServer:WebSocketUrl not configured, using default: {Url}", gameServerUrl);
        }

        using var gameServerSocket = new ClientWebSocket();

        if (!Uri.TryCreate(gameServerUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "ws" && uri.Scheme != "wss"))
        {
            logger.LogError("Invalid GameServer WebSocket URL: {Url}", gameServerUrl);
            await clientSocket.CloseAsync(WebSocketCloseStatus.InternalServerError, "Invalid GameServer URL", cancellationToken);
            return;
        }

        // No Authorization header – guests only
        await gameServerSocket.ConnectAsync(uri, cancellationToken);

        var clientToServerTask = ForwardMessagesAsync(clientSocket, gameServerSocket, "Client -> GameServer)", cancellationToken);
        var serverToClientTask = ForwardMessagesAsync(gameServerSocket, clientSocket, "GameServer -> Client)", cancellationToken);

        await Task.WhenAny(clientToServerTask, serverToClientTask);
    }

    private async Task ForwardMessagesAsync(WebSocket source, WebSocket destination, string directionLabel,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[4096];

        try
        {
            while (source.State == WebSocketState.Open && destination.State == WebSocketState.Open &&
                   !cancellationToken.IsCancellationRequested)
            {
                var result = await source.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

                switch (result.MessageType)
                {
                    case WebSocketMessageType.Close:
                        await destination.CloseAsync(WebSocketCloseStatus.NormalClosure, "Source closed",
                            cancellationToken);
                        return;
                    case WebSocketMessageType.Text:
                    {
                        var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        logger.LogDebug("{Direction}: {Length}", directionLabel, message);

                        await destination.SendAsync(new ArraySegment<byte>(buffer, 0, result.Count),
                            WebSocketMessageType.Text, result.EndOfMessage, cancellationToken);
                        break;
                    }
                    case WebSocketMessageType.Binary:
                        break;
                    default:
                        throw new ArgumentOutOfRangeException();
                }
            }
        }
        catch (Exception ex) when (ex is WebSocketException || ex is ObjectDisposedException || ex is IOException)
        {
            // These are expected when client disconnects abruptly
            logger.LogDebug("Client disconnected during message forwarding: {Direction}", directionLabel);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unexpected error forwarding messages {Direction}", directionLabel);
        }
    }
}