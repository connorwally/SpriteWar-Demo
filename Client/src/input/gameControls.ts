import type { NetworkApi } from '@/network/types'
import { useSelectionStore } from './state/selectionStore'
import { useEntityStore } from '@/entities/state/entityStore'
import type { CameraControlsApi } from './cameraControls'
import { useAppStore } from '@/core/stores/app'
import { createMarquee as createMarquee } from './selection/marquee'
import type { ContainerApi, TilePos } from '@/core/types'
import { setupSelect } from './selection/select'
import type * as PIXI from 'pixi.js'
import { useBuildingStore } from './state/buildingStore'

export type GameControlsApi = {
    destroy: () => void
    handleCommand: (e: PointerEvent) => void
    startSelection: (tilePos: TilePos) => void
    updateSelection: (tilePos: TilePos) => void
    endSelection: (tilePos: TilePos, picked: PIXI.DisplayObject | null) => void
    setHoveringPosition: (display: PIXI.DisplayObject | null) => void
}

export function setupGameControls(
    network: NetworkApi,
    controls: CameraControlsApi,
    containers: ContainerApi
) {
    const selection = useSelectionStore()
    const building = useBuildingStore()
    const entities = useEntityStore()
    const marquee = createMarquee(containers.uiLayer)
    const select = setupSelect()

    function controlsEnabled() {
        return useAppStore().mode === 'gameplay'
    }

    const handleCommand = (e: PointerEvent) => {
        if (!controlsEnabled()) return

        // Cancel Building Placement
        if (building.isPlacingBuilding) {
            building.cancelBuildingPlacement()
            return
        }

        // Move / Attack logic
        const { tx, ty } = controls.getTileAt(e.clientX, e.clientY)
        const selectedIds = selection.selectedEntityIds
        if (selectedIds.length === 0) return

        // Check if targeting an enemy or friendly unit
        const allEntities = Array.from(entities.byId.values())
        const target = allEntities.find(
            (ent) => ent.pos?.tx === tx && ent.pos?.ty === ty && !selectedIds.includes(ent.id)
        )

        for (const id of selectedIds) {
            if (target) {
                network.sendTarget(id, target.id)
            } else {
                network.sendMove(id, tx, ty)
            }
        }
    }

    let startingPosition: TilePos = { tx: 0, ty: 0 }
    const startSelection = (tilePos: TilePos) => {
        startingPosition = tilePos
        marquee.startSelection(tilePos)
        select.startSelection(tilePos)
    }

    const updateSelection = (tilePos: TilePos) => {
        marquee.updateSelection(tilePos)
        select.updateSelection(tilePos)
    }

    const endSelection = (tilePos: TilePos, picked: PIXI.DisplayObject | null) => {
        marquee.clearSelection()

        if (startingPosition.tx === tilePos.tx && startingPosition.ty === tilePos.ty) {
            select.select(picked)
        } else {
            select.selectArea(startingPosition, tilePos)
        }
    }

    const setHoveringPosition = (display: PIXI.DisplayObject | null) => {
        select.setHoveringPosition(display)
    }

    const destroy = () => {
        marquee.destroy()
        select.destroy()
    }

    const gameControls: GameControlsApi = {
        destroy,
        handleCommand,
        startSelection,
        updateSelection,
        endSelection,
        setHoveringPosition,
    }

    return gameControls
}
