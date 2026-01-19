import { fbm2D, makePermutation, XorShift32 } from '@/world/generation/utils'
import { TERRAIN_DEFAULTS } from '@/core/config'

export type NoiseParams = {
    scale: number
    octaves: number
    lacunarity: number
    persistence: number
}

export type TerrainPalette = {
    water1: number
    water2: number
    water3: number
    beach1: number
    beach2: number
    grass1: number
    grass2: number
}

export type TerrainValues = {
    water1: number
    water2: number
    water3: number
    beach1: number
    beach2: number
    grass1: number
}

export class NoiseGenerator {
    private seed: number
    private noise: NoiseParams
    private perm: Uint8Array
    private palette: TerrainPalette
    private values: TerrainValues

    constructor(opts: {
        seed: number
        noise: NoiseParams
        palette?: Partial<TerrainPalette>
        values?: TerrainValues
    }) {
        this.seed = opts.seed >>> 0
        this.noise = { ...TERRAIN_DEFAULTS.noise, ...(opts.noise || {}) }
        this.perm = makePermutation(this.seed)
        this.palette = { ...TERRAIN_DEFAULTS.palette, ...(opts.palette || {}) }
        this.values = { ...TERRAIN_DEFAULTS.values, ...(opts.values || {}) }
    }

    private noiseAt(tx: number, ty: number): number {
        return fbm2D(
            this.perm,
            tx / this.noise.scale,
            ty / this.noise.scale,
            this.noise.octaves,
            this.noise.lacunarity,
            this.noise.persistence
        )
    }

    public getTileAlias(
        tx: number,
        ty: number
    ): 'water1' | 'water2' | 'water3' | 'beach1' | 'beach2' | 'grass1' | 'grass2' {
        const n = this.noiseAt(tx, ty)
        if (n <= this.values.water1) return 'water1'
        if (n <= this.values.water2) return 'water2'
        if (n <= this.values.water3) return 'water3'
        if (n <= this.values.beach1) return 'beach1'
        if (n <= this.values.beach2) return 'beach2'
        if (n <= this.values.grass1) return 'grass1'
        return 'grass2'
    }

    getTileColor(tx: number, ty: number): number {
        const alias = this.getTileAlias(tx, ty)
        return this.palette[alias]
    }

    isLand(tx: number, ty: number): boolean {
        const v = this.noiseAt(tx, ty)
        return v > this.values.water3
    }

    randomAt(tx: number, ty: number): number {
        const seed = (this.seed ^ (tx * 187126318) ^ (ty * 120387)) >>> 0
        const rng = new XorShift32(seed)
        return rng.nextFloat()
    }

    setSeed(seed: number) {
        const s = seed >>> 0
        if (s === this.seed) return
        this.seed = s
        this.perm = makePermutation(this.seed)
    }
}
