import { defineStore } from 'pinia'
import type { Entity } from '@/entities/types'

export type ChunkCoords = { cx: number; cy: number }

export const useFogOfWarStore = defineStore('fogOfWar', {
    state: () => ({
        playerId: null as string | null,
        chunkSize: 16, // Must match server chunk size
    }),

    getters: {
        /**
         * Get chunk coordinates for a tile position
         */
        getChunkCoords:
            (state) =>
            (tx: number, ty: number): ChunkCoords => ({
                cx: Math.floor(tx / state.chunkSize),
                cy: Math.floor(ty / state.chunkSize),
            }),

        /**
         * Get all chunks that should be visible based on player's entities
         */
        getVisibleChunks:
            (state) =>
            (entities: Entity[]): ChunkCoords[] => {
                if (!state.playerId) return []

                const playerEntities = entities.filter((e) => e.ownerId === state.playerId)
                const chunks = new Set<string>()

                for (const entity of playerEntities) {
                    const chunk = {
                        cx: Math.floor(entity.pos.tx / state.chunkSize),
                        cy: Math.floor(entity.pos.ty / state.chunkSize),
                    }
                    chunks.add(`${chunk.cx},${chunk.cy}`)
                }

                return Array.from(chunks).map((key) => {
                    const [cx, cy] = key.split(',').map(Number)
                    return { cx, cy }
                })
            },
    },

    actions: {
        setPlayerId(playerId: string) {
            this.playerId = playerId
        },

        setChunkSize(size: number) {
            this.chunkSize = size
        },
    },
})
