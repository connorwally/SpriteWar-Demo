import * as PIXI from 'pixi.js'
import { watch } from 'vue'
import { TILE_SIZE } from '@/core/config'
import type { ContainerApi, TilePos } from '@/core/types'
import type { CameraControlsApi } from './cameraControls'
import { useBuildingStore } from './state/buildingStore'
import type { EntityType } from '@/entities/types'

export type BuildingInputApi = {
    onPointerMove: (e: PointerEvent) => void
    onKeyDown: (e: KeyboardEvent) => void
    cancel: () => void
    destroy: () => void
}

function sizeOf(t: EntityType): { w: number; h: number } {
    return t.size ?? { w: 1, h: 1 }
}

function drawPreview(g: PIXI.Graphics, tile: TilePos, t: EntityType) {
    const s = sizeOf(t)
    const x = tile.tx * TILE_SIZE
    const y = tile.ty * TILE_SIZE
    const w = s.w * TILE_SIZE
    const h = s.h * TILE_SIZE

    g.clear()
    g.lineStyle(2, 0x00ff00, 0.8)
    g.beginFill(0x00ff00, 0.18)
    g.drawRect(x, y, w, h)
    g.endFill()
}

export function setupBuildingInput(
    containers: ContainerApi,
    cameraControls: CameraControlsApi
): BuildingInputApi {
    const building = useBuildingStore()

    const g = new PIXI.Graphics()
    g.visible = false
    containers.overlayLayer.addChild(g)

    let lastTile: TilePos | null = null

    const stopPlacingWatch = watch(
        () => building.isPlacingBuilding,
        (placing) => {
            g.visible = placing
            if (!placing) {
                g.clear()
                lastTile = null
            } else if (placing && lastTile && building.placingBuildingType) {
                drawPreview(g, lastTile, building.placingBuildingType)
            }
        },
        { immediate: true }
    )

    const stopTypeWatch = watch(
        () => building.placingBuildingType?.id ?? null,
        () => {
            if (building.isPlacingBuilding && lastTile && building.placingBuildingType) {
                drawPreview(g, lastTile, building.placingBuildingType)
            }
        }
    )

    const onPointerMove = (e: PointerEvent) => {
        if (!building.isPlacingBuilding || !building.placingBuildingType) return
        lastTile = cameraControls.getTileAt(e.clientX, e.clientY)
        drawPreview(g, lastTile, building.placingBuildingType)
    }

    const cancel = () => {
        if (building.isPlacingBuilding) building.cancelBuildingPlacement()
    }

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Escape') {
            cancel()
            e.preventDefault()
        }
    }

    const destroy = () => {
        stopPlacingWatch()
        stopTypeWatch()
        g.destroy()
    }

    return { onPointerMove, onKeyDown, cancel, destroy }
}
