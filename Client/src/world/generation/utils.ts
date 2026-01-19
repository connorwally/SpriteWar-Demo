// Deterministic Xorshift32 (same as server)
export class XorShift32 {
    private state: number
    constructor(seed: number) {
        // Avoid seed 0 degenerate state
        this.state = seed >>> 0 || 0x9e3779b9
    }
    nextU32(): number {
        let x = this.state >>> 0
        x ^= x << 13
        x ^= x >>> 17
        x ^= x << 5
        this.state = x >>> 0
        return this.state
    }
    // 0..1
    nextFloat(): number {
        // Keep full 32-bit range, divide by 2^32
        return (this.nextU32() >>> 0) / 4294967296
    }
}

// Build the permutation array from a seed (Fisher-Yates shuffle)
export function makePermutation(seed: number): Uint8Array {
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    const rng = new XorShift32(seed >>> 0)
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng.nextFloat() * (i + 1))
        const tmp = p[i]
        p[i] = p[j]
        p[j] = tmp
    }
    return p
}

// Improved Perlin helpers
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + t * (b - a)

// 2D gradient hash → dot product with (x,y)
function grad2(hash: number, x: number, y: number): number {
    // 8 gradients (like the classic impl)
    switch (hash & 7) {
        case 0:
            return x + y
        case 1:
            return x - y
        case 2:
            return -x + y
        case 3:
            return -x - y
        case 4:
            return x
        case 5:
            return -x
        case 6:
            return y
        default:
            return -y
    }
}

// Core Perlin 2D in [-1,1]
export function perlin2D(p: Uint8Array, x: number, y: number): number {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255

    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)

    const u = fade(xf)
    const v = fade(yf)

    const A = p[X] + Y
    const AA = p[A & 255]
    const AB = p[(A + 1) & 255]

    const B = p[(X + 1) & 255] + Y
    const BA = p[B & 255]
    const BB = p[(B + 1) & 255]

    const x1 = lerp(grad2(p[AA], xf, yf), grad2(p[BA], xf - 1, yf), u)
    const x2 = lerp(grad2(p[AB], xf, yf - 1), grad2(p[BB], xf - 1, yf - 1), u)

    return lerp(x1, x2, v) // [-1,1]
}

// Fractal Brownian Motion (octaves) mapped to [0,1]
export function fbm2D(
    p: Uint8Array,
    x: number,
    y: number,
    octaves = 4,
    lacunarity = 2,
    persistence = 0.5
): number {
    let amp = 1,
        freq = 1,
        sum = 0,
        norm = 0
    for (let i = 0; i < octaves; i++) {
        sum += perlin2D(p, x * freq, y * freq) * amp
        norm += amp
        amp *= persistence
        freq *= lacunarity
    }
    // Map [-norm, norm] to [0,1]
    return (sum / norm) * 0.5 + 0.5
}
