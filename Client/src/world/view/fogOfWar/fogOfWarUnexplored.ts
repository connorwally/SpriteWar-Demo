import * as PIXI from 'pixi.js'
import { TILE_SIZE } from '@/core/config'

export type UnexploredOptions = {
    bakesPerFrame?: number
    maxConcurrentBakes?: number
    maxCachedChunks?: number
    aheadWeight?: number
    attachTicker?: boolean
}

export function createUnexploredOverlay(opts: {
    app: PIXI.Application
    parent: PIXI.Container
    camera: { screenToWorld: (sx: number, sy: number) => { x: number; y: number } }
    chunkSize: number
    alpha: number
    isDiscovered: (tx: number, ty: number) => boolean
    options?: UnexploredOptions
}) {
    const { app, parent, camera, chunkSize, alpha, isDiscovered } = opts
    const o = opts.options ?? {}
    const CHUNK_PX = chunkSize * TILE_SIZE

    const BAKES_PER_FRAME = Math.max(1, o.bakesPerFrame ?? 2)
    const MAX_CONCURRENT = Math.max(1, o.maxConcurrentBakes ?? 1)
    const MAX_CACHE = Math.max(64, o.maxCachedChunks ?? 256)
    const AHEAD_WEIGHT = Number.isFinite(o.aheadWeight) ? (o.aheadWeight as number) : 0.25
    const ATTACH_TICKER = o.attachTicker ?? true

    const layer = new PIXI.Container()
    parent.addChild(layer)

    const chunkSprites = new Map<string, PIXI.Sprite>()
    const rtCache = new Map<string, PIXI.RenderTexture>()
    const touchOrder: string[] = []

    const stale = new Set<string>()

    const WHITE = PIXI.Texture.WHITE

    const key = (cx: number, cy: number) => `${cx},${cy}`

    function useKey(k: string) {
        if (!rtCache.has(k)) return
        const i = touchOrder.indexOf(k)
        if (i >= 0) touchOrder.splice(i, 1)
        touchOrder.push(k)
        evictIfNeeded()
    }

    function evictIfNeeded() {
        while (touchOrder.length > MAX_CACHE) {
            // evict the oldest that is not currently on-screen
            while (touchOrder.length && !rtCache.has(touchOrder[0])) touchOrder.shift()
            const victimIndex = touchOrder.findIndex((k) => !chunkSprites.has(k))
            if (victimIndex === -1) break
            const oldKey = touchOrder.splice(victimIndex, 1)[0]
            const rt = rtCache.get(oldKey)
            if (rt) {
                rt.destroy(true)
                rtCache.delete(oldKey)
            }
        }
    }

    function spawnSpriteFromRT(k: string, cx: number, cy: number, rt: PIXI.RenderTexture) {
        if (chunkSprites.has(k)) return
        const spr = new PIXI.Sprite(rt)
        spr.x = cx * CHUNK_PX
        spr.y = cy * CHUNK_PX
        spr.alpha = alpha
        chunkSprites.set(k, spr)
        layer.addChild(spr)
    }

    // camera velocity (for ahead weighting)
    let lastCenter = camera.screenToWorld(app.screen.width * 0.5, app.screen.height * 0.5)
    let vel = { x: 0, y: 0 }
    function updateVelocity(newCenter: { x: number; y: number }) {
        vel.x = newCenter.x - lastCenter.x
        vel.y = newCenter.y - lastCenter.y
        lastCenter = newCenter
    }

    function worldChunkBounds() {
        const tl = camera.screenToWorld(0, 0)
        const br = camera.screenToWorld(app.screen.width, app.screen.height)
        const minx = Math.min(tl.x, br.x),
            maxx = Math.max(tl.x, br.x)
        const miny = Math.min(tl.y, br.y),
            maxy = Math.max(tl.y, br.y)
        const minCx = Math.floor(minx / CHUNK_PX) - 1
        const maxCx = Math.floor(maxx / CHUNK_PX) + 1
        const minCy = Math.floor(miny / CHUNK_PX) - 1
        const maxCy = Math.floor(maxy / CHUNK_PX) + 1
        return { minCx, maxCx, minCy, maxCy }
    }

    // incremental baker (row-by-row)
    function bakeChunkTextureIncremental(
        cx: number,
        cy: number,
        onDone: (rt: PIXI.RenderTexture) => void
    ) {
        const k = key(cx, cy)
        const exist = rtCache.get(k)
        if (exist) {
            useKey(k)
            spawnSpriteFromRT(k, cx, cy, exist)
            onDone(exist)
            return
        }

        const rt = PIXI.RenderTexture.create({ width: CHUNK_PX, height: CHUNK_PX, resolution: 1 })
        rt.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST
        const renderer = app.renderer

        // clear to transparent
        renderer.render(new PIXI.Container(), { renderTexture: rt, clear: true })

        const startTx = cx * chunkSize
        const startTy = cy * chunkSize
        let ty = 0

        const tile = new PIXI.Sprite(WHITE)
        tile.tint = 0x000000
        tile.width = TILE_SIZE
        tile.height = TILE_SIZE

        const step = () => {
            for (let tx = 0; tx < chunkSize; tx++) {
                const wx = startTx + tx
                const wy = startTy + ty
                if (isDiscovered(wx, wy)) continue
                tile.x = tx * TILE_SIZE
                tile.y = ty * TILE_SIZE
                renderer.render(tile, { renderTexture: rt, clear: false })
            }
            ty++
            if (ty < chunkSize) {
                app.ticker.addOnce(step)
            } else {
                rtCache.set(k, rt)

                const existing = chunkSprites.get(k)
                if (existing && stale.has(k)) {
                    const oldTex = existing.texture
                    existing.texture = rt
                    useKey(k)
                    stale.delete(k)
                    if (oldTex instanceof PIXI.RenderTexture) {
                        oldTex.destroy(true)
                    }
                } else {
                    spawnSpriteFromRT(k, cx, cy, rt)
                    useKey(k)
                }
                onDone(rt)
            }
        }

        app.ticker.addOnce(step)
    }

    // bake queue
    type Job = { cx: number; cy: number; key: string; priority: number }
    const bakeQueue: Job[] = []
    let startedThisFrame = 0
    let activeBakes = 0

    function isQueued(k: string) {
        return bakeQueue.some((j) => j.key === k)
    }

    function enqueue(cx: number, cy: number, priority: number) {
        const k = key(cx, cy)
        const hasSprite = chunkSprites.has(k)
        const hasCache = rtCache.has(k)
        if ((!stale.has(k) && (hasSprite || hasCache)) || isQueued(k)) return
        bakeQueue.push({ cx, cy, key: k, priority })
        bakeQueue.sort((a, b) => b.priority - a.priority)
    }

    function startNextBakes() {
        startedThisFrame = 0
        while (
            startedThisFrame < BAKES_PER_FRAME &&
            activeBakes < MAX_CONCURRENT &&
            bakeQueue.length
        ) {
            const job = bakeQueue.shift()!
            startedThisFrame++
            activeBakes++
            bakeChunkTextureIncremental(job.cx, job.cy, () => {
                activeBakes--
            })
        }
    }

    if (ATTACH_TICKER) app.ticker.add(startNextBakes)

    let lastCameraTileX = Number.NaN
    let lastCameraTileY = Number.NaN
    let dirty = false

    function updateVisible() {
        const centerW = camera.screenToWorld(app.screen.width * 0.5, app.screen.height * 0.5)
        const camTileX = Math.floor(centerW.x / TILE_SIZE)
        const camTileY = Math.floor(centerW.y / TILE_SIZE)
        if (!dirty && camTileX === lastCameraTileX && camTileY === lastCameraTileY) return
        lastCameraTileX = camTileX
        lastCameraTileY = camTileY

        const { minCx, maxCx, minCy, maxCy } = worldChunkBounds()
        const needed = new Set<string>()

        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const k = key(cx, cy)
                needed.add(k)

                const spr = chunkSprites.get(k)
                if (spr) {
                    spr.visible = true
                    spr.x = cx * CHUNK_PX
                    spr.y = cy * CHUNK_PX
                    useKey(k)
                    if (!stale.has(k)) {
                        continue
                    }
                }

                const rt = rtCache.get(k)
                if (rt) {
                    spawnSpriteFromRT(k, cx, cy, rt)
                    useKey(k)
                    continue
                }

                // priority = -distance^2 + aheadWeight * (dot with velocity)
                const dx = cx * CHUNK_PX + CHUNK_PX * 0.5 - centerW.x
                const dy = cy * CHUNK_PX + CHUNK_PX * 0.5 - centerW.y
                const dist2 = dx * dx + dy * dy
                const ahead = dx * vel.x + dy * vel.y
                const priority = -dist2 + ahead * AHEAD_WEIGHT
                enqueue(cx, cy, priority)
            }
        }

        for (const [k, spr] of chunkSprites) {
            if (!needed.has(k)) {
                spr.visible = false
                if (spr.parent) spr.parent.removeChild(spr)
                spr.destroy()
                chunkSprites.delete(k)
            }
        }

        updateVelocity(centerW)
        dirty = false
    }

    function invalidateChunkKey(k: string) {
        if (rtCache.has(k)) {
            rtCache.delete(k)
        }
        if (!stale.has(k)) stale.add(k)
        const i = touchOrder.indexOf(k)
        if (i >= 0) touchOrder.splice(i, 1)
        dirty = true
    }

    function destroy() {
        if (ATTACH_TICKER) app.ticker.remove(startNextBakes)
        for (const spr of chunkSprites.values()) spr.destroy()
        chunkSprites.clear()
        for (const rt of rtCache.values()) rt.destroy(true)
        rtCache.clear()
        layer.destroy({ children: false })
    }

    // initial sync
    updateVisible()

    return { updateVisible, invalidateChunkKey, destroy }
}
