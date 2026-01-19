import * as PIXI from 'pixi.js'
import type { CameraApi } from './camera'
import type { NetworkApi } from '@/network/types'
import { setupKeyboardManager } from './input/keyboard'
import { setupMouseManager } from './input/mouse'
import { setupCameraControls } from './cameraControls'
import type { ContainerApi } from '@/core/types'
import { setupGameControls } from './gameControls'
import type { EntityApi } from '@/entities/types'
import { setupBuildingInput } from './building'

export type InputApi = {
    destroy: () => void
}

export function setupInput(
    app: PIXI.Application,
    network: NetworkApi,
    camera: CameraApi,
    containers: ContainerApi,
    entities: EntityApi
): InputApi {
    const cameraControls = setupCameraControls(app, camera)
    const gameControls = setupGameControls(network, cameraControls, containers)
    const buildingInput = setupBuildingInput(containers, cameraControls)

    const keyboardManager = setupKeyboardManager(cameraControls, buildingInput)
    const mouseManager = setupMouseManager(
        app,
        network,
        cameraControls,
        gameControls,
        entities,
        buildingInput
    )

    const destroy = () => {
        mouseManager.destroy()
        keyboardManager.destroy()
        cameraControls.destroy()
        gameControls.destroy()
    }

    return { destroy }
}
