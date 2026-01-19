import * as PIXI from 'pixi.js'
import { watch, type WatchStopHandle } from 'vue'
import { useEntityStore } from '@/entities/state/entityStore'
import type { TypeRegistryApi } from '@/entities/data/entityTypeRegistry'
import { TILE_SIZE } from '@/core/config'
import { OutlineFilter } from '@pixi/filter-outline'
import { useSelectionStore } from '@/input/state/selectionStore'

type Opts = {
    displays: Map<string, PIXI.DisplayObject>
    parent: PIXI.Container
}

export function setupHealthBars(opts: Opts & { typeRegistry: TypeRegistryApi }) {
    const { displays, parent, typeRegistry } = opts
    const store = useEntityStore()

    parent.sortableChildren = true

    const active = new Map<string, PIXI.Graphics>()
    let lastSelected: string[] = []
    let preview = new Set<string>()
    let lastHovered: string[] = []

    function maxHpFor(typeId: string): number {
        const t = typeRegistry.get(typeId)
        if (!t) return 100
        const unitHp = t.unit?.baseHP
        const buildingHp = t.building?.baseHP
        return unitHp ?? buildingHp ?? 100
    }

    function ensureHealthbar(id: string): PIXI.Graphics | null {
        const disp = displays.get(id) as any
        if (!disp) return null
        let g = active.get(id)
        if (!g) {
            g = new PIXI.Graphics()
            g.eventMode = 'none'
            g.zIndex = 10000
            parent.addChild(g)
            active.set(id, g)
        }
        return g
    }

    function drawHealthbar(id: string) {
        const e = store.byId.get(id)
        const disp = displays.get(id) as any
        const g = active.get(id)
        if (!e || !disp || !g) return

        const t = typeRegistry.get(e.typeId)
        const tilesW = t?.size?.w ?? 1
        const sideInset = 2
        const h = 2
        const margin = -1
        const w = Math.max(8, tilesW * TILE_SIZE - sideInset * 2)
        const x = sideInset
        const y = -h - margin

        const maxHp = maxHpFor(e.typeId)
        const curHp = Math.max(0, Math.min(e.hp ?? maxHp, maxHp))
        const pct = maxHp > 0 ? curHp / maxHp : 1

        g.clear()
        g.beginFill(0x171717, 1)
        g.drawRect(x, y, w, h)
        g.endFill()

        const color = pct > 0.5 ? 0x86ff00 : pct > 0.25 ? 0xfff673 : 0xbc4e4e
        g.beginFill(color, 1)
        g.drawRect(x, y, Math.max(0, Math.floor(w * pct)), h)
        g.endFill()

        const training = (e as any).training as
            | {
                  queue: string[]
                  currentTypeId?: string | null
                  ticksLeft: number
                  totalTicks: number
              }
            | undefined

        if (
            training &&
            training.totalTicks > 0 &&
            typeRegistry.get(e.typeId)?.category === 'building'
        ) {
            const trainPct = Math.max(
                0,
                Math.min(1, (training.totalTicks - training.ticksLeft) / training.totalTicks)
            )
            const trainH = 2
            const trainMargin = 2
            const ty2 = y + h + trainMargin

            // background
            g.beginFill(0x202040, 1)
            g.drawRect(x, ty2, w, trainH)
            g.endFill()

            // foreground
            g.beginFill(0x66aaff, 1)
            g.drawRect(x, ty2, Math.max(0, Math.floor(w * trainPct)), trainH)
            g.endFill()
        }

        g.position.set((disp as any).x ?? 0, (disp as any).y ?? 0)
    }

    function hideHealthbar(id: string) {
        const g = active.get(id)
        if (g && g.parent) g.parent.removeChild(g)
        if (g) g.destroy()
        outlined?.delete?.(id) // if you added the outline map earlier
        active.delete(id)
    }

    const outlined = new Map<string, OutlineFilter>()
    const outlineColor = 0xffffff
    const pixelWidth = 2
    const quality = 0.1
    function setOutline(id: string, on: boolean) {
        const g = active.get(id)
        if (!g) return
        if (on) {
            if (outlined.has(id)) return
            const f = new OutlineFilter(1, outlineColor, quality)
            f.thickness = pixelWidth
            f.padding = Math.ceil(pixelWidth) + 2
            g.filters = g.filters ? [...g.filters, f] : [f]
            outlined.set(id, f)
        } else {
            const f = outlined.get(id)
            if (!f) return
            g.filters = (g.filters ?? []).filter((x) => x !== f)
            if (!g.filters?.length) g.filters = null as any
            outlined.delete(id)
        }
    }

    function reconcile() {
        const selected = new Set<string>(lastSelected ?? [])
        const next = new Set<string>([...selected, ...preview, ...lastHovered])

        // remove bars no longer needed
        for (const id of Array.from(active.keys())) {
            if (!next.has(id)) hideHealthbar(id)
        }

        // ensure/draw bars; outline only when selected
        for (const id of next) {
            if (!active.has(id)) {
                const g = ensureHealthbar(id)
                if (!g) continue
            }
            setOutline(id, selected.has(id) || preview.has(id)) // selected → outlined; hovered-only → no outline
            drawHealthbar(id)
        }
    }

    const tick = () => {
        for (const [id, g] of active) {
            const disp = displays.get(id) as any
            if (!store.byId.has(id) || !disp) {
                hideHealthbar(id)
                continue
            }
            g.position.set(disp.x ?? 0, disp.y ?? 0)
        }
    }
    PIXI.Ticker.shared.add(tick)

    const stopSelectedWatch: WatchStopHandle = watch(
        () => useSelectionStore().selectedEntityIds,
        (selectedEntityIds) => {
            lastSelected = selectedEntityIds ?? []
            reconcile()
        },
        { immediate: true }
    )

    const stopPreviewWatch: WatchStopHandle = watch(
        () => useSelectionStore().previewEntityIds,
        (previewEntityIds) => {
            preview = new Set(previewEntityIds ?? [])
            reconcile()
        }
    )

    const stopHoveredWatch: WatchStopHandle = watch(
        () => useSelectionStore().hoveredEntityIds,
        (hoveredEntityIds) => {
            lastHovered = hoveredEntityIds ?? []
            reconcile()
        }
    )

    const stopActions = store.$onAction(({ name, args, after }) => {
        if (name === 'patch' || name === 'patchMany' || name === 'upsertMany') {
            after(() => {
                const changedIds =
                    name === 'patchMany'
                        ? (args[0] as Array<{ id: string }>).map((x) => x.id)
                        : name === 'upsertMany'
                          ? (args[0] as Array<{ id: string }>).map((x) => x.id)
                          : [(args[0] as { id: string }).id]
                for (const id of changedIds) {
                    if (active.has(id)) drawHealthbar(id)
                }
            })
        } else if (name === 'remove') {
            after(() => {
                const id = args[0] as string
                hideHealthbar(id)
            })
        } else if (name === 'clear') {
            after(() => {
                for (const id of Array.from(active.keys())) hideHealthbar(id)
            })
        }
    })

    const setPreviewIds = (ids: string[]) => {
        preview = new Set(ids ?? [])
        reconcile()
    }

    const destroy = () => {
        stopSelectedWatch()
        stopPreviewWatch()
        stopActions()
        stopHoveredWatch()
        PIXI.Ticker.shared.remove(tick)
        for (const id of Array.from(active.keys())) hideHealthbar(id)
        active.clear()
    }

    return { setPreviewIds, destroy }
}
