import type { TilePos } from '@/core/types'
import type * as PIXI from 'pixi.js'

export type EntityCategory = 'unit' | 'building' | 'resource'

export type ResourceKind = 'wood' | 'food' | 'gold' | 'stone'

export type ActionId = 'move' | 'train' | 'open_resource_panel' | 'destroy_building' | 'build'

export type VisualDef = {
    spriteId: string
    atlas: string
    frame?: string
    tag?: string
    z?: number
}

export type UnitStats = {
    moveSpeed: number
    attackRange?: number
    baseHP?: number
    attackDamage?: number
    viewRange?: number
}

export type BuildingStats = {
    baseHP: number
    popProvided?: number
    cost?: Cost
    attackRange?: number
    attackDamage?: number
    viewRange?: number
}

export type UIInfo = {
    icon?: string
}

export type Cost = Partial<Record<ResourceKind, number>>

export type TrainingQueueState = {
    queue: string[]
    currentTypeId?: string | null
    ticksLeft: number
    totalTicks: number
}

export type ActionDescriptor =
    | { id: 'move' }
    | { id: 'train'; units: string[] }
    | { id: 'build'; buildings: string[] }

export type EntityType = {
    id: string
    label: string
    category: EntityCategory
    visual: VisualDef
    unit?: UnitStats
    size?: { w: number; h: number }
    building?: BuildingStats
    actions?: ActionDescriptor[]
    ui?: UIInfo
}

export type EntityId = string
export type Entity = {
    id: EntityId
    typeId: string
    ownerId: string
    pos: TilePos
    hp?: number
    training?: TrainingQueueState
}

export type EntityApi = {
    displays: Map<string, PIXI.DisplayObject>
    destroy: () => void
}
