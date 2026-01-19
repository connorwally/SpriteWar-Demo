export const TILE_SIZE = 16
export const CHUNK_TILES = 16

// COLOURS
export const COLORS = {
    bg: 0x151515,
    grid: 0x2a2a2a,
    gridMajor: 0x3b3b3b,
    selStroke: 0x5a5aee,
    selFill: 0x5a5aee,
    unit: 0xff4757,
    building: 0x4aa3ff,
}

export const TERRAIN_COLORS = {
    water1: 0x42acaf,
    water2: 0x4ebcb9,
    water3: 0x77c0b4,
    beach1: 0xb1c9a7,
    beach2: 0xe7d593,
    grass1: 0xc3d657,
    grass2: 0xb1d354,
}

// TERRAIN
export const TERRAIN_VALUES = {
    water1: 0.3,
    water2: 0.35,
    water3: 0.4,
    beach1: 0.42,
    beach2: 0.45,
    grass1: 0.66,
}

export const TERRAIN_DEFAULTS = {
    seed: 0,
    noise: {
        scale: 64,
        octaves: 4,
        lacunarity: 2,
        persistence: 0.5,
    },
    palette: TERRAIN_COLORS,
    values: TERRAIN_VALUES,
}

export const CHUNK_GEN_DEFAULTS = {
    bufferChunks: 1,
    maxCachedChunks: 128,
    bakesPerFrame: 1,
    maxConcurrentBakes: 2,
    aheadWeight: 0,
}

// MISC
export const MENU_SCENE = {
    panSpeedPxSec: 80,
    treeDensity: 1,
}

export const CAMERA = {
    minScale: 0.25,
    maxScale: 3,
    wheelSpeed: 0.15,
    dragThreshold: 10, // px
    edgePan: { size: 96, speed: 500 },
}

// Hotkeys for context actions
export const CONTEXT_ACTION_KEYS = ['Q', 'E', 'R', 'T', 'Z', 'X', 'C', 'V'] as const
export const CONTEXT_HOTKEY_EVENT = 'context-action-hotkey'
