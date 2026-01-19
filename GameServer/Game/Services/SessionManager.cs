using System.Collections.Concurrent;

namespace Server.Game.Services;

public sealed class PlayerSession(int accountId)
{
    public int AccountId { get; } = accountId;
    private DateTime LastActivity { get; set; } = DateTime.UtcNow;

    public void UpdateActivity()
    {
        LastActivity = DateTime.UtcNow;
    }

    public bool HasTimedOut(TimeSpan timeout)
    {
        return DateTime.UtcNow - LastActivity > timeout;
    }
}

public sealed class SessionManager
{
    private readonly ConcurrentDictionary<int, PlayerSession> _sessionsByAccountId = new();
    private readonly TimeSpan _sessionTimeout = TimeSpan.FromMinutes(15);
    private readonly ConcurrentDictionary<int, bool> _bootstrappedAccounts = new();

    public (bool success, string? error, PlayerSession? session) TryCreateOrJoinSession(int accountId)
    {
        // Check if user already has an active session
        if (_sessionsByAccountId.TryGetValue(accountId, out var existingSession))
        {
            if (!existingSession.HasTimedOut(_sessionTimeout))
            {
                // Update activity for existing session
                existingSession.UpdateActivity();
                return (true, null, existingSession);
            }

            // Timed out, will be replaced
            _sessionsByAccountId.TryRemove(accountId, out _);
        }

        // Create new session
        var newSession = new PlayerSession(accountId);
        _sessionsByAccountId[accountId] = newSession;

        return (true, null, newSession);
    }

    public PlayerSession? GetSessionByAccountId(int accountId)
    {
        return _sessionsByAccountId.GetValueOrDefault(accountId);
    }

    public List<int> GetAllAccountIds()
    {
        return _sessionsByAccountId.Keys.ToList();
    }

    public void UpdateActivity(int accountId)
    {
        var session = GetSessionByAccountId(accountId);
        session?.UpdateActivity();
    }

    public void RemoveSession(int accountId)
    {
        _sessionsByAccountId.TryRemove(accountId, out _);
    }

    public List<PlayerSession> GetTimedOutSessions()
    {
        return _sessionsByAccountId.Values.Where(session => session.HasTimedOut(_sessionTimeout))
            .ToList();
    }

    public void ClearSessionForPlayer(int accountId)
    {
        RemoveSession(accountId);
        ClearPlayerBootstrapped(accountId);
    }

    public bool IsAccountBootstrapped(int accountId)
    {
        return _bootstrappedAccounts.ContainsKey(accountId);
    }

    public void MarkAccountBootstrapped(int accountId)
    {
        _bootstrappedAccounts[accountId] = true;
    }

    public void ClearPlayerBootstrapped(int accountId)
    {
        _bootstrappedAccounts.TryRemove(accountId, out _);
    }
}