import { defineStore } from 'pinia'
import type { PlayerId, PlayerSnapshot } from '@/core/types'

export const useSessionStore = defineStore('session', {
    state: () => ({
        playerId: null as PlayerId | null,
        connected: false,
    }),
    actions: {
        setPlayer(player: PlayerSnapshot) {
            this.playerId = player.id
        },
        setConnected(v: boolean) {
            this.connected = v
        },
        reset() {
            this.playerId = null
            this.connected = false
        },
    },
})
