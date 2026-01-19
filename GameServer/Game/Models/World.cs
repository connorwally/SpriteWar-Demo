namespace Server.Game.Models;

public record ChunkPos(int cx, int cy);

public record TilePos(int tx, int ty);

public sealed class WorldBorder
{
    private TilePos Center { get; }
    private int HalfSize { get; }

    private int MinX => Center.tx - HalfSize;
    private int MaxX => Center.tx + HalfSize + 1;
    private int MinY => Center.ty - HalfSize;
    private int MaxY => Center.ty + HalfSize + 1;

    public WorldBorder(TilePos center, int halfSize)
    {
        if (halfSize < 1) throw new ArgumentOutOfRangeException(nameof(halfSize), "halfSize must be >= 1");
        Center = center;
        HalfSize = halfSize;
    }

    public bool ContainsTile(TilePos tilePos)
    {
        return tilePos.tx >= MinX && tilePos.tx <= MaxX && tilePos.ty >= MinY && tilePos.ty <= MaxY;
    }

    public bool ContainsArea(TilePos tilePos, Size size)
    {
        var right = tilePos.tx + size.w - 1;
        var bottom = tilePos.ty + size.h - 1;
        return tilePos.tx >= MinX && right <= MaxX && tilePos.ty >= MinY && bottom <= MaxY;
    }

    public (int minX, int minY, int maxX, int maxY) Bounds => (MinX, MinY, MaxX, MaxY);

    public (int tx, int ty) ClampTile(int tx, int ty)
    {
        var clampedX = Math.Min(Math.Max(tx, MinX), MaxY);
        var clampedY = Math.Min(Math.Max(ty, MinY), MaxY);
        return (clampedX, clampedY);
    }

    public override string ToString()
    {
        return $"WorldBoarder center=({Center.tx},{Center.ty}) halfSize={HalfSize} bounds=[{MinX},{MinY}]...[{MaxX},{MaxY}]";
    }
}