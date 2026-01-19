import { createChunkGenerator } from './view/chunks'
import * as PIXI from 'pixi.js'
import type { CameraApi } from '@/input/camera'
import { NoiseGenerator } from './generation/noise'
import { TERRAIN_DEFAULTS } from '@/core/config'
import { useTerrainStore } from './stores/terrainStore'
import { useBorderStore } from './stores/borderStore'
import { createFogOfWar } from './view/fogOfWar/fogOfWar'
import { useSessionStore } from '@/core/stores/session'
import { useEntityStore } from '@/entities/state/entityStore'
import { typeRegistry } from '@/entities/data/entityTypeRegistry'
import { watch } from 'vue'
import { CHUNK_GEN_DEFAULTS } from '@/core/config'
import type { WorldApi } from './types'
import type { ContainerApi } from '@/core/types'

export function setupWorld(app: PIXI.Application, containers: ContainerApi, camera: CameraApi) {
    const noise = new NoiseGenerator(TERRAIN_DEFAULTS)
    const terrainGenerator = createChunkGenerator({
        app,
        container: containers.terrainLayer,
        camera,
        noise,
        options: { ...CHUNK_GEN_DEFAULTS, attachTicker: true },
    })

    // Listen for seed changes
    watch(
        () => useTerrainStore().seed,
        (seed) => {
            noise.setSeed(seed)
            terrainGenerator.invalidateAll()
            terrainGenerator.updateVisible()
        }
    )

    // Listen for border size changes
    watch(
        () => useBorderStore().border,
        (border) => {
            if (border) {
                terrainGenerator.invalidateAll()
                terrainGenerator.updateVisible()
            }
        }
    )

    const fogOfWar = createFogOfWar(app, containers.fogLayer, camera, {
        chunkSize: 16,
        darkenAlpha: 0.65,
        unexploredAlpha: 0.7,
        transitionSpeed: 0.1,
    })

    // TODO: Move this ticker into some sort of fog of war file
    app.ticker.add(() => {
        const playerId = useSessionStore().playerId
        if (!playerId) return

        const visionCircles = useEntityStore()
            .all.filter((e) => e.ownerId === playerId && e.pos)
            .map((e) => {
                const t = typeRegistry.get(e.typeId) // TODO: Change from using singleton
                const r = t?.unit?.viewRange ?? t?.building?.viewRange
                if (!r) return null
                const size = t?.size || { w: 1, h: 1 }
                // center of footprint: top-left + width/2 - 0.5
                const centerTx = e.pos.tx + size.w / 2 - 0.5
                const centerTy = e.pos.ty + size.h / 2 - 0.5
                return { tx: centerTx, ty: centerTy, r }
            })
            .filter((c): c is { tx: number; ty: number; r: number } => !!c)

        fogOfWar.updateVisibilityForCircles(visionCircles)
    })

    const destroy = () => {
        terrainGenerator.destroy()
        fogOfWar.destroy()
    }

    const worldApi: WorldApi = {
        updateVisible: terrainGenerator.updateVisible,
        invalidateAll: terrainGenerator.invalidateAll,
        destroy,
    }

    return worldApi
}
