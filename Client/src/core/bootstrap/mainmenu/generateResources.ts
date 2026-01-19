import { makePermutation, fbm2D } from '@/world/generation/utils.ts'
import { MENU_SCENE, TERRAIN_DEFAULTS, TERRAIN_VALUES, TILE_SIZE } from '@/core/config'
import * as PIXI from 'pixi.js'
import { NoiseGenerator } from '@/world/generation/noise.ts'
import type { CameraApi } from '@/input/camera'
import { spriteLib } from '@/entities/view/sprites/spriteLibrary.ts'

export function createResourceGenerator(opts: {
    app: PIXI.Application
    resourcesContainer: PIXI.Container
    camera: CameraApi
    terrain: NoiseGenerator
    density?: number
}) {
    const { app, resourcesContainer: gridContainer, camera, terrain } = opts
    const density = Math.max(
        0,
        Math.min(
            1,
            Number.isFinite(opts.density)
                ? (opts.density as number)
                : (MENU_SCENE.treeDensity ?? 0.03)
        )
    )

    const decor = new PIXI.Container()
    gridContainer.addChild(decor)

    const placedResources = new Map<string, PIXI.DisplayObject>()

    function updateVisible() {
        const tl = camera.screenToWorld(0, 0)
        const br = camera.screenToWorld(app.screen.width, app.screen.height)
        const minx = Math.min(tl.x, br.x)
        const maxx = Math.max(tl.x, br.x)
        const miny = Math.min(tl.y, br.y)
        const maxy = Math.max(tl.y, br.y)

        const BUF = 3
        const minTx = Math.floor(minx / TILE_SIZE) - BUF
        const maxTx = Math.floor(maxx / TILE_SIZE) + BUF
        const minTy = Math.floor(miny / TILE_SIZE) - BUF
        const maxTy = Math.floor(maxy / TILE_SIZE) + BUF

        for (let ty = minTy; ty <= maxTy; ty++) {
            for (let tx = minTx; tx <= maxTx; tx++) {
                const key = `${tx},${ty}`
                if (placedResources.has(key)) continue
                if (!terrain.isLand(tx, ty)) continue

                let placed = false

                if (shouldPlaceStone(tx, ty)) {
                    const { display } = spriteLib.spawn(decor, 'Stone', { tx, ty })
                    placedResources.set(key, display)
                    placed = true
                }

                if (!placed && shouldPlaceTree(tx, ty)) {
                    if (density >= 1 || terrain.randomAt(tx, ty) < density) {
                        const { display } = spriteLib.spawn(decor, 'Tree', { tx, ty })
                        placedResources.set(key, display)
                        placed = true
                    }
                }
            }
        }

        for (const [key, d] of placedResources) {
            const [txStr, tyStr] = key.split(',')
            const tx = parseInt(txStr, 10)
            const ty = parseInt(tyStr, 10)
            if (tx < minTx - 8 || tx > maxTx + 8 || ty < minTy - 8 || ty > maxTy + 8) {
                if ((d as any).parent) (d as any).parent.removeChild(d as any)
                placedResources.delete(key)
            }
        }
    }

    function destroy() {
        for (const d of placedResources.values()) {
            if ((d as any).parent) (d as any).parent.removeChild(d as any)
        }
        placedResources.clear()
        decor.destroy({ children: true })
    }

    return { layer: decor, updateVisible, destroy }
}

const shouldPlaceStone = (() => {
    const stonePerm = makePermutation((TERRAIN_DEFAULTS.seed + 3) >>> 0)

    const getStonePatchNoise = (tx: number, ty: number) =>
        fbm2D(stonePerm, tx / 20, ty / 20, 1, 1.6, 0.4)

    const stoneThreshold = 0.8

    return (tx: number, ty: number) => {
        return getStonePatchNoise(tx, ty) > stoneThreshold
    }
})()

const shouldPlaceTree = (() => {
    const terrainPerm = makePermutation(TERRAIN_DEFAULTS.seed >>> 0)
    const treePerm = makePermutation((TERRAIN_DEFAULTS.seed + 1) >>> 0)

    const tn = TERRAIN_DEFAULTS.noise
    const getTerrainNoise = (tx: number, ty: number) =>
        fbm2D(terrainPerm, tx / tn.scale, ty / tn.scale, tn.octaves, tn.lacunarity, tn.persistence)

    const getTreePatchNoise = (tx: number, ty: number) =>
        fbm2D(treePerm, tx / 10, ty / 10, 1, 1.6, 0.4)

    const guaranteedTreeThreshold = TERRAIN_VALUES.grass1
    const startingTreeTheshold = TERRAIN_VALUES.beach2

    return (tx: number, ty: number) => {
        const terrainNoise = getTerrainNoise(tx, ty)
        const treePatchNoise = getTreePatchNoise(tx, ty)

        if (terrainNoise >= guaranteedTreeThreshold) return true
        if (terrainNoise >= startingTreeTheshold) {
            let t =
                (terrainNoise - startingTreeTheshold) /
                (guaranteedTreeThreshold - startingTreeTheshold)
            t = Math.max(0, Math.min(1, t))
            const terrainInfluence = 0.999 + 0.001 * t
            const adjustedThreshold = 0.67 + (1.0 - terrainInfluence) * 0.3
            if (treePatchNoise > adjustedThreshold) return true
        }
        return false
    }
})()
