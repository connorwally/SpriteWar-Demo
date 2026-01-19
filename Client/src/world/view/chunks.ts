import * as PIXI from 'pixi.js'
import { CHUNK_TILES as DEFAULT_CHUNK_TILES, TILE_SIZE } from '@/core/config'
import type { CameraApi } from '@/input/camera'
import { NoiseGenerator } from '@/world/generation/noise'
import { CHUNK_GEN_DEFAULTS } from '@/core/config'
import { useBorderStore } from '@/world/stores/borderStore'

export type ChunkGeneratorOptions = {
    chunkTiles?: number
    bufferChunks?: number
    maxCachedChunks?: number
    bakesPerFrame?: number
    maxConcurrentBakes?: number
    aheadWeight?: number
    attachTicker?: boolean
}

export function createChunkGenerator(opts: {
    app: PIXI.Application
    container: PIXI.Container
    camera: CameraApi
    noise: NoiseGenerator
    options?: ChunkGeneratorOptions
}) {
    const { app, container: gridContainer, camera, noise: terrain } = opts
    const o = opts.options ?? {}
    const world = useBorderStore()

    const CHUNK_TILES = Math.max(4, o.chunkTiles ?? DEFAULT_CHUNK_TILES)
    const CHUNK_PX = CHUNK_TILES * TILE_SIZE
    const BUFFER = Math.max(1, o.bufferChunks ?? CHUNK_GEN_DEFAULTS.bufferChunks)
    const MAX_CACHE = Math.max(32, o.maxCachedChunks ?? CHUNK_GEN_DEFAULTS.maxCachedChunks)
    const BAKES_PER_FRAME = Math.max(1, o.bakesPerFrame ?? CHUNK_GEN_DEFAULTS.bakesPerFrame)
    const MAX_CONCURRENT = Math.max(
        1,
        o.maxConcurrentBakes ?? CHUNK_GEN_DEFAULTS.maxConcurrentBakes
    )
    const AHEAD_WEIGHT = Number.isFinite(o.aheadWeight)
        ? (o.aheadWeight as number)
        : CHUNK_GEN_DEFAULTS.aheadWeight
    const ATTACH_TICKER = o.attachTicker ?? false

    const layer = new PIXI.Container()
    gridContainer.addChild(layer)

    const chunkSprites = new Map<string, PIXI.Sprite>()

    const rtCache = new Map<string, PIXI.RenderTexture>()
    const touchOrder: string[] = []

    const useKey = (key: string) => {
        if (!rtCache.has(key)) return
        const i = touchOrder.indexOf(key)
        if (i >= 0) touchOrder.splice(i, 1)
        touchOrder.push(key)
        evictIfNeeded()
    }

    function evictIfNeeded() {
        while (touchOrder.length > MAX_CACHE) {
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

    const getChunkKey = (cx: number, cy: number) => `${cx},${cy}`

    function chunkBoundsFromView() {
        const tl = camera.screenToWorld(0, 0)
        const br = camera.screenToWorld(app.screen.width, app.screen.height)

        const minx = Math.min(tl.x, br.x)
        const maxx = Math.max(tl.x, br.x)

        const miny = Math.min(tl.y, br.y)
        const maxy = Math.max(tl.y, br.y)

        const minCx = Math.floor(minx / CHUNK_PX) - BUFFER
        const maxCx = Math.floor(maxx / CHUNK_PX) + BUFFER

        const minCy = Math.floor(miny / CHUNK_PX) - BUFFER
        const maxCy = Math.floor(maxy / CHUNK_PX) + BUFFER

        return { minCx, maxCx, minCy, maxCy }
    }

    let lastCenter = camera.screenToWorld(app.screen.width * 0.5, app.screen.height * 0.5)

    let vel = { x: 0, y: 0 }
    function updateVelocity(newCenter: { x: number; y: number }) {
        vel.x = newCenter.x - lastCenter.x
        vel.y = newCenter.y - lastCenter.y
        lastCenter = newCenter
    }

    // BAKING

    const clearContainer = new PIXI.Container()
    const WHITE = PIXI.Texture.WHITE

    function checkerboard(color: number, factor: number): number {
        const r = Math.floor(((color >> 16) & 0xff) * factor)
        const g = Math.floor(((color >> 8) & 0xff) * factor)
        const b = Math.floor((color & 0xff) * factor)
        return (r << 16) | (g << 8) | b
    }

    function bakeChunkTextureIncremental(
        cx: number,
        cy: number,
        onDone: (rt: PIXI.RenderTexture) => void
    ) {
        const key = getChunkKey(cx, cy)
        const existing = rtCache.get(key)
        if (existing) {
            useKey(key)
            onDone(existing)
            return
        }

        const rt = PIXI.RenderTexture.create({ width: CHUNK_PX, height: CHUNK_PX, resolution: 1 })
        rt.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST
        const renderer = app.renderer

        renderer.render(clearContainer, { renderTexture: rt, clear: true })

        const startTx = cx * CHUNK_TILES
        const startTy = cy * CHUNK_TILES
        let ty = 0

        const tile = new PIXI.Sprite(WHITE)

        const step = () => {
            for (let tx = 0; tx < CHUNK_TILES; tx++) {
                const worldTx = startTx + tx
                const worldTy = startTy + ty

                let color = terrain.getTileColor(worldTx, worldTy)
                if (world.isOutside(worldTx, worldTy)) {
                    // Apply red tint while preserving terrain detail
                    const r = (color >> 16) & 0xff
                    const g = (color >> 8) & 0xff
                    const b = color & 0xff

                    // Boost red slightly, reduce green and blue
                    const newR = Math.min(255, Math.floor(r * 0.8) + 80)
                    const newG = Math.floor(g * 0.6)
                    const newB = Math.floor(b * 0.6)

                    color = (newR << 16) | (newG << 8) | newB
                } else if (((worldTx + worldTy) & 1) === 1) {
                    const alias = terrain.getTileAlias(worldTx, worldTy)
                    let factor = 1
                    if (alias === 'beach2')
                        factor = 0.995 // slight
                    else if (alias === 'grass1' || alias === 'grass2') factor = 0.99 // stronger
                    // water: factor stays 1 (no effect)
                    if (factor < 1) color = checkerboard(color, factor)
                }
                tile.tint = color
                tile.x = tx * TILE_SIZE
                tile.y = ty * TILE_SIZE
                tile.width = TILE_SIZE
                tile.height = TILE_SIZE

                renderer.render(tile, { renderTexture: rt, clear: false })
            }

            ty++
            if (ty < CHUNK_TILES) {
                app.ticker.addOnce(step)
            } else {
                rtCache.set(key, rt)
                spawnSpriteFromRT(key, cx, cy, rt)
                useKey(key)
                onDone(rt)
            }
        }

        app.ticker.addOnce(step)
    }

    function spawnSpriteFromRT(key: string, cx: number, cy: number, rt: PIXI.RenderTexture) {
        if (chunkSprites.has(key)) return
        const spr = new PIXI.Sprite(rt)
        spr.x = cx * CHUNK_PX
        spr.y = cy * CHUNK_PX
        chunkSprites.set(key, spr)
        layer.addChild(spr)
    }

    // BAKE QUEUE
    type Job = { cx: number; cy: number; key: string; priority: number }
    const bakeQueue: Job[] = []
    let startedThisFrame = 0
    let activeBakes = 0

    function isQueued(key: string) {
        return bakeQueue.some((j) => j.key === key)
    }

    const MAX_QUEUE = 512
    function enqueue(cx: number, cy: number, priority: number) {
        const key = getChunkKey(cx, cy)
        if (rtCache.has(key) || chunkSprites.has(key) || isQueued(key)) return
        if (bakeQueue.length >= MAX_QUEUE) return
        bakeQueue.push({ cx, cy, key, priority })
        bakeQueue.sort((a, b) => b.priority - a.priority)
    }

    function startNextBakes() {
        startedThisFrame = 0
        while (
            startedThisFrame < BAKES_PER_FRAME &&
            activeBakes < MAX_CONCURRENT &&
            bakeQueue.length > 0
        ) {
            const job = bakeQueue.shift()!
            startedThisFrame++
            activeBakes++
            bakeChunkTextureIncremental(job.cx, job.cy, () => {
                activeBakes--
            })
        }
    }

    function invalidateAll() {
        for (const spr of chunkSprites.values()) {
            spr.parent && spr.parent.removeChild(spr)
            spr.destroy()
        }
        chunkSprites.clear()
        for (const rt of rtCache.values()) {
            rt.destroy(true)
        }
        rtCache.clear()
        touchOrder.length = 0
        bakeQueue.length = 0

        lastCameraTileX = Number.NaN
        lastCameraTileY = Number.NaN
    }

    app.ticker.add(startNextBakes)

    let lastCameraTileX = Number.NaN
    let lastCameraTileY = Number.NaN

    function updateVisible() {
        const centerW = camera.screenToWorld(app.screen.width * 0.5, app.screen.height * 0.5)
        const camTileX = Math.floor(centerW.x / TILE_SIZE)
        const camTileY = Math.floor(centerW.y / TILE_SIZE)
        if (camTileX === lastCameraTileX && camTileY === lastCameraTileY) return
        lastCameraTileX = camTileX
        lastCameraTileY = camTileY

        const { minCx, maxCx, minCy, maxCy } = chunkBoundsFromView()
        const needed = new Set<string>()

        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const key = getChunkKey(cx, cy)
                needed.add(key)

                const existingSpr = chunkSprites.get(key)
                if (existingSpr) {
                    existingSpr.visible = true
                    existingSpr.x = cx * CHUNK_PX
                    existingSpr.y = cy * CHUNK_PX
                    useKey(key)
                    continue
                }

                const rt = rtCache.get(key)
                if (rt) {
                    spawnSpriteFromRT(key, cx, cy, rt)
                    useKey(key)
                    continue
                }

                const dx = cx * CHUNK_PX + CHUNK_PX * 0.5 - centerW.x
                const dy = cy * CHUNK_PX + CHUNK_PX * 0.5 - centerW.y
                const dist2 = dx * dx + dy * dy
                const ahead = dx * vel.x + dy * vel.y
                const priority = -dist2 + ahead * AHEAD_WEIGHT
                enqueue(cx, cy, priority)
            }
        }

        for (const [key, spr] of chunkSprites) {
            if (!needed.has(key)) {
                spr.visible = false
                spr.parent && spr.parent.removeChild(spr)
                spr.texture = PIXI.Texture.EMPTY
                spr.destroy()
                chunkSprites.delete(key)
            }
        }

        updateVelocity(centerW)
    }

    const tickerCb = () => updateVisible()
    if (ATTACH_TICKER) app.ticker.add(tickerCb)

    updateVisible()

    return {
        updateVisible,
        invalidateAll,
        destroy() {
            if (ATTACH_TICKER) app.ticker.remove(tickerCb)
            for (const spr of chunkSprites.values()) spr.destroy()
            chunkSprites.clear()
            for (const rt of rtCache.values()) rt.destroy(true)
            rtCache.clear()
            layer.destroy({ children: false })
        },
    }
}
