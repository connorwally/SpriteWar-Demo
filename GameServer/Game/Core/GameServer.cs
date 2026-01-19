using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Server.Game.Controllers;
using Server.Game.Handlers;
using Server.Game.Models;
using Server.Game.Models.DTOs;
using Server.Game.Services;
using Server.Game.Services.Entities;
using System.Diagnostics;

namespace Server.Game.Core;

public sealed class GameServer : BackgroundService
{
    private readonly ConcurrentDictionary<Guid, Client> _clients = new();
    private readonly ConcurrentDictionary<Guid, int> _clientToAccountId = new(); // Maps clientId to AccountId
    private readonly ConcurrentQueue<Inbound> _inbound = new();

    private readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private const int TickRateHz = 2;
    private static readonly TimeSpan TickInterval = TimeSpan.FromMilliseconds(1000 / TickRateHz);

    private long _serverTick;
    private readonly GameController _gameController;
    private readonly SessionManager _sessionManager;
    private readonly EntityManager _entityManager;
    private readonly ChunkSystem _chunkSystem;
    private readonly ILogger<GameServer> _logger;

    private readonly MessageHandlerRegistry _messageHandlers;
    private readonly MessageContext _context;

    public GameServer(
        MessageHandlerRegistry messageHandlers, 
        SessionManager sessionManager, 
        EntityManager entityManager, 
        GameController gameController, 
        ChunkSystem chunkSystem,
        ILogger<GameServer> logger)
    {
        _gameController = gameController;
        _messageHandlers = messageHandlers;
        _context = new MessageContext(this, _gameController);
        _sessionManager = sessionManager;
        _entityManager = entityManager;
        _chunkSystem = chunkSystem;
        _logger = logger;
    }

    private record Inbound(Guid ClientId, string Op, JsonElement Data);

    private sealed class Client(WebSocket socket)
    {
        public Guid Id { get; } = Guid.NewGuid();
        public WebSocket Socket { get; } = socket;
        public int? AccountId { get; set; } // Track the authenticated user's AccountId

        public Channel<string> Outgoing { get; } = Channel.CreateBounded<string>(new BoundedChannelOptions(256)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false
        });
    }

    // ----- Accept -----
    public async Task AcceptClientAsync(WebSocket ws, string? authToken, CancellationToken ct)
    {
        var client = new Client(ws);

        int? accountId = GuestIdAllocator.NextId();
        client.AccountId = accountId.Value;

        if (!_clients.TryAdd(client.Id, client))
        {
            await ws.CloseAsync(WebSocketCloseStatus.InternalServerError, "Failed to register", ct);
            return;
        }

        // Map client to account
        _clientToAccountId[client.Id] = accountId.Value;

        var hadSession = _sessionManager.GetSessionByAccountId(accountId.Value) != null;

        // Try to create or join session
        var (success, error, session) = _sessionManager.TryCreateOrJoinSession(accountId.Value);
        if (!success || session == null)
        {
            _clients.TryRemove(client.Id, out _);
            _clientToAccountId.TryRemove(client.Id, out _);
            await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, error ?? "Session error", ct);
            return;
        }

        // Update activity
        _sessionManager.UpdateActivity(accountId.Value);

        if (!hadSession && !_sessionManager.IsAccountBootstrapped(accountId.Value))
        {
            _gameController.EnsurePlayerBootstrap(accountId.Value);
            _sessionManager.MarkAccountBootstrapped(accountId.Value);
        }
        
        _entityManager.MarkPlayerForInterestUpdate(accountId.Value);

        var sendTask = SendLoopAsync(client, ct);
        var recvTask = ReceiveLoopAsync(client, ct);

        await Task.WhenAny(sendTask, recvTask);
        try
        {
            await Task.WhenAll(sendTask, recvTask);
        }
        catch
        {
            /* ignore */
        }

        _clients.TryRemove(client.Id, out _);
        _clientToAccountId.TryRemove(client.Id, out _);
        if (client.AccountId.HasValue)
        {
            _sessionManager.RemoveSession(client.AccountId.Value);
        }

        try
        {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Bye", ct);
        }
        catch
        {
            /* ignore */
        }
    }

    // ----- Game loop -----
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var timer = new PeriodicTimer(TickInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var tickStart = Stopwatch.GetTimestamp();

                _serverTick++;

                // Sequential processing is best
                while (_inbound.TryDequeue(out var msg))
                    await HandleInbound(msg);

                // 2) simulate world
                _gameController.Update(_serverTick);

                var patches = _gameController.DrainPatches();
                if (patches.Count > 0)
                {
                    BroadcastPatchesToInterestedPlayers(patches);
                }

                // 4) lightweight tick
                Broadcast(new { t = "tick", serverTick = _serverTick, online = _clients.Count });

                // ---- timing debug ----
                var elapsed = Stopwatch.GetElapsedTime(tickStart);
                var elapsedMs = elapsed.TotalMilliseconds;
                var remainingMs = TickInterval.TotalMilliseconds - elapsedMs;
                if (remainingMs < 0) remainingMs = 0;

                _logger.LogInformation("[TICK] #{tickNumber} calc={elapsedMs:F2}ms remaining={remainingMs:F2}ms (budget={TickInterval.TotalMilliseconds:F2}ms)", _serverTick, elapsedMs, remainingMs, TickInterval.TotalMilliseconds);
            }
        }
        finally
        {
            timer.Dispose();
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("GameServer stopping...");

        var closeTasks = new List<Task>();
        foreach (var client in _clients.Values)
        {
            client.Outgoing.Writer.Complete();

            if (client.Socket.State == WebSocketState.Open)
            {
                closeTasks.Add(client.Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Server shutting down",
                    cancellationToken));
            }
        }

        if (closeTasks.Count > 0)
        {
            try
            {
                await Task.WhenAll(closeTasks).WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
            }
            catch (TimeoutException)
            {
                _logger.LogWarning("Some WebSocket connections did not close gracefully");
            }
        }

        await base.StopAsync(cancellationToken);
        _logger.LogInformation("GameServer stopped.");
    }

    private async Task HandleInbound(Inbound msg)
    {
        // Get the account ID for this client
        if (!_clientToAccountId.TryGetValue(msg.ClientId, out var accountId))
        {
            await SendJsonAsync(msg.ClientId, new { t = "error", reason = "no_session" });
            return;
        }

        // Update session activity
        _sessionManager.UpdateActivity(accountId);

        // Handle the message
        await _messageHandlers.HandleMessageAsync(msg.Op, msg.ClientId, accountId, msg.Data, _context);
    }

    // ----- plumbing -----
    private async Task ReceiveLoopAsync(Client c, CancellationToken ct)
    {
        var ws = c.Socket;
        var buffer = new byte[64 * 1024];
        using var ms = new MemoryStream();

        while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            ms.SetLength(0);
            WebSocketReceiveResult? result;
            do
            {
                result = await ws.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Close)
                    return;

                ms.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            if (result.MessageType != WebSocketMessageType.Text)
                continue;

            var json = Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);

            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                string op;
                JsonElement d = default;

                if (root.TryGetProperty("op", out var opProp))
                {
                    op = opProp.GetString() ?? "";
                    if (root.TryGetProperty("d", out var dProp)) d = dProp.Clone();
                }
                else if (root.TryGetProperty("t", out var tProp))
                {
                    op = tProp.GetString() ?? "";
                    if (root.TryGetProperty("d", out var dProp)) d = dProp.Clone();
                }
                else op = "unknown";

                _inbound.Enqueue(new Inbound(c.Id, op, d));
            }
            catch
            {
                await SendJsonAsync(c.Id, new { t = "error", reason = "invalid_json" });
            }
        }
    }

    private async Task SendLoopAsync(Client c, CancellationToken ct)
    {
        var ws = c.Socket;
        try
        {
            while (await c.Outgoing.Reader.WaitToReadAsync(ct))
            {
                while (c.Outgoing.Reader.TryRead(out var json))
                {
                    var mem = Encoding.UTF8.GetBytes(json);
                    await ws.SendAsync(mem, WebSocketMessageType.Text, true, ct);
                }
            }
        }
        catch
        {
            /* socket closed */
        }
    }

    public async Task SendJsonAsync(Guid clientId, object payload)
    {
        if (!_clients.TryGetValue(clientId, out var c)) return;
        var json = JsonSerializer.Serialize(payload, _json);
        if (!c.Outgoing.Writer.TryWrite(json))
            await c.Outgoing.Writer.WriteAsync(json);
    }

    public async Task SendErrorAsync(Guid clientId, string reason)
    {
        await SendJsonAsync(clientId, new { t = "error", reason });
    }

    private void Broadcast(object payload)
    {
        var json = JsonSerializer.Serialize(payload, _json);
        foreach (var c in _clients.Values)
            _ = c.Outgoing.Writer.TryWrite(json);
    }

    private void BroadcastPatchesToInterestedPlayers(List<object> patches)
    {
        foreach (var patch in patches)
        {
            if (patch is EntityPatchDto entityPatch)
            {
                // Handle entity position patches
                var position = _entityManager.GetEntityPosition(entityPatch.Id);
                if (!position.HasValue) continue;
                var chunk = ChunkSystem.GetChunkCoords(new TilePos(position.Value.tx, position.Value.ty));
                var interestedAccountIds = _chunkSystem.GetPlayersForChunk(chunk);
                var payload = new { t = "entity_patch", changes = new[] { patch } };
                var json = JsonSerializer.Serialize(payload, _json);

                // Find all clients for these account IDs
                foreach (var clientId in interestedAccountIds.Select(accountId => _clientToAccountId
                             .Where(kvp => kvp.Value == accountId)
                             .Select(kvp => kvp.Key)).SelectMany(clientsForAccount => clientsForAccount))
                {
                    if (_clients.TryGetValue(clientId, out var client))
                    {
                        _ = client.Outgoing.Writer.TryWrite(json);
                    }
                }
            }
            else
            {
                // Handle custom patches (entity_add, entity_remove)
                var json = JsonSerializer.Serialize(patch, _json);

                // Get the accountId from the patch
                var accountIdProperty = patch.GetType().GetProperty("accountId");
                if (accountIdProperty?.GetValue(patch) is int accountId)
                {
                    // Find clients for this account
                    var clientsForAccount = _clientToAccountId
                        .Where(kvp => kvp.Value == accountId)
                        .Select(kvp => kvp.Key)
                        .ToList();

                    foreach (var clientId in clientsForAccount)
                    {
                        if (_clients.TryGetValue(clientId, out var client))
                        {
                            _ = client.Outgoing.Writer.TryWrite(json);
                        }
                    }
                }
            }
        }
    }
}