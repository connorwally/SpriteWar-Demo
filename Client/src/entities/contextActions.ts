import type { TypeRegistryApi } from './data/entityTypeRegistry'
import type { ActionId, ActionDescriptor, EntityType } from '@/entities/types'
import type { Entity } from '@/entities/types'
import { useBuildingStore } from '@/input/state/buildingStore'

export type ContextAction = {
    id: ActionId
    label: string
    hotkey?: string
    enabled: boolean
    tooltip?: string
    icon?: string
    onClick: () => void
}

function buildActions(
    d: ActionDescriptor,
    e: Entity,
    send: (cmd: any) => void,
    typeRegistry: TypeRegistryApi
): ContextAction[] {
    const common = { enabled: true } as const

    switch (d.id) {
        case 'move':
            return [
                {
                    ...common,
                    id: 'move',
                    label: 'Move',
                    hotkey: 'M',
                    onClick: () => console.log('Select destination then send move for', e.id),
                },
            ]
        case 'build': {
            const buildingStore = useBuildingStore()
            const allowed: string[] = d.buildings
            const buildingTypes = allowed
                .map((id) => typeRegistry.get(id)) // (EntityType | null)[]
                .filter((t): t is EntityType => t != null && t.category === 'building')

            return buildingTypes.map((b) => ({
                ...common,
                id: 'build',
                label: `Build ${b.label}`,
                enabled: true,
                icon: b.ui?.icon,
                onClick: () => buildingStore.startBuildingPlacement(b),
            }))
        }
        case 'train': {
            // Fan out one action per unit, include icon from entity registry
            return d.units
                .map((u) => typeRegistry.get(u))
                .filter((t): t is EntityType => t != null && t.category === 'unit')
                .map((t) => ({
                    ...common,
                    id: 'train',
                    label: `Train ${t.label}`,
                    hotkey: undefined,
                    enabled: true, // optionally: check player resources and disable if not affordable
                    icon: t.ui?.icon, // <-- uses icon from entities.json
                    onClick: () => send({ t: 'train', entityId: e.id, unitTypeId: t.id }),
                }))
        }
    }
}

export function getActionsForEntityType(
    e: Entity,
    send: (cmd: any) => void,
    typeRegistry: TypeRegistryApi
): ContextAction[] {
    const t = typeRegistry.get(e.typeId)
    if (!t || !t.actions) return []
    const expanded = t.actions.flatMap((d) => buildActions(d, e, send, typeRegistry))

    const seen = new Set<string>()
    return expanded.filter((a) => {
        const key = `${a.id}:${a.label}`
        return seen.has(key) ? false : (seen.add(key), true)
    })
}
