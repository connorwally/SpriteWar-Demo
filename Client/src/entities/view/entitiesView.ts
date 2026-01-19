import * as PIXI from 'pixi.js'
import type { Entity } from '@/entities/types'
import type { TilePos } from '@/core/types'
import { TILE_SIZE } from '@/core/config'
import { spawnSprite } from '@/entities/view/sprites/spawnSprite'
import { useEntityStore } from '@/entities/state/entityStore'
import type { TypeRegistryApi } from '@/entities/data/entityTypeRegistry'
import { spriteLib } from '@/entities/view/sprites/spriteLibrary'
import { useSessionStore } from '@/core/stores/session'
import { type Remembered, useRememberedStore } from '@/world/stores/fogOfWar/rememberedStore'
import { resolveSpriteTeam } from '@/entities/view/sprites/resolveSpriteTeam'
import { watch } from 'vue'

type Layers = {
    buildingsLayer: PIXI.Container
    unitsLayer: PIXI.Container
    resourcesLayer: PIXI.Container
}

function isBuildingOrResource(e: Entity, typeRegistry: TypeRegistryApi) {
    const t = typeRegistry.get(e.typeId)
    return t?.category !== 'unit'
}

function setDisplayTile(display: PIXI.DisplayObject, pos: TilePos) {
    ;(display as any).x = pos.tx * TILE_SIZE
    ;(display as any).y = pos.ty * TILE_SIZE
}

export function entityView(layers: Layers, typeRegistry: TypeRegistryApi) {
    const store = useEntityStore()
    const session = useSessionStore()
    const remembered = useRememberedStore()

    const ghostDisplays = new Map<string, PIXI.DisplayObject>()

    function addGhostBySnapshot(s: Remembered) {
        if (displays.has(s.id) || ghostDisplays.has(s.id)) return

        const fake = {
            id: s.id,
            typeId: s.typeId,
            ownerId: s.ownerId,
            pos: s.pos,
        } as any

        const display = spawnSprite(layers.buildingsLayer, fake)
        if (!display) return
        ;(display as any).x = s.pos.tx * TILE_SIZE
        ;(display as any).y = s.pos.ty * TILE_SIZE

        if (display instanceof PIXI.AnimatedSprite) {
            display.animationSpeed = 0
            display.gotoAndStop(0)
        }

        ghostDisplays.set(s.id, display)
    }

    function removeGhost(id: string) {
        const disp = ghostDisplays.get(id)
        if (disp && disp.parent) disp.parent.removeChild(disp)
        ghostDisplays.delete(id)
    }

    function clearGhosts() {
        for (const [, disp] of ghostDisplays) {
            if (disp.parent) disp.parent.removeChild(disp)
        }
        ghostDisplays.clear()
    }

    for (const s of remembered.all) addGhostBySnapshot(s)

    // id -> PIXI.DisplayObject
    const displays = new Map<string, PIXI.DisplayObject>()
    const MOVE_MS = 500
    type Direction = 'up' | 'down' | 'left' | 'right'
    const lastDir = new Map<string, Direction>()

    const computeDir = (fromX: number, fromY: number, toX: number, toY: number): Direction => {
        const dx = toX - fromX
        const dy = toY - fromY
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
        return dy > 0 ? 'down' : 'up'
    }

    const tryApplyAnim = (disp: PIXI.DisplayObject, animName: string): boolean => {
        const target = spriteLib.make(animName)
        if (target instanceof PIXI.AnimatedSprite && disp instanceof PIXI.AnimatedSprite) {
            disp.textures = target.textures
            const frames = disp.textures.length
            disp.animationSpeed = (frames * 1000) / (60 * MOVE_MS)
            disp.gotoAndPlay(0)
            return true
        }
        return false
    }

    const setUnitAnim = (entityId: string, state: 'walk' | 'idle' | 'attack', dir?: Direction) => {
        const ent = store.byId.get(entityId)
        if (!ent) return
        const t = typeRegistry.get(ent.typeId)
        if (!t || t.category !== 'unit') return
        const disp = displays.get(entityId)
        if (!disp || !(disp instanceof PIXI.AnimatedSprite)) return

        const baseFamily = t.visual.spriteId
        const family = resolveSpriteTeam(baseFamily, ent.ownerId, session.playerId)
        const directionalName = dir ? `${family} ${state}_${dir}` : null
        const genericName = `${family} ${state}`

        let applied = false
        if (directionalName && spriteLib.find(directionalName)) {
            if (tryApplyAnim(disp, directionalName)) applied = true
        }
        if (!applied && spriteLib.find(genericName)) {
            applied = tryApplyAnim(disp, genericName)
        }

        if (applied) {
            if (state === 'attack') {
                disp.loop = false
                disp.onComplete = () => {
                    disp.loop = true
                    maybePlayIdleAnim(entityId)
                }
            } else {
                disp.loop = true
            }
        }
    }

    const playAttack = (attackerId: string, targetPos: TilePos) => {
        const disp = displays.get(attackerId)
        if (!disp) return
        const fromX = (disp as any).x ?? targetPos.tx * TILE_SIZE
        const fromY = (disp as any).y ?? targetPos.ty * TILE_SIZE
        const toX = targetPos.tx * TILE_SIZE
        const toY = targetPos.ty * TILE_SIZE

        // Same tile → play 'down'
        if (fromX === toX && fromY === toY) {
            lastDir.set(attackerId, 'down')
            setUnitAnim(attackerId, 'attack', 'down')
            return
        }

        const dir = computeDir(fromX, fromY, toX, toY)
        lastDir.set(attackerId, dir)
        setUnitAnim(attackerId, 'attack', dir)
    }

    const maybePlayMoveAnim = (
        entityId: string,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number
    ) => {
        const dir = computeDir(fromX, fromY, toX, toY)
        lastDir.set(entityId, dir)
        setUnitAnim(entityId, 'walk', dir)
    }

    const maybePlayIdleAnim = (entityId: string) => {
        const dir = lastDir.get(entityId)
        setUnitAnim(entityId, 'idle', dir)
    }

    type Tween = {
        id: string
        disp: PIXI.DisplayObject
        fromX: number
        fromY: number
        toX: number
        toY: number
        start: number
        dur: number
    }

    const tweens = new Map<string, Tween>()

    const startTween = (id: string, disp: PIXI.DisplayObject, to: TilePos) => {
        const toX = to.tx * TILE_SIZE
        const toY = to.ty * TILE_SIZE
        const curX = (disp as any).x ?? toX
        const curY = (disp as any).y ?? toY

        maybePlayMoveAnim(id, curX, curY, toX, toY)

        tweens.set(id, {
            id,
            disp,
            fromX: curX,
            fromY: curY,
            toX,
            toY,
            start: performance.now(),
            dur: MOVE_MS,
        })
    }

    const tick = () => {
        const now = performance.now()
        for (const [id, tw] of tweens) {
            const t = Math.min(1, (now - tw.start) / tw.dur)
            const x = tw.fromX + (tw.toX - tw.fromX) * t
            const y = tw.fromY + (tw.toY - tw.fromY) * t
            ;(tw.disp as any).x = x
            ;(tw.disp as any).y = y
            if (t >= 1) {
                tweens.delete(id)
                maybePlayIdleAnim(id)
            }
        }
    }

    PIXI.Ticker.shared.add(tick)

    // ----- helpers -----
    const addOne = (e: Entity) => {
        const layer = isBuildingOrResource(e, typeRegistry)
            ? layers.buildingsLayer
            : layers.unitsLayer
        const display = spawnSprite(layer, e)
        if (!display) return
        setDisplayTile(display, e.pos)
        displays.set(e.id, display)
    }

    const moveOne = (id: string, to: TilePos) => {
        const disp = displays.get(id)
        if (disp) startTween(id, disp, to)
    }

    const patchOne = (patch: Partial<Entity> & { id: string }) => {
        const disp = displays.get(patch.id)
        if (disp && patch.pos) startTween(patch.id, disp, patch.pos)

        if (disp && patch.ownerId != null) {
            // owner changed → rebuild display with correct family
            const updated = store.byId.get(patch.id)
            if (updated) {
                const parent = disp.parent
                if (parent) parent.removeChild(disp)
                displays.delete(patch.id)
                addOne(updated)
            }
            return
        }
    }

    const removeOne = (id: string) => {
        const disp = displays.get(id)
        if (disp && disp.parent) disp.parent.removeChild(disp)
        displays.delete(id)
        tweens.delete(id)
    }

    const clearAll = () => {
        for (const [, disp] of displays) {
            if (disp.parent) disp.parent.removeChild(disp)
        }
        displays.clear()
        tweens.clear()
    }

    // ----- initial hydrate from store (in case socket already populated) -----
    for (const e of store.all) addOne(e)

    // ----- react to store actions -----
    const stop = store.$onAction(({ name, args, after }) => {
        if (name === 'remove') {
            const id = args[0] as string
            const e = store.byId.get(id)
            if (e && isBuildingOrResource(e, typeRegistry)) {
                remembered.remember(e)
            }
        }

        after(() => {
            switch (name) {
                case 'upsertMany': {
                    const entities = args[0] as Entity[]
                    for (const e of entities) {
                        remembered.forget(e.id)
                        removeGhost(e.id)
                    }
                    for (const e of entities) {
                        if (displays.has(e.id)) patchOne(e)
                        else addOne(e)
                    }
                    break
                }
                case 'patch': {
                    const change = args[0] as Partial<Entity> & { id: string }

                    remembered.forget(change.id)
                    removeGhost(change.id)

                    if (change.pos && Object.keys(change).length === 2)
                        moveOne(change.id, change.pos)
                    else patchOne(change)
                    break
                }
                case 'remove': {
                    const id = args[0] as string
                    removeOne(id)

                    const snap = remembered.get(id)
                    if (snap) addGhostBySnapshot(snap)

                    break
                }
                case 'clear': {
                    clearAll()
                    clearGhosts()
                    remembered.clear()
                    break
                }
                case 'attack': {
                    const attackerId = args[0] as string
                    const targetId = args[1] as string
                    const target = store.byId.get(targetId)
                    if (target) playAttack(attackerId, target.pos)
                    break
                }
            }
        })
    })

    const stopPlayerWatch = watch(
        () => session.playerId,
        () => {
            for (const e of store.all) {
                const disp = displays.get(e.id)
                if (!disp) continue
                const parent = disp.parent
                if (parent) parent.removeChild(disp)
                displays.delete(e.id)
                addOne(e)
            }
        }
    )

    // unified destroy for the caller
    const destroy = () => {
        stop()
        stopPlayerWatch()
        PIXI.Ticker.shared.remove(tick)
        tweens.clear()
        clearAll()
    }

    return { destroy, displays }
}
