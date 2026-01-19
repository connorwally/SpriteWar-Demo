import * as PIXI from 'pixi.js'
import { setupCamera } from '@/input/camera'
import { TILE_SIZE, MENU_SCENE, TERRAIN_DEFAULTS, CHUNK_GEN_DEFAULTS } from '@/core/config'
import { NoiseGenerator } from '@/world/generation/noise'
import { createChunkGenerator } from '@/world/view/chunks'
import { createResourceGenerator } from '@/core/bootstrap/mainmenu/generateResources.ts'
import { setupSceneContainers } from '../setupSceneContainers'

PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST
PIXI.BaseTexture.defaultOptions.mipmap = PIXI.MIPMAP_MODES.OFF

export function initMenuBackground(targetEl: HTMLElement) {
    let currentPanSpeed = MENU_SCENE.panSpeedPxSec ?? 40
    const density = Math.max(0, Math.min(1, MENU_SCENE.treeDensity ?? 0.03))

    const app = new PIXI.Application({
        resizeTo: targetEl,
        backgroundColor: 0x0d0d0f,
        antialias: false,
    })
    targetEl.appendChild(app.view as HTMLCanvasElement)

    const containers = setupSceneContainers(app)

    const camera = setupCamera(app, containers)

    const terrain = new NoiseGenerator(TERRAIN_DEFAULTS)
    const chunkGen = createChunkGenerator({
        app,
        container: containers.terrainLayer,
        camera,
        noise: terrain,
        options: CHUNK_GEN_DEFAULTS,
    })

    const resources = createResourceGenerator({
        app,
        resourcesContainer: containers.resourcesLayer,
        camera,
        terrain: terrain,
        density,
    })

    let lastCamTx = Number.NaN
    let lastCamTy = Number.NaN
    let lastChunkCamTx = Number.NaN
    let lastChunkCamTy = Number.NaN

    let panAccum = 0
    // Updating view
    app.ticker.add((delta) => {
        if (currentPanSpeed !== 0) {
            const deltaMove = -(currentPanSpeed * delta) / 60 // leftward pixels this frame (can be fractional)
            panAccum += deltaMove
            const step = panAccum >= 0 ? Math.floor(panAccum) : Math.ceil(panAccum) // round toward -∞/+∞ by direction
            if (step !== 0) {
                containers.gridContainer.position.x += step
                panAccum -= step
            }
        }
        const c = camera.screenToWorld(app.screen.width * 0.5, app.screen.height * 0.5)
        const camTx = Math.floor(c.x / TILE_SIZE)
        const camTy = Math.floor(c.y / TILE_SIZE)
        if (camTx !== lastChunkCamTx || camTy !== lastChunkCamTy) {
            lastChunkCamTx = camTx
            lastChunkCamTy = camTy
            chunkGen.updateVisible()
        }
        if (camTx !== lastCamTx || camTy !== lastCamTy) {
            lastCamTx = camTx
            lastCamTy = camTy
            resources.updateVisible()
        }
    })

    const destroy = () => {
        resources.destroy()
        camera.destroy()
        app.destroy(true)
    }

    return {
        app,
        containers,
        camera,
        destroy,
        setPanSpeed(pxPerSec: number) {
            currentPanSpeed = pxPerSec
        },
    }
}
