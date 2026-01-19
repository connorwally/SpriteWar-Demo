import type { EntityType, ActionDescriptor, VisualDef } from '@/entities/types'
import { typeRegistry } from '@/entities/data/entityTypeRegistry'
import rawEntities from '@shared/game-data/entities.json'

type RawAction = { id: string; units?: string[]; buildings?: string[] } | string
type RawEntity = {
    id: string
    category: 'unit' | 'building' | 'resource'
    visual?: { spriteId?: string; atlas?: string; z?: number; sizeTiles?: { w: number; h: number } }
    unit?: { moveSpeed?: number; attackRange?: number; attackDamage?: number; viewRange?: number }
    building?: {
        popProvided?: number
        attackDamage?: number
        attackRange?: number
        viewRange?: number
    }
    resource?: Record<string, number>
    baseHP?: number
    size?: { w: number; h: number }
    actions?: RawAction[]
    ui?: { icon?: string }
}

function mapAction(a: RawAction): ActionDescriptor | null {
    const id = typeof a === 'string' ? a : a.id
    switch (id) {
        case 'move':
            return { id: 'move' }
        case 'build':
            const buildings = typeof a === 'string' ? [] : (a.buildings ?? [])
            return buildings.length > 0 ? { id: 'build', buildings } : null
        case 'train': {
            const units = typeof a === 'string' ? [] : (a.units ?? [])
            return units.length > 0 ? { id: 'train', units } : null
        }
        default:
            return null
    }
}

function atlasForCategory(cat: RawEntity['category']): 'units' | 'buildings' | 'resources' {
    return cat === 'unit' ? 'units' : cat === 'building' ? 'buildings' : 'resources'
}

function toEntityType(r: RawEntity): EntityType {
    const size = r.size ? { w: r.size.w, h: r.size.h } : { w: 1, h: 1 }
    const label = r.id
    const visual: VisualDef = {
        spriteId: r.visual?.spriteId ?? r.id,
        atlas: atlasForCategory(r.category),
        z: r.visual?.z,
    }

    const actions = (r.actions ?? []).map(mapAction).filter((x): x is ActionDescriptor => !!x)

    const unit =
        r.category === 'unit'
            ? {
                  moveSpeed: r.unit?.moveSpeed ?? 1,
                  attackRange: r.unit?.attackRange ?? 0,
                  baseHP: r.baseHP,
                  attackDamage: r.unit?.attackDamage ?? 0,
                  viewRange: r.unit?.viewRange ?? 0,
              }
            : undefined

    const building =
        r.category === 'building'
            ? {
                  baseHP: r.baseHP ?? 100,
                  popProvided: r.building?.popProvided,
                  attackDamage: r.building?.attackDamage,
                  attackRange: r.building?.attackRange,
                  viewRange: r.building?.viewRange ?? 0,
              }
            : undefined

    return {
        id: r.id,
        label,
        category: r.category,
        visual,
        size,
        unit,
        building,
        actions,
        ui: r.ui ?? undefined,
    }
}

export async function registerEntityTypes() {
    const raw = rawEntities as unknown as RawEntity[]
    const mapped = raw.map(toEntityType)
    for (const t of mapped) typeRegistry.register(t)
}
