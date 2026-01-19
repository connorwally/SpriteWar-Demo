import type { TilePos } from '@/core/types'
import { useEntityStore } from '@/entities/state/entityStore'
import type { Entity } from '@/entities/types'
import { typeRegistry, type TypeRegistryApi } from '@/entities/data/entityTypeRegistry'
import { useSessionStore } from '@/core/stores/session'
import { useSelectionStore } from '../state/selectionStore'
import type * as PIXI from 'pixi.js'

export type SelectApi = {
    startSelection: (tilePos: TilePos) => void
    updateSelection: (tilePos: TilePos) => void
    selectArea: (startTilePos: TilePos, endTilePos: TilePos) => void
    select: (display: PIXI.DisplayObject | null) => void
    setHoveringPosition: (display: PIXI.DisplayObject | null) => void
    destroy: () => void
}

function entitiesInRect(
    rect: { minTile: TilePos; maxTile: TilePos },
    typeRegistry: TypeRegistryApi
) {
    const out: Entity[] = []
    for (const entity of useEntityStore().byId.values()) {
        const b = getEntityBounds(entity, typeRegistry)
        const overl =
            b.minTile.tx <= rect.maxTile.tx &&
            b.maxTile.tx >= rect.minTile.tx &&
            b.minTile.ty <= rect.maxTile.ty &&
            b.maxTile.ty >= rect.minTile.ty
        if (overl) out.push(entity)
    }
    return out
}

function getEntityBounds(entity: Entity, typeRegistry: TypeRegistryApi) {
    const tx = entity.pos?.tx ?? 0
    const ty = entity.pos?.ty ?? 0
    const size = typeRegistry.get(entity.typeId)?.size
    const w = size?.w ?? 1
    const h = size?.h ?? 1
    return { minTile: { tx, ty }, maxTile: { tx: tx + w - 1, ty: ty + h - 1 } }
}

function isFriendlyUnit(entity: Entity, typeRegistry: TypeRegistryApi, playerId: string | null) {
    const t = typeRegistry.get(entity.typeId)
    if (t?.category !== 'unit') return false
    if (playerId == null) return true
    return entity.ownerId === playerId
}

export function setupSelect(): SelectApi {
    let startingPosition: TilePos = { tx: 0, ty: 0 }
    const selectionStore = useSelectionStore()

    const startSelection = (tilePos: TilePos) => {
        startingPosition = tilePos
        selectionStore.clearSelectedEntityIds()
        selectionStore.clearPreviewEntityIds()
        selectionStore.clearHoveredEntityIds()
    }
    const updateSelection = (tilePos: TilePos) => {
        const minTile = {
            tx: Math.min(startingPosition.tx, tilePos.tx),
            ty: Math.min(startingPosition.ty, tilePos.ty),
        }
        const maxTile = {
            tx: Math.max(startingPosition.tx, tilePos.tx),
            ty: Math.max(startingPosition.ty, tilePos.ty),
        }
        const entities = entitiesInRect({ minTile, maxTile }, typeRegistry)
        const friendlyEntities = entities.filter((e) =>
            isFriendlyUnit(e, typeRegistry, useSessionStore().playerId)
        )
        selectionStore.setPreviewEntityIds(friendlyEntities.map((e) => e.id))
    }
    const selectArea = (startTilePos: TilePos, endTilePos: TilePos) => {
        const minTile = {
            tx: Math.min(startTilePos.tx, endTilePos.tx),
            ty: Math.min(startTilePos.ty, endTilePos.ty),
        }
        const maxTile = {
            tx: Math.max(startTilePos.tx, endTilePos.tx),
            ty: Math.max(startTilePos.ty, endTilePos.ty),
        }
        const entities = entitiesInRect({ minTile, maxTile }, typeRegistry)
        const friendlyEntities = entities.filter((e) =>
            isFriendlyUnit(e, typeRegistry, useSessionStore().playerId)
        )
        selectionStore.setSelectedEntityIds(friendlyEntities.map((e) => e.id))
        selectionStore.clearPreviewEntityIds()
    }
    const select = (display: PIXI.DisplayObject | null) => {
        selectionStore.clearSelectedEntityIds()
        selectionStore.clearHoveredEntityIds()
        selectionStore.clearPreviewEntityIds()
        if (!display) return

        const id = (display as any).__entityId as string | undefined

        if (id) {
            selectionStore.setSelectedEntityIds([id])
        } else {
            selectionStore.clearSelectedEntityIds()
        }
    }

    const setHoveringPosition = (display: PIXI.DisplayObject | null) => {
        if (!display) {
            selectionStore.clearHoveredEntityIds()
            return
        }
        const id = (display as any).__entityId as string | undefined
        if (id) {
            selectionStore.setHoveredEntityIds([id])
        } else {
            selectionStore.clearHoveredEntityIds()
        }
    }

    const destroy = () => {
        startingPosition = { tx: 0, ty: 0 }
        selectionStore.clearPreviewEntityIds()
        selectionStore.clearSelectedEntityIds()
    }

    const selectApi: SelectApi = {
        startSelection,
        updateSelection,
        selectArea,
        select,
        setHoveringPosition,
        destroy,
    }
    return selectApi
}
