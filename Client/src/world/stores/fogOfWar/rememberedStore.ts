import { defineStore } from 'pinia'
import type { Entity } from '@/entities/types'

export type Remembered = {
    id: string
    typeId: string
    ownerId: string
    pos: { tx: number; ty: number }
    updatedAt: number
}

export const useRememberedStore = defineStore('remembered', {
    state: () => ({
        byId: new Map<string, Remembered>(),
    }),
    getters: {
        get:
            (s) =>
            (id: string): Remembered | undefined =>
                s.byId.get(id),
        all: (s) => Array.from(s.byId.values()),
    },
    actions: {
        remember(e: Entity) {
            this.byId.set(e.id, {
                id: e.id,
                typeId: e.typeId,
                ownerId: e.ownerId,
                pos: { tx: e.pos.tx, ty: e.pos.ty },
                updatedAt: Date.now(),
            })
        },
        forget(id: string) {
            this.byId.delete(id)
        },
        clear() {
            this.byId.clear()
        },
    },
})
