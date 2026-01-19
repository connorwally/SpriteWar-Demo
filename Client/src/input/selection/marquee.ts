// Intended filename: src/view/selection/marquee.ts
import * as PIXI from 'pixi.js'
import { TILE_SIZE } from '@/core/config'
import type { TilePos } from '@/core/types'

export type MarqueeApi = {
    startSelection: (tilePos: TilePos) => void
    updateSelection: (tilePos: TilePos) => void
    clearSelection: () => void
    destroy: () => void
}

export function createMarquee(parent: PIXI.Container): MarqueeApi {
    // Single-tile highlight
    const graphic = new PIXI.Graphics()
    graphic.eventMode = 'none'
    parent.addChild(graphic)

    // Marquee art
    const marquee = new PIXI.Container()
    marquee.eventMode = 'none'
    parent.addChild(marquee)

    const marqueeFill = new PIXI.Graphics()
    marquee.addChild(marqueeFill)

    const unitCornersLayer = new PIXI.Container()
    unitCornersLayer.eventMode = 'none'
    parent.addChild(unitCornersLayer)

    const cornerTL = PIXI.Sprite.from('/ui/marquee/corner-tl.png')
    const cornerTR = PIXI.Sprite.from('/ui/marquee/corner-tr.png')
    const cornerBL = PIXI.Sprite.from('/ui/marquee/corner-bl.png')
    const cornerBR = PIXI.Sprite.from('/ui/marquee/corner-br.png')

    for (const s of [cornerTL, cornerTR, cornerBL, cornerBR]) {
        s.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST
        s.texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF
    }

    cornerTL.visible = cornerTR.visible = cornerBR.visible = cornerBL.visible = false
    marquee.addChild(cornerTL, cornerTR, cornerBL, cornerBR)

    const drawMarquee = (rect: { minTile: TilePos; maxTile: TilePos }) => {
        if (rect.minTile.tx === rect.maxTile.tx && rect.minTile.ty === rect.maxTile.ty) {
            return
        }

        marqueeFill.clear()

        const x = rect.minTile.tx * TILE_SIZE
        const y = rect.minTile.ty * TILE_SIZE
        const w = (rect.maxTile.tx - rect.minTile.tx + 1) * TILE_SIZE
        const h = (rect.maxTile.ty - rect.minTile.ty + 1) * TILE_SIZE

        const trW = cornerTR.width
        const blH = cornerBL.height
        const brW = cornerBR.width,
            brH = cornerBR.height

        cornerTL.position.set(x, y)
        cornerTR.position.set(x + w - trW, y)
        cornerBL.position.set(x, y + h - blH)
        cornerBR.position.set(x + w - brW, y + h - brH)

        cornerTL.visible = cornerTR.visible = cornerBR.visible = cornerBL.visible = true
    }

    let startingPosition: TilePos = { tx: 0, ty: 0 }
    const startSelection = (tilePos: TilePos) => {
        startingPosition = tilePos
        clearSelection()
    }

    const updateSelection = (tilePos: TilePos) => {
        const rect = {
            minTile: {
                tx: Math.min(startingPosition.tx, tilePos.tx),
                ty: Math.min(startingPosition.ty, tilePos.ty),
            },
            maxTile: {
                tx: Math.max(startingPosition.tx, tilePos.tx),
                ty: Math.max(startingPosition.ty, tilePos.ty),
            },
        }
        drawMarquee(rect)
    }

    const clearSelection = () => {
        cornerTL.visible = cornerTR.visible = cornerBL.visible = cornerBR.visible = false
        graphic.clear()
    }

    const destroy = () => {
        graphic.destroy(true)
        marquee.destroy(true)
        unitCornersLayer.destroy(true)
    }

    return {
        startSelection,
        updateSelection,
        clearSelection,
        destroy,
    }
}
