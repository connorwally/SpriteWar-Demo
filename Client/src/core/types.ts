// ------------------ GENERAL TYPES ------------------ //

import type { Entity } from '../entities/types'

export interface TilePos {
    tx: number
    ty: number
}

// ------------------ PLAYER ------------------ //
export type PlayerId = string
export type ResourceKind = 'wood' | 'food' | 'gold' | 'stone'

export interface PlayerSnapshot {
    id: PlayerId
    resources: Record<ResourceKind, number>
    homeTile?: TilePos
    popUsed?: number
    popCap?: number
}

export interface ResourceDelta {
    kind: ResourceKind
    amount: number
}

export interface WorldBorder {
    minX: number
    minY: number
    maxX: number
    maxY: number
}

// ------------------ NETWORKING ------------------ //
export type ServerMessage =
    | {
          t: 'start'
          player: PlayerSnapshot
          entities: Entity[]
          terrainSeed: number
          worldBorder: WorldBorder
      }
    | { t: 'resource_update'; resources: Record<ResourceKind, number> }
    | { t: 'entity_snapshot'; entities: Entity[] }
    | { t: 'entity_add'; entities: Entity[] }
    | { t: 'entity_patch'; changes: Partial<Entity> & { id: string } }
    | { t: 'entity_remove'; entityIds: string[] }
    | { t: 'tick'; ts: number }
    | { t: 'error'; reason: string }
    | { t: 'attack'; attackerId: string; targetId: string; damage?: number }
    | { t: 'population_update'; popUsed: number; popCap: number }
    | {
          t: 'training_queue'
          buildingId: string
          queue: string[]
          currentTypeId?: string | null
          ticksLeft: number
          totalTicks: number
      }

// ------------------ PIXI CONTAINERS ------------------ //
import type * as PIXI from 'pixi.js'
export type ContainerApi = {
    gridContainer: PIXI.Container // Parent container - camera etc.
    terrainLayer: PIXI.Container
    buildingsLayer: PIXI.Container
    unitsLayer: PIXI.Container
    resourcesLayer: PIXI.Container
    fogLayer: PIXI.Container
    overlayLayer: PIXI.Container
    uiLayer: PIXI.Container
    destroy: () => void
}
