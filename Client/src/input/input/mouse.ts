import * as PIXI from 'pixi.js'
import { useAppStore } from '@/core/stores/app'
import { GameHotkeys, matchesInput } from '../hotkeys'
import type { NetworkApi } from '@/network/types'
import type { CameraControlsApi } from '../cameraControls'
import type { GameControlsApi } from '../gameControls'
import type { EntityApi } from '@/entities/types'
import { useBuildingStore } from '../state/buildingStore'
import type { BuildingInputApi } from '../building'
import type { TilePos } from '@/core/types'

function toCanvasXY(e: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function pickFromDisplays(
    displays: Map<string, PIXI.DisplayObject> | undefined,
    gx: number,
    gy: number
): string | undefined {
    if (!displays) return undefined
    let bestId: string | undefined
    let bestZ = -Infinity
    for (const [id, disp] of displays) {
        const bounds = (disp as any).getBounds?.()
        if (bounds && bounds.contains(gx, gy)) {
            const z = (disp as any).zIndex ?? 0
            if (z > bestZ) {
                bestZ = z
                bestId = id
            }
        }
    }
    return bestId
}

export function setupMouseManager(
    app: PIXI.Application,
    network: NetworkApi,
    cameraControls: CameraControlsApi,
    gameControls: GameControlsApi,
    entities: EntityApi,
    buildingInput: BuildingInputApi
) {
    const canvas = app.view as unknown as HTMLCanvasElement
    const building = useBuildingStore()
    const appStore = useAppStore()

    const DRAG_SELECT_THRESHOLD = 32

    let panning = false // Middle mouse drag
    let selecting = false // Left mouse drag
    let dragSelecting = false
    let selectDownClientX = 0
    let selectDownClientY = 0
    let selectDownTilePos: TilePos | null = null

    function controlsEnabled() {
        return useAppStore().mode === 'gameplay'
    }

    const onPointerDown = (e: PointerEvent) => {
        if (appStore.mode !== 'gameplay') return

        if (matchesInput(e, GameHotkeys.Select)) {
            // Handle Building
            if (building.isPlacingBuilding && building.placingBuildingType) {
                const { tx, ty } = cameraControls.getTileAt(e.clientX, e.clientY)
                network.sendBuild(building.placingBuildingType.id, tx, ty)
                return
            }
            selecting = true
            dragSelecting = false
            selectDownClientX = e.clientX
            selectDownClientY = e.clientY
            selectDownTilePos = cameraControls.getTileAt(e.clientX, e.clientY)
        } else if (matchesInput(e, GameHotkeys.Command)) {
            // Prevent default browser context menu for command clicks
            e.preventDefault()
            gameControls.handleCommand(e)
        } else if (matchesInput(e, GameHotkeys.Pan)) {
            panning = true
            cameraControls.beginDragPan(e.pointerId, e.clientX, e.clientY)
        }
    }

    const onPointerMove = (e: PointerEvent) => {
        if (!controlsEnabled()) return

        cameraControls.updateEdgePanFromClient(e.clientX, e.clientY, e.target === canvas)
        cameraControls.setMouseAnchorScreen(e.clientX, e.clientY)

        const tilePos = cameraControls.getTileAt(e.clientX, e.clientY)
        buildingInput?.onPointerMove(e)

        const { x, y } = toCanvasXY(e, canvas)
        const picked = pickFromDisplays(entities.displays, x, y)
        gameControls.setHoveringPosition(picked ? (entities.displays.get(picked) ?? null) : null)

        if (panning) cameraControls.updateDragPan(e.pointerId, e.clientX, e.clientY)

        if (selecting) {
            if (!dragSelecting) {
                const dx = e.clientX - selectDownClientX
                const dy = e.clientY - selectDownClientY
                if (dx * dx + dy * dy >= DRAG_SELECT_THRESHOLD * DRAG_SELECT_THRESHOLD) {
                    dragSelecting = true
                    if (selectDownTilePos) gameControls.startSelection(selectDownTilePos)
                } else {
                    // Under threshold: don't start drag selection yet.
                    return
                }
            }
            gameControls.updateSelection(tilePos)
        }
    }

    const onPointerUp = (e: PointerEvent) => {
        if (!controlsEnabled()) return

        if (panning) {
            cameraControls.endDragPan(e.pointerId)
            panning = false
        }

        if (!selecting) return

        const tilePos = cameraControls.getTileAt(e.clientX, e.clientY)
        const { x, y } = toCanvasXY(e, canvas)
        const pickedId = pickFromDisplays(entities.displays, x, y)
        const pickedDisp = pickedId ? (entities.displays.get(pickedId) ?? null) : null

        if (dragSelecting) {
            gameControls.endSelection(tilePos, pickedDisp)
        } else {
            // Treat as click: start+end at same tile so endSelection does single-select
            gameControls.startSelection(tilePos)
            gameControls.endSelection(tilePos, pickedDisp)
        }

        selecting = false
        dragSelecting = false
        selectDownTilePos = null
    }

    const onPointerCancel = (e: PointerEvent) => {
        if (!controlsEnabled()) return

        if (panning) {
            cameraControls.cancelDragPan()
            panning = false
        }

        // Cancel selection without committing a click/drag selection.
        selecting = false
        dragSelecting = false
        selectDownTilePos = null
    }

    const onWheel = (e: WheelEvent) => {
        if (!controlsEnabled() || panning) return
        e.preventDefault()

        cameraControls.onWheel(e.deltaY)
    }

    const onMouseOut = (_e: MouseEvent) => {
        cameraControls.clearEdgePan()
    }

    const onContextMenu = (e: MouseEvent) => {
        // Always prevent context menu in gameplay
        if (appStore.mode === 'gameplay') {
            e.preventDefault()
        }
    }

    // --- Setup ---
    canvas.addEventListener('pointerdown', onPointerDown as any)
    canvas.addEventListener('contextmenu', onContextMenu as any)
    canvas.addEventListener('pointermove', onPointerMove as any)
    canvas.addEventListener('pointerup', onPointerUp as any)
    canvas.addEventListener('pointercancel', onPointerCancel as any)
    canvas.addEventListener('mouseout', onMouseOut)
    canvas.addEventListener('wheel', onWheel as any, { passive: false })

    const destroy = () => {
        canvas.removeEventListener('pointerdown', onPointerDown as any)
        canvas.removeEventListener('contextmenu', onContextMenu)
        canvas.removeEventListener('pointerup', onPointerUp as any)
        canvas.removeEventListener('pointercancel', onPointerCancel as any)
        canvas.removeEventListener('pointermove', onPointerMove as any)
        canvas.removeEventListener('mouseout', onMouseOut)
        canvas.removeEventListener('wheel', onWheel as any)
    }

    return { destroy }
}
