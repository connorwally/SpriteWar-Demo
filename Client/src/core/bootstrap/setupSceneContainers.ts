import * as PIXI from 'pixi.js'
import type { ContainerApi } from '../types'

export function setupSceneContainers(app: PIXI.Application) {
    // Scene graph
    const gridContainer = new PIXI.Container()
    const layers: PIXI.Container[] = []

    const terrainLayer = new PIXI.Container()
    terrainLayer.eventMode = 'static'
    layers.push(terrainLayer)

    const buildingsLayer = new PIXI.Container()
    buildingsLayer.eventMode = 'static'
    layers.push(buildingsLayer)

    const unitsLayer = new PIXI.Container()
    unitsLayer.sortableChildren = true
    unitsLayer.eventMode = 'static'
    layers.push(unitsLayer)

    const resourcesLayer = new PIXI.Container()
    resourcesLayer.eventMode = 'static'
    layers.push(resourcesLayer)

    const fogLayer = new PIXI.Container()
    fogLayer.eventMode = 'none'
    layers.push(fogLayer)

    const overlayLayer = new PIXI.Container()
    overlayLayer.eventMode = 'none'
    layers.push(overlayLayer)

    const uiLayer = new PIXI.Container()
    uiLayer.eventMode = 'static'
    layers.push(uiLayer)

    gridContainer.addChild(...layers)
    app.stage.addChild(gridContainer)

    app.stage.eventMode = 'static' // (set once)

    const destroy = () => {
        gridContainer.destroy({ children: true })
        terrainLayer.destroy({ children: true })
        buildingsLayer.destroy({ children: true })
        unitsLayer.destroy({ children: true })
        resourcesLayer.destroy({ children: true })
        fogLayer.destroy({ children: true })
        overlayLayer.destroy({ children: true })
        uiLayer.destroy({ children: true })
    }

    const containerApi: ContainerApi = {
        gridContainer,
        terrainLayer,
        buildingsLayer,
        unitsLayer,
        resourcesLayer,
        fogLayer,
        overlayLayer,
        uiLayer,
        destroy,
    }

    return containerApi
}
