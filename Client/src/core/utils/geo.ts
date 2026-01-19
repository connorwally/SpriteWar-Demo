// Chunk math

import type { TilePos } from '@/core/types'

export const CHUNK_SIZE = 64

export type ChunkCoord = { cx: number; cy: number }
export type LocalTile = { lx: number; ly: number }

export function toChunk(tx: number, ty: number): { chunk: ChunkCoord; local: LocalTile } {
    const cx = Math.floor(tx / CHUNK_SIZE)
    const cy = Math.floor(ty / CHUNK_SIZE)
    const lx = tx - cx * CHUNK_SIZE
    const ly = ty - cy * CHUNK_SIZE
    return { chunk: { cx, cy }, local: { lx, ly } }
}

export const tileKey = (tx: number, ty: number) => `${tx},${ty}`
export const chunkKey = (cx: number, cy: number) => `${cx},${cy}`

export function sameTile(a: TilePos, b: TilePos): boolean {
    return a.tx === b.tx && a.ty === b.ty
}
