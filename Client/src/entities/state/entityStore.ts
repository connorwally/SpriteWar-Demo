import { defineStore } from 'pinia'
import type { PlayerId } from '@/core/types'
import type { Entity } from '@/entities/types'

type EntityPatch = Partial<Entity> & { id: string }

export const useEntityStore = defineStore('entities', {
    state: () => ({
        byId: new Map<string, Entity>(),
    }),
    getters: {
        all: (s) => Array.from(s.byId.values()),
        byOwner: (s) => (ownerId: PlayerId) =>
            Array.from(s.byId.values()).filter((e) => e.ownerId === ownerId),
    },
    actions: {
        upsertMany(entities: Entity[]) {
            for (const e of entities) this.byId.set(e.id, e)
        },

        patch(change: EntityPatch) {
            const cur = this.byId.get(change.id)
            if (!cur) return

            // Don’t overwrite with null/undefined
            const clean: Record<string, any> = {}
            for (const [k, v] of Object.entries(change)) {
                if (k === 'id') continue
                if (v !== null && v !== undefined) clean[k] = v
            }

            // Shallow merge is fine; pos replacement is intentional
            this.byId.set(change.id, { ...cur, ...clean } as Entity)
        },

        patchMany(changes: EntityPatch[]) {
            if (!Array.isArray(changes)) return
            for (const ch of changes) this.patch(ch)
        },
        remove(id: string) {
            this.byId.delete(id)
        },
        clear() {
            this.byId.clear()
        },
        attack(attackerId: string, targetId: string) {
            const a = this.byId.get(attackerId)
            const t = this.byId.get(targetId)
            if (!a || !t) return
        },
    },
})
