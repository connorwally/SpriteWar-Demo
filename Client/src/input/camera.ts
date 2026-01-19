import * as PIXI from 'pixi.js'
import { CAMERA, TILE_SIZE } from '../core/config.ts'
import type { ContainerApi } from '@/core/types.ts'

export type PanDirection = 'left' | 'right' | 'up' | 'down'
export type CameraApi = {
    screenToWorld: (sx: number, sy: number) => { x: number; y: number }
    worldToTile: (wx: number, wy: number) => { tx: number; ty: number }

    getScale: () => number
    getPosition: () => { x: number; y: number }
    setPosition: (x: number, y: number) => void
    setScale: (scale: number) => void

    zoomAt: (anchorSX: number, anchorSY: number, direction: -1 | 1) => void

    destroy: () => void
}

export function setupCamera(app: PIXI.Application, containers: ContainerApi): CameraApi {
    let scale = 1
    let position: { x: number; y: number } = { x: 0, y: 0 }

    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

    const quantizeScale = (s: number) => {
        const ppt = Math.max(1, Math.round(s * TILE_SIZE))
        return ppt / TILE_SIZE
    }

    const screenToWorld = (sx: number, sy: number) => ({
        x: (sx - containers.gridContainer.position.x) / scale,
        y: (sy - containers.gridContainer.position.y) / scale,
    })

    const worldToTile = (wx: number, wy: number) => ({
        tx: Math.floor(wx / TILE_SIZE),
        ty: Math.floor(wy / TILE_SIZE),
    })

    const setPosition = (x: number, y: number) => {
        containers.gridContainer.position.set(x, y)
        position = { x, y }
    }

    const setScale = (scale: number) => {
        const newScale = quantizeScale(clamp(scale, CAMERA.minScale, CAMERA.maxScale))
        containers.gridContainer.scale.set(newScale)
        scale = newScale
    }

    const getPosition = () => position

    const getScale = () => scale

    const zoomAt = (anchorSX: number, anchorSY: number, direction: -1 | 1) => {
        // Use last known mouse position as anchor
        const before = screenToWorld(anchorSX, anchorSY)

        const zoomFactor = 1 + direction * CAMERA.wheelSpeed
        const newScale = quantizeScale(clamp(scale * zoomFactor, CAMERA.minScale, CAMERA.maxScale))

        if (newScale === scale) return
        scale = newScale

        containers.gridContainer.scale.set(newScale)
        // Shift camera so "before" world coords are still under "anchor" screen coords
        containers.gridContainer.position.set(
            Math.round(anchorSX - before.x * newScale),
            Math.round(anchorSY - before.y * newScale)
        )
        position = {
            x: anchorSX - before.x * newScale,
            y: anchorSY - before.y * newScale,
        }
    }

    function init() {
        setScale(1)
        setPosition(app.screen.width / 2, app.screen.height / 2)
    }
    init()

    return {
        screenToWorld,
        worldToTile,
        getScale,
        getPosition,
        setPosition,
        setScale,
        zoomAt,
        destroy: () => {},
    }
}
