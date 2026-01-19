import type { ContainerApi } from '@/core/types'
import type { CameraApi } from '@/input/camera'
import { typeRegistry } from '@/entities/data/entityTypeRegistry'
import { entityView } from './view/entitiesView'
import { setupSelectionOutlines } from './view/outline'
import { setupHealthBars } from './view/healthbars'
import type { EntityApi } from './types'

export function setupEntities(containers: ContainerApi, camera: CameraApi) {
    const entities = entityView(
        {
            buildingsLayer: containers.buildingsLayer!,
            unitsLayer: containers.unitsLayer!,
            resourcesLayer: containers.resourcesLayer!,
        },
        typeRegistry
    )

    const outlines = setupSelectionOutlines({
        camera: camera as CameraApi & { scale: number },
        displays: entities.displays,
        color: 0xffffff,
        pixelWidth: 2,
    })

    // Set up healthbars using the overlay layer.
    const healthbars = setupHealthBars({
        displays: entities.displays,
        parent: containers.overlayLayer!,
        typeRegistry,
    })

    const destroy = () => {
        outlines.destroy()
        healthbars.destroy()
        entities.destroy()
    }

    const entityApi: EntityApi = {
        displays: entities.displays,
        destroy,
    }

    return entityApi
}
