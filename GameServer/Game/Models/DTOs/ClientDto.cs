using System.Net.WebSockets;
using System.Threading.Channels;

namespace Server.Game.Models.DTOs;

/// <summary>
/// Represents a connected WebSocket client
/// </summary>
public sealed class ClientDto(WebSocket socket)
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