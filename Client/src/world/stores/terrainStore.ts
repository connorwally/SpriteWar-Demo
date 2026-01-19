import { defineStore } from 'pinia'

export const useTerrainStore = defineStore('terrain', {
    state: () => ({
        seed: 123456789, // Default fallback seed
    }),

    actions: {
        setSeed(seed: number) {
            this.seed = seed
        },
    },
})
