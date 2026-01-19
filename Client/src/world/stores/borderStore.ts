import { defineStore } from 'pinia'
import type { WorldBorder } from '@/core/types'

export const useBorderStore = defineStore('border', {
    state: () => ({
        border: null as WorldBorder | null,
    }),

    actions: {
        setBorder(border: WorldBorder) {
            this.border = border
        },
    },

    getters: {
        isOutside:
            (state) =>
            (tx: number, ty: number): boolean => {
                if (!state.border) return false
                return (
                    tx < state.border.minX ||
                    tx >= state.border.maxX ||
                    ty < state.border.minY ||
                    ty >= state.border.maxY
                )
            },
    },
})
