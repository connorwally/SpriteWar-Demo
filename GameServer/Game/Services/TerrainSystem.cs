using System.Numerics;

namespace Server.Game.Services;

/// <summary>
/// Deterministic Xorshift32 PRNG (matches client implementation)
/// </summary>
public class XorShift32
{
    private uint _state;

    public XorShift32(uint seed)
    {
        // Avoid seed 0 degenerate state
        _state = seed != 0 ? seed : 0x9e3779b9;
    }

    public uint NextU32()
    {
        uint x = _state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        _state = x;
        return _state;
    }

    public double NextFloat()
    {
        // Keep full 32-bit range, divide by 2^32
        return NextU32() / 4294967296.0;
    }
}

/// <summary>
/// Build the permutation array from a seed (Fisher-Yates shuffle) - matches client
/// </summary>
public static class TerrainNoise
{
    public static byte[] MakePermutation(uint seed)
    {
        var p = new byte[256];
        for (int i = 0; i < 256; i++) p[i] = (byte)i;

        var rng = new XorShift32(seed);
        for (int i = 255; i > 0; i--)
        {
            int j = (int)(rng.NextFloat() * (i + 1));
            (p[i], p[j]) = (p[j], p[i]);
        }

        return p;
    }

    // Improved Perlin helpers (matches client)
    private static double Fade(double t) => t * t * t * (t * (t * 6 - 15) + 10);
    private static double Lerp(double a, double b, double t) => a + t * (b - a);

    // 2D gradient hash → dot product with (x,y)
    private static double Grad2(byte hash, double x, double y)
    {
        // 8 gradients (like the classic impl)
        return (hash & 7) switch
        {
            0 => x + y,
            1 => x - y,
            2 => -x + y,
            3 => -x - y,
            4 => x,
            5 => -x,
            6 => y,
            _ => -y
        };
    }

    // Core Perlin 2D in [-1,1]
    public static double Perlin2D(byte[] p, double x, double y)
    {
        int X = ((int)Math.Floor(x)) & 255;
        int Y = ((int)Math.Floor(y)) & 255;

        double xf = x - Math.Floor(x);
        double yf = y - Math.Floor(y);

        double u = Fade(xf);
        double v = Fade(yf);

        int A = p[X] + Y;
        byte AA = p[A & 255];
        byte AB = p[(A + 1) & 255];

        int B = p[(X + 1) & 255] + Y;
        byte BA = p[B & 255];
        byte BB = p[(B + 1) & 255];

        double x1 = Lerp(Grad2(p[AA], xf, yf), Grad2(p[BA], xf - 1, yf), u);
        double x2 = Lerp(Grad2(p[AB], xf, yf - 1), Grad2(p[BB], xf - 1, yf - 1), u);

        return Lerp(x1, x2, v); // [-1,1]
    }

    // Fractal Brownian Motion (octaves) mapped to [0,1]
    public static double Fbm2D(byte[] p, double x, double y, int octaves = 4, double lacunarity = 2,
        double persistence = 0.5)
    {
        double amp = 1, freq = 1, sum = 0, norm = 0;
        for (int i = 0; i < octaves; i++)
        {
            sum += Perlin2D(p, x * freq, y * freq) * amp;
            norm += amp;
            amp *= persistence;
            freq *= lacunarity;
        }

        // Map [-norm, norm] to [0,1]
        return (sum / norm) * 0.5 + 0.5;
    }

    /// <summary>
    /// Get terrain type at a specific tile position (matches client logic)
    /// </summary>
    public static TerrainType GetTerrainType(byte[] permutation, int tx, int ty, double scale = 64, int octaves = 4,
        double lacunarity = 2, double persistence = 0.5)
    {
        double noise = Fbm2D(permutation, tx / scale, ty / scale, octaves, lacunarity, persistence);

        // Match client's pickTileByNoise logic
        if (noise < 0.3) return TerrainType.Water1;
        if (noise < 0.35) return TerrainType.Water2;
        if (noise < 0.4) return TerrainType.Water3;
        if (noise < 0.42) return TerrainType.Beach1;
        if (noise < 0.45) return TerrainType.Beach2;
        if (noise < 0.7) return TerrainType.Grass1;
        return TerrainType.Grass2;
    }
}

/// <summary>
/// Terrain types matching client implementation
/// </summary>
public enum TerrainType
{
    Water1, // noise < 0.3
    Water2, // noise < 0.35
    Water3, // noise < 0.4
    Beach1, // noise < 0.42
    Beach2, // noise < 0.45
    Grass1, // noise < 0.7
    Grass2 // noise >= 0.7
}

/// <summary>
/// GameServer-side terrain collision system
/// </summary>
public sealed class TerrainSystem(
    uint seed,
    double scale = 64,
    int octaves = 4,
    double lacunarity = 2,
    double persistence = 0.5)
{
    private readonly byte[] _permutation = TerrainNoise.MakePermutation(seed);

    public readonly uint TerrainSeed = seed;

    /// <summary>
    /// Check if a position is passable (not water)
    /// </summary>
    public bool IsPassable(int tx, int ty)
    {
        var terrainType =
            TerrainNoise.GetTerrainType(_permutation, tx, ty, scale, octaves, lacunarity, persistence);
        return terrainType != TerrainType.Water1 &&
               terrainType != TerrainType.Water2 &&
               terrainType != TerrainType.Water3;
    }

    /// <summary>
    /// Get terrain type at a specific tile position
    /// </summary>
    public TerrainType GetTerrainType(int tx, int ty)
    {
        return TerrainNoise.GetTerrainType(_permutation, tx, ty, scale, octaves, lacunarity, persistence);
    }

    /// <summary>
    /// Check if a rectangular area is passable
    /// </summary>
    public bool IsAreaPassable(int centerTx, int centerTy, int width, int height)
    {
        for (int x = centerTx; x < centerTx + width; x++)
        {
            for (int y = centerTy; y < centerTy + height; y++)
            {
                if (!IsPassable(x, y))
                    return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Get the raw Perlin noise value at a specific position (for tree generation)
    /// </summary>
    public double GetNoiseValue(int tx, int ty)
    {
        return TerrainNoise.Fbm2D(_permutation, tx / scale, ty / scale, octaves, lacunarity, persistence);
    }
}
