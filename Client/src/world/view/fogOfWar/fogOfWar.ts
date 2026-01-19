import * as PIXI from 'pixi.js'
import { TILE_SIZE } from '@/core/config'
import { useDiscoveryStore } from '@/world/stores/fogOfWar/discoveredStore'
import { createUnexploredOverlay } from '@/world/view/fogOfWar/fogOfWarUnexplored'

export type FogOfWarConfig = {
    chunkSize: number
    darkenAlpha: number
    unexploredAlpha?: number
    transitionSpeed: number
}

export type CameraApi = {
    screenToWorld: (sx: number, sy: number) => { x: number; y: number }
    worldToTile: (wx: number, wy: number) => { tx: number; ty: number }
}

export type ChunkCoords = { cx: number; cy: number }

type VisionCircle = { tx: number; ty: number; r: number }

export function createFogOfWar(
    app: PIXI.Application,
    parentContainer: PIXI.Container,
    camera: CameraApi,
    config: FogOfWarConfig = {
        chunkSize: 16,
        darkenAlpha: 0.4,
        unexploredAlpha: 0.1,
        transitionSpeed: 0.1,
    }
) {
    const { darkenAlpha } = config

    // Track which chunks the player has visibility in
    let circles: VisionCircle[] = []
    const fog = new PIXI.Graphics()

    const holes = new PIXI.Graphics()
    holes.blendMode = PIXI.BLEND_MODES.ERASE

    // Create fog layer
    const fogLayer = new PIXI.Container()
    fogLayer.addChild(fog)
    fogLayer.addChild(holes) // add this line
    fogLayer.filters = [new PIXI.filters.AlphaFilter()] // ensure ERASE works
    parentContainer.addChild(fogLayer)

    const discovery = useDiscoveryStore()
    const unexploredOverlay = createUnexploredOverlay({
        app,
        parent: fogLayer,
        camera,
        chunkSize: config.chunkSize,
        alpha: config.unexploredAlpha ?? 0.92,
        isDiscovered: discovery.isDiscovered,
        options: {
            bakesPerFrame: 3,
            maxConcurrentBakes: 1,
            maxCachedChunks: 256,
            aheadWeight: 0.25,
            attachTicker: true,
        },
    })

    function updateFogVisibility() {
        // World-space viewport bounds
        const tl = camera.screenToWorld(0, 0)
        const br = camera.screenToWorld(app.screen.width, app.screen.height)
        const minWx = Math.min(tl.x, br.x)
        const minWy = Math.min(tl.y, br.y)
        const width = Math.abs(br.x - tl.x)
        const height = Math.abs(br.y - tl.y)

        // Draw solid fog (black overlay)
        fog.clear()
        fog.beginFill(0x000000, darkenAlpha)
        fog.drawRect(minWx, minWy, width, height)
        fog.endFill()

        let changedChunks: Set<string> | null = null
        for (const c of circles) {
            const changed = discovery.markDiscoveredCircle(c.tx, c.ty, c.r)
            if (changed && changed.size) {
                if (!changedChunks) changedChunks = new Set()
                for (const k of changed) changedChunks.add(k)
            }
        }
        if (changedChunks) {
            for (const k of changedChunks) unexploredOverlay.invalidateChunkKey(k)
        }

        // Punch holes as tile-aligned rectangles
        holes.clear()
        holes.beginFill(0xffffff, 1)

        // Compute visible tile bounds for a small cull
        const tlTile = camera.worldToTile(minWx, minWy)
        const brTile = camera.worldToTile(minWx + width, minWy + height)
        const viewMinTx = Math.min(tlTile.tx, brTile.tx) - 1
        const viewMaxTx = Math.max(tlTile.tx, brTile.tx) + 1
        const viewMinTy = Math.min(tlTile.ty, brTile.ty) - 1
        const viewMaxTy = Math.max(tlTile.ty, brTile.ty) + 1

        unexploredOverlay.updateVisible()

        for (const c of circles) {
            const cx = c.tx
            const cy = c.ty
            const r = c.r

            const minTy = Math.floor(cy - r)
            const maxTy = Math.ceil(cy + r)

            const r2 = (r - 1e-3) * (r - 1e-3) // tiny shrink to match your previous edge behavior

            for (let ty = minTy; ty <= maxTy; ty++) {
                if (ty < viewMinTy || ty > viewMaxTy) continue

                const dy = Math.abs(ty - cy)
                const yTerm = (dy + 0.5) * (dy + 0.5)
                if (yTerm > r2) continue

                const maxDx = Math.sqrt(r2 - yTerm) - 0.5
                if (maxDx <= 0) continue

                let left = Math.ceil(cx - maxDx)
                let right = Math.floor(cx + maxDx)

                if (right < viewMinTx || left > viewMaxTx) continue
                if (left < viewMinTx) left = viewMinTx
                if (right > viewMaxTx) right = viewMaxTx
                if (left > right) continue

                holes.drawRect(
                    left * TILE_SIZE,
                    ty * TILE_SIZE,
                    (right - left + 1) * TILE_SIZE,
                    TILE_SIZE
                )
            }
        }
        holes.endFill()
    }

    // Update fog every frame
    app.ticker.add(updateFogVisibility)

    return {
        updateVisibilityForCircles(newCircles: VisionCircle[]) {
            circles = newCircles ?? []
            // optional: debounce; the per-frame ticker will redraw
        },

        forceUpdate: updateFogVisibility,

        destroy() {
            app.ticker.remove(updateFogVisibility)
            fog.destroy()
            unexploredOverlay.destroy()
            fogLayer.destroy({ children: true })
        },
    }
}
