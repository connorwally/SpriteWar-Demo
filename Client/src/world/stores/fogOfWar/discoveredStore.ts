import { defineStore } from 'pinia'

const CHUNK = 16
const BITS = CHUNK * CHUNK
const WORDS = BITS >>> 5

function keyFor(cx: number, cy: number) {
    return `${cx},${cy}`
}

function localIndex(tx: number, ty: number) {
    return (ty & (CHUNK - 1)) * CHUNK + (tx & (CHUNK - 1))
}

export const useDiscoveryStore = defineStore('discovery', {
    state: () => ({
        chunks: new Map<string, Uint32Array>(),
    }),
    actions: {
        isDiscovered(tx: number, ty: number) {
            const cx = Math.floor(tx / CHUNK),
                cy = Math.floor(ty / CHUNK)
            const arr = this.chunks.get(keyFor(cx, cy))
            if (!arr) return false
            const i = localIndex(tx, ty),
                w = i >>> 5,
                b = i & 31
            return ((arr[w] >>> b) & 1) === 1
        },
        markDiscoveredCircle(cxTile: number, cyTile: number, r: number) {
            const eps = 1e-6
            const r2 = (r - 1e-3) * (r - 1e-3)
            const minTx = Math.floor(cxTile - r),
                maxTx = Math.ceil(cxTile + r)
            const minTy = Math.floor(cyTile - r),
                maxTy = Math.ceil(cyTile + r)

            const changed = new Set<string>()

            for (let ty = minTy; ty <= maxTy; ty++) {
                for (let tx = minTx; tx <= maxTx; tx++) {
                    const corners = [
                        [tx - 0.5 - cxTile, ty - 0.5 - cyTile],
                        [tx + 0.5 - cxTile, ty - 0.5 - cyTile],
                        [tx + 0.5 - cxTile, ty + 0.5 - cyTile],
                        [tx - 0.5 - cxTile, ty + 0.5 - cyTile],
                    ]
                    const allInside = corners.every(([dx, dy]) => dx * dx + dy * dy <= r2 + eps)
                    if (!allInside) continue

                    const ccx = Math.floor(tx / CHUNK),
                        ccy = Math.floor(ty / CHUNK)
                    const k = keyFor(ccx, ccy)
                    let arr = this.chunks.get(k)
                    if (!arr) {
                        arr = new Uint32Array(WORDS)
                        this.chunks.set(k, arr)
                    }
                    const i = localIndex(tx, ty),
                        w = i >>> 5,
                        b = i & 31
                    const mask = 1 << b
                    if ((arr[w] & mask) === 0) {
                        arr[w] |= mask
                        changed.add(k)
                    }
                }
            }
            return changed
        },
    },
})
