import type * as PIXI from 'pixi.js'
import type { Tween } from './types'
import { usePlayerStore } from '@/core/stores/player'
import { CAMERA, TILE_SIZE } from '@/core/config'
import type { CameraApi } from './camera'
import type { TilePos } from '@/core/types'

export type CameraControlsApi = {
    destroy: () => void

    setMouseAnchorScreen: (sx: number, sy: number) => void
    updateEdgePanFromClient: (clientX: number, clientY: number, overCanvas: boolean) => void
    clearEdgePan: () => void

    onWheel: (deltaY: number) => void

    beginDragPan: (pointerId: number, clientX: number, clientY: number) => void
    updateDragPan: (pointerId: number, clientX: number, clientY: number) => void
    endDragPan: (pointerId: number) => void
    cancelDragPan: () => void

    setManualPanVec: (x: number, y: number, speed?: number) => void
    clearManualPan: () => void

    panToWorld: (wx: number, wy: number, ms?: number, targetScale?: number) => void
    panToHome: () => void

    getTileAt: (clientX: number, clientY: number) => TilePos
}

export function setupCameraControls(app: PIXI.Application, camera: CameraApi): CameraControlsApi {
    const canvas = app.view as unknown as HTMLCanvasElement
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    const ease = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : 1 - (1 - u) * (1 - u))
    let manualPan = { x: 0, y: 0 }
    let manualSpeed = CAMERA.edgePan.speed

    let panning = false
    let activeId: number | null = null
    let panStart = { x: 0, y: 0 }

    let tween: Tween | null = null

    const tick = (dt: number) => {
        // 1. Handle Tweening
        if (tween) {
            tween.t += (dt * 1000) / 60
            const u = ease(Math.min(1, tween.t / tween.dur))

            if (typeof tween.wx === 'number' && typeof tween.wy === 'number') {
                const sRaw = tween.ss + ((tween.es ?? tween.ss) - tween.ss) * u
                camera.setScale(sRaw)

                const cx = app.screen.width * 0.5
                const cy = app.screen.height * 0.5
                const scale = camera.getScale()
                const txPos = cx - tween.wx * scale
                const tyPos = cy - tween.wy * scale

                camera.setPosition(
                    Math.round(tween.sx + (txPos - tween.sx) * u),
                    Math.round(tween.sy + (tyPos - tween.sy) * u)
                )
            }
            if (u >= 1) tween = null
        }

        // 2. Handle Panning (Manual + Edge)
        const combinedX = manualPan.x + edgeDirX
        const combinedY = manualPan.y + edgeDirY

        if (!panning && (combinedX !== 0 || combinedY !== 0)) {
            if (tween) tween = null // User input cancels auto-pan
            const dtSec = dt / 60
            // Use manual speed if manual input is active, otherwise edge speed
            const speed =
                manualPan.x !== 0 || manualPan.y !== 0 ? manualSpeed : CAMERA.edgePan.speed
            const move = speed * dtSec

            const position = camera.getPosition()
            camera.setPosition(position.x - move * combinedX, position.y - move * combinedY)
        }
    }

    function getScreenPosition(clientX: number, clientY: number) {
        const r = canvas.getBoundingClientRect()
        const screenX = (clientX - r.left) * (app.screen.width / r.width)
        const screenY = (clientY - r.top) * (app.screen.height / r.height)
        return { screenX, screenY }
    }

    function getTileAt(clientX: number, clientY: number) {
        const { screenX, screenY } = getScreenPosition(clientX, clientY)
        const { x, y } = camera.screenToWorld(screenX, screenY)
        return camera.worldToTile(x, y)
    }

    // ------ API ------

    let mouseAnchorScreenX = 0
    let mouseAnchorScreenY = 0

    let edgeDirX = 0
    let edgeDirY = 0

    const panToHome = () => {
        const homeTile = usePlayerStore().homeTile
        if (homeTile) {
            const wx = (homeTile.tx + 0.5) * TILE_SIZE
            const wy = (homeTile.ty + 0.5) * TILE_SIZE
            panToWorld(wx, wy, 300)
            camera.setScale(1)
        }
    }
    function setMouseAnchorScreen(clientX: number, clientY: number) {
        const { screenX, screenY } = getScreenPosition(clientX, clientY)
        mouseAnchorScreenX = screenX
        mouseAnchorScreenY = screenY
    }

    function updateEdgePanFromClient(clientX: number, clientY: number, overCanvas: boolean) {
        const r = canvas.getBoundingClientRect()
        const inside =
            clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
        if (!inside && !overCanvas) {
            clearEdgePan()
            return
        }
        const left = clientX - r.left
        const right = r.right - clientX
        const top = clientY - r.top
        const bottom = r.bottom - clientY
        edgeDirX = left <= CAMERA.edgePan.size ? -1 : right <= CAMERA.edgePan.size ? 1 : 0
        edgeDirY = top <= CAMERA.edgePan.size ? -1 : bottom <= CAMERA.edgePan.size ? 1 : 0
    }

    function clearEdgePan() {
        edgeDirX = 0
        edgeDirY = 0
    }

    function onWheel(deltaY: number) {
        if (tween) tween = null

        camera.zoomAt(mouseAnchorScreenX, mouseAnchorScreenY, deltaY > 0 ? -1 : 1)
    }

    function beginDragPan(pointerId: number, clientX: number, clientY: number) {
        const { screenX, screenY } = getScreenPosition(clientX, clientY)
        panning = true
        activeId = pointerId
        canvas.setPointerCapture(pointerId)
        canvas.style.cursor = 'grabbing'
        panStart = { x: screenX, y: screenY }
        manualPan = { x: 0, y: 0 }
    }

    function updateDragPan(pointerId: number, clientX: number, clientY: number) {
        const { screenX, screenY } = getScreenPosition(clientX, clientY)
        if (!panning) return
        if (activeId !== pointerId) return
        if (tween) tween = null

        const dx = screenX - panStart.x
        const dy = screenY - panStart.y
        panStart = { x: screenX, y: screenY }

        const pos = camera.getPosition()
        camera.setPosition(pos.x + dx, pos.y + dy)
    }

    function endDragPan(pointerId: number) {
        if (!panning) return
        if (activeId !== pointerId) return
        panning = false
        if (activeId !== null) canvas.releasePointerCapture?.(activeId)
        canvas.style.cursor = ''
        activeId = null
    }

    function cancelDragPan() {
        if (!panning) return
        if (activeId !== null) canvas.releasePointerCapture?.(activeId)
        canvas.style.cursor = ''
        activeId = null
        panning = false
    }

    function setManualPanVec(x: number, y: number, speed?: number) {
        manualPan = { x: x, y: y }
        manualSpeed = speed ?? CAMERA.edgePan.speed
    }

    function clearManualPan() {
        manualPan = { x: 0, y: 0 }
    }

    const panToWorld = (wx: number, wy: number, ms = 350, targetScale?: number) => {
        tween = null
        const dur = Math.max(0, ms)
        const es =
            typeof targetScale === 'number'
                ? clamp(targetScale, CAMERA.minScale, CAMERA.maxScale)
                : undefined

        const position = camera.getPosition()

        tween = {
            t: 0,
            dur,
            sx: position.x,
            sy: position.y,
            ss: camera.getScale(),
            es,
            wx,
            wy,
        }
    }

    app.ticker.add(tick)

    const destroy = () => {
        app.ticker.remove(tick)
    }

    const cameraControls: CameraControlsApi = {
        destroy,
        setMouseAnchorScreen,
        getTileAt,
        updateEdgePanFromClient,
        clearEdgePan,
        onWheel,
        beginDragPan,
        updateDragPan,
        endDragPan,
        cancelDragPan,
        setManualPanVec,
        clearManualPan,
        panToWorld,
        panToHome,
    }

    return cameraControls
}
