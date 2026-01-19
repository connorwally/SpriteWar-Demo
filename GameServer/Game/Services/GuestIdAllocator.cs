namespace Server.Game.Services;

public static class GuestIdAllocator
{
    private static int _next = 1_000_000;
    public static int NextId() => Interlocked.Increment(ref _next);
}