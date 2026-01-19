import { defineStore } from 'pinia'

export type AppMode = 'menu' | 'gameplay' | 'defeat'

export const useAppStore = defineStore('app', {
    state: () => ({ mode: 'menu' as AppMode }),
    actions: {
        setMode(m: AppMode) {
            this.mode = m
        },
    },
})
