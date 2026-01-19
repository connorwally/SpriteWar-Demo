// Intended filename: src/view/selection/selection.ts
import * as PIXI from 'pixi.js'
import type { ContextAction } from '@/entities/contextActions'
import { useSessionStore } from '@/core/stores/session'
import type { SelectApi } from '@/input/selection/select'
import type { CameraApi } from '@/input/camera'
import type { MarqueeApi } from './marquee'

export type TypeRegistryLike = {
    get: (typeId: string) =>
        | {
              label?: string
              category?: 'unit' | 'building' | 'resource'
              size?: { w: number; h: number }
          }
        | undefined
}

export type EntitiesLike = {
    entitiesById: Map<string, any>
}

export type SelectionStoreLike = {
    clear: () => void
    setContext: (ent: any, label: string, actions: ContextAction[]) => void
    isPlacingBuilding?: boolean
    setGroups: (groups: any[]) => void
}

export type GetActionsFn = (ent: any, send: (cmd: any) => void) => ContextAction[]

type SetupInputOpts = {
    app: PIXI.Application
    camera: CameraApi
    entities: EntitiesLike
    selection: MarqueeApi
    selStore: SelectionStoreLike
    typeRegistry: TypeRegistryLike
    getActionsForEntityType: GetActionsFn
    send: (cmd: any) => void
    hotkeys?: {
        panHome?: { code: string; homeTx: number; homeTy: number; ms?: number }
    }
    displays?: Map<string, PIXI.DisplayObject>
}

// --- helpers ---------------------------------------------------------
function tileRectFromPoints(a: { tx: number; ty: number }, b: { tx: number; ty: number }) {
    const minTx = Math.min(a.tx, b.tx)
    const minTy = Math.min(a.ty, b.ty)
    const maxTx = Math.max(a.tx, b.tx)
    const maxTy = Math.max(a.ty, b.ty)
    return { minTx, minTy, maxTx, maxTy }
}

function getEntityBounds(ent: any, typeRegistry: TypeRegistryLike) {
    const tx = ent.tx ?? ent.pos?.tx ?? 0
    const ty = ent.ty ?? ent.pos?.ty ?? 0
    const size = typeRegistry.get(ent.typeId)?.size
    const w = ent.w ?? ent.size?.w ?? size?.w ?? 1
    const h = ent.h ?? ent.size?.h ?? size?.h ?? 1
    return { minTx: tx, minTy: ty, maxTx: tx + w - 1, maxTy: ty + h - 1 }
}

function entitiesInRect(
    entities: EntitiesLike,
    rect: { minTx: number; minTy: number; maxTx: number; maxTy: number },
    typeRegistry: TypeRegistryLike
) {
    const out: any[] = []
    for (const ent of entities.entitiesById.values()) {
        const b = getEntityBounds(ent, typeRegistry)
        const overl =
            b.minTx <= rect.maxTx &&
            b.maxTx >= rect.minTx &&
            b.minTy <= rect.maxTy &&
            b.maxTy >= rect.minTy
        if (overl) out.push(ent)
    }
    return out
}

function labelForEntity(ent: any, typeRegistry: TypeRegistryLike) {
    return typeRegistry.get(ent.typeId)?.label ?? ent.typeId ?? 'Unknown'
}

function isFriendlyUnit(ent: any, typeRegistry: TypeRegistryLike, playerId: string | null) {
    const t = typeRegistry.get(ent.typeId)
    if (t?.category !== 'unit') return false
    if (playerId == null) return true
    return ent.ownerId === playerId
}

// --- main ------------------------------------------------------------
export function setupSelection(opts: SetupInputOpts) {
    const {
        app,
        camera,
        entities,
        selection,
        selStore,
        typeRegistry,
        getActionsForEntityType,
        send,
    } = opts

    const session = useSessionStore()

    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen

    let isPointerDown = false
    let dragStarted = false
    let downSX = 0
    let downSY = 0
    let anchorTile = { tx: 0, ty: 0 }
    let lastRect: { minTx: number; minTy: number; maxTx: number; maxTy: number } | null = null

    const dragPxThreshold = 16

    function screenToTile(sx: number, sy: number) {
        const w = camera.screenToWorld(sx, sy)
        return camera.worldToTile(w.x, w.y)
    }

    const toScreen = (ev: PIXI.FederatedPointerEvent) => {
        const view = app.view as unknown as HTMLCanvasElement
        const rect = view.getBoundingClientRect()
        return { sx: ev.clientX - rect.left, sy: ev.clientY - rect.top }
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

    const onStagePointerDown = (ev: PIXI.FederatedPointerEvent) => {
        if ((selStore as any)?.isPlacingBuilding) return
        if (ev.button !== 0) return // left only
        const { sx, sy } = toScreen(ev)
        downSX = sx
        downSY = sy
        anchorTile = screenToTile(sx, sy)
        isPointerDown = true
        dragStarted = false
        lastRect = null
        selection.clearSelection()
    }

    const onStagePointerMove = (ev: PIXI.FederatedPointerEvent) => {
        if (!isPointerDown) {
            const gx = (ev as any).global?.x ?? toScreen(ev).sx
            const gy = (ev as any).global?.y ?? toScreen(ev).sy
            const hoveredId = pickFromDisplays(opts.displays, gx, gy)
            return
        }
        if ((ev.buttons & 1) === 0) return

        const { sx, sy } = toScreen(ev)

        if (!dragStarted) {
            const dx = sx - downSX
            const dy = sy - downSY
            if (dx * dx + dy * dy < dragPxThreshold * dragPxThreshold) return
            dragStarted = true
            // 👇 hide any previous single-tile highlight once marquee begins
            selection.clearSelection?.()
        }

        const curTile = screenToTile(sx, sy)
        const r = tileRectFromPoints(anchorTile, curTile)
        if (
            lastRect &&
            r.minTx === lastRect.minTx &&
            r.minTy === lastRect.minTy &&
            r.maxTx === lastRect.maxTx &&
            r.maxTy === lastRect.maxTy
        )
            return

        lastRect = r
        if (selection.drawMarquee) selection.drawMarquee(r)

        const ents = entitiesInRect(entities, r, typeRegistry)
        const friendlyUnits = ents.filter((e) => isFriendlyUnit(e, typeRegistry, session.playerId))
        selection.setPreviewOutlines?.(friendlyUnits.map((e) => e.id))
    }

    const finishPointer = (ev: PIXI.FederatedPointerEvent) => {
        if ((selStore as any)?.isPlacingBuilding) return
        if (ev.type === 'pointerup' && ev.button !== 0) return
        const { sx, sy } = toScreen(ev)
        if (selection.drawMarquee) selection.drawMarquee(null)

        // Click
        if (!dragStarted) {
            const { tx, ty } = screenToTile(sx, sy)

            const targetId: string | undefined = (ev.target as any)?.__entityId

            const gx = (ev as any).global?.x ?? sx
            const gy = (ev as any).global?.y ?? sy
            const pickedId = targetId ?? pickFromDisplays(opts.displays, gx, gy)

            if (pickedId) {
                const ent = entities.entitiesById.get(pickedId)
                if (ent) {
                    selStore.setContext(
                        ent,
                        labelForEntity(ent, typeRegistry),
                        getActionsForEntityType(ent, send)
                    )
                } else {
                    selStore.clear()
                    selection.setPreviewOutlines?.([])
                }
            } else {
                const hits = entitiesInRect(
                    entities,
                    { minTx: tx, minTy: ty, maxTx: tx, maxTy: ty },
                    typeRegistry
                )
                if (hits.length > 0) {
                    const ent = hits[0]
                    selStore.setContext(
                        ent,
                        labelForEntity(ent, typeRegistry),
                        getActionsForEntityType(ent, send)
                    )
                } else {
                    selStore.clear()
                }
            }

            selection.setPreviewHealthbars?.([])
            isPointerDown = false
            lastRect = null
            return
        }

        // Drag
        const curTile = screenToTile(sx, sy)
        const r = tileRectFromPoints(anchorTile, curTile)
        const ents = entitiesInRect(entities, r, typeRegistry)
        const friendlyUnits = ents.filter((e) => isFriendlyUnit(e, typeRegistry, session.playerId))

        if (friendlyUnits.length === 0) {
            selStore.clear()
            selection.setPreviewOutlines?.([])
            isPointerDown = false
            lastRect = null
            return
        }

        const byType = new Map<string, any[]>()
        for (const u of friendlyUnits) {
            const key = u.typeId ?? 'unknown'
            const arr = byType.get(key)
            if (arr) arr.push(u)
            else byType.set(key, [u])
        }

        const groups = Array.from(byType.entries()).map(([typeId, units]) => {
            const first = units[0]
            const baseLabel = labelForEntity(first, typeRegistry)
            const count = units.length
            const label = count === 1 ? baseLabel : `${count}x ${baseLabel}`
            const actions = getActionsForEntityType(first, send)
            const memberIds = units.map((e: any) => e.id ?? e.__id ?? e)
            return { typeId, label, count, memberIds, actions }
        })

        const totalCount = friendlyUnits.length
        const primary = groups[0]
        const allMemberIds = friendlyUnits.map((e: any) => e.id ?? e.__id ?? e).filter(Boolean)

        const groupEnt = {
            typeId: primary.typeId,
            members: allMemberIds,
            rect: r,
        }

        const overallLabel = groups.length > 1 ? `${totalCount}x Units` : primary.label

        selStore.setContext(groupEnt, overallLabel, primary.actions)
        selStore.setGroups?.(groups)

        // Clear drag preview outlines/healthbars now that selection is finalized
        selection.setPreviewOutlines?.([])
        selection.setPreviewHealthbars?.([])

        isPointerDown = false
        lastRect = null
    }

    const onStagePointerUp = (ev: PIXI.FederatedPointerEvent) => finishPointer(ev)
    const onStagePointerUpOutside = (_ev: PIXI.FederatedPointerEvent) => {
        if (selection.drawMarquee) selection.drawMarquee(null)
        selection.setPreviewOutlines?.([])
        selection.setPreviewHealthbars?.([])
        isPointerDown = false
        lastRect = null
    }

    app.stage.on('pointerdown', onStagePointerDown)
    app.stage.on('pointermove', onStagePointerMove)
    app.stage.on('pointerup', onStagePointerUp)
    app.stage.on('pointerupoutside', onStagePointerUpOutside)

    function destroy() {
        app.stage.off('pointerdown', onStagePointerDown)
        app.stage.off('pointermove', onStagePointerMove)
        app.stage.off('pointerup', onStagePointerUp)
        app.stage.off('pointerupoutside', onStagePointerUpOutside)
    }

    return { destroy }
}
