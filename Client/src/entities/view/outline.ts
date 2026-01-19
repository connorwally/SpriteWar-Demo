import * as PIXI from 'pixi.js'
import { OutlineFilter } from '@pixi/filter-outline'
import { watch, type WatchStopHandle } from 'vue'
import type { CameraApi } from '@/input/camera'
import { useSelectionStore } from '@/input/state/selectionStore'

type Opts = {
    displays: Map<string, PIXI.DisplayObject>
    color?: number
    pixelWidth?: number
    quality?: number
}

// Sets up outlines for entities using OutlineFilter - no separate container is needed
export function setupSelectionOutlines(opts: Opts & { camera: CameraApi & { scale: number } }) {
    const { displays } = opts
    const color = opts.color ?? 0xffff00
    const pixelWidth = Math.max(1, Math.floor(opts.pixelWidth ?? 2))
    const quality = opts.quality ?? 0.1

    const active = new Map<string, OutlineFilter>()
    let lastSelected: string[] = []
    let preview = new Set<string>()

    const setOutlineFor = (id: string, on: boolean) => {
        const disp = displays.get(id)
        if (!disp) return
        const filters = (disp as any).filters as PIXI.Filter[] | null
        if (on) {
            if (active.has(id)) return
            const f = new OutlineFilter(1, color, quality)
            f.thickness = pixelWidth
            f.padding = Math.ceil(pixelWidth) + 2
            ;(disp as any).filters = filters ? [...filters, f] : [f]
            active.set(id, f)
        } else {
            const f = active.get(id)
            if (!f) return
            const next = (filters ?? []).filter((x) => x !== f)
            ;(disp as any).filters = next.length ? next : null
            active.delete(id)
        }
    }

    const reconcile = () => {
        const next = new Set<string>([...lastSelected, ...preview])
        for (const id of Array.from(active.keys())) {
            if (!next.has(id)) setOutlineFor(id, false)
        }
        for (const id of next) {
            if (!active.has(id)) setOutlineFor(id, true)
        }
        updateThickness()
    }

    const updateThickness = () => {
        for (const f of active.values()) {
            f.thickness = pixelWidth
            f.padding = Math.ceil(pixelWidth) + 2
        }
    }

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
        },
        { immediate: true }
    )

    const setPreviewIds = (ids: string[]) => {
        preview = new Set(ids ?? [])
        reconcile()
    }

    const destroy = () => {
        stopSelectedWatch()
        stopPreviewWatch()
        setPreviewIds([])
        for (const id of Array.from(active.keys())) setOutlineFor(id, false)
        active.clear()
    }

    return { destroy, setPreviewIds }
}
