import { defineStore } from 'pinia'
import type { PlayerSnapshot, ResourceKind, TilePos } from '@/core/types'

type PlayerState = {
    resources: Record<ResourceKind, number>
    homeTile: TilePos | null
    popUsed: number
    popCap: number
}

export const usePlayerStore = defineStore('player', {
    state: (): PlayerState => ({
        resources: { wood: 0, food: 0, gold: 0, stone: 0 },
        homeTile: { tx: 0, ty: 0 },
        popUsed: 0,
        popCap: 0,
    }),
    getters: {
        wood: (s) => s.resources.wood,
        food: (s) => s.resources.food,
        gold: (s) => s.resources.gold,
        stone: (s) => s.resources.stone,
    },
    actions: {
        hydrate(snapshot: PlayerSnapshot) {
            this.resources = { ...snapshot.resources }
            this.homeTile = snapshot.homeTile ?? null
            if (typeof snapshot.popUsed === 'number') this.popUsed = snapshot.popUsed
            if (typeof snapshot.popCap === 'number') this.popCap = snapshot.popCap
        },
        applyDeltas(deltas: { kind: ResourceKind; amount: number }[]) {
            for (const d of deltas) {
                this.resources[d.kind] = Math.max(0, (this.resources[d.kind] ?? 0) + d.amount)
            }
        },
        setHomeTile(pos: TilePos) {
            this.homeTile = pos
        },
        setResources(resources: Record<ResourceKind, number>) {
            this.resources = { ...resources }
        },
        setPopulation(pop: { popUsed: number; popCap: number }) {
            this.popUsed = pop.popUsed
            this.popCap = pop.popCap
        },
    },
})
