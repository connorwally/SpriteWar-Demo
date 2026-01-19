// src/setupSocket.ts
import { onBeforeUnmount } from 'vue'
import { useSessionStore } from '@/core/stores/session'
import { usePlayerStore } from '@/core/stores/player'
import { useEntityStore } from '@/entities/state/entityStore'
import { useTerrainStore } from '@/world/stores/terrainStore'
import { useFogOfWarStore } from '@/world/stores/fogOfWar/fogOfWarStore'
import type { ServerMessage } from '@/core/types'
import { useBorderStore } from '@/world/stores/borderStore'
import type { NetworkApi } from './types'

type EntityPatch = {
    id: string
    pos?: { tx: number; ty: number }
    typeId?: string
    ownerId?: string
    hp?: number
}

export function setupSocket() {
    const url = (process.env.VITE_WEBSOCKET_URL as string) || 'ws://localhost:5030/ws'

    let ws: WebSocket | null = null
    const session = useSessionStore()
    const player = usePlayerStore()
    const entities = useEntityStore()
    const terrain = useTerrainStore()
    const fogOfWar = useFogOfWarStore()
    const world = useBorderStore()

    // Fog of war is now updated by server-provided chunk visibility messages

    const connect = () => {
        ws = new WebSocket(url)

        ws.onopen = () => {
            session.setConnected(true)
        }

        ws.onerror = (error) => {
            console.error('WebSocket connection error:', error)
        }

        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data) as ServerMessage
            switch (msg.t) {
                case 'start':
                    session.setPlayer(msg.player)
                    player.hydrate(msg.player)
                    fogOfWar.setPlayerId(msg.player.id)
                    entities.clear()
                    entities.upsertMany(msg.entities)
                    terrain.setSeed(msg.terrainSeed)
                    world.setBorder(msg.worldBorder)
                    break
                case 'resource_update':
                    player.setResources(msg.resources)
                    break
                case 'entity_snapshot':
                    entities.upsertMany(msg.entities)
                    break
                case 'entity_add':
                    entities.upsertMany(msg.entities)
                    break
                case 'entity_remove':
                    const entityIds = msg.entityIds
                    entityIds.forEach((id: string) => entities.remove(id))
                    break
                case 'attack':
                    const { attackerId, targetId } = msg as any
                    entities.attack(attackerId, targetId)
                    break
                case 'population_update':
                    player.setPopulation({ popUsed: msg.popUsed, popCap: msg.popCap })
                    break
                case 'entity_patch': {
                    const raw = (msg as any).changes

                    // Keep nested `pos`, drop nulls, and type-narrow away null entries
                    const normalized: EntityPatch[] = Array.isArray(raw)
                        ? raw
                              .map((p: any): EntityPatch | null => {
                                  if (!p || !p.id) return null

                                  const out: EntityPatch = { id: p.id }

                                  // preserve nested pos if present
                                  if (p.pos && typeof p.pos === 'object') {
                                      const { tx, ty } = p.pos
                                      if (typeof tx === 'number' && typeof ty === 'number') {
                                          out.pos = { tx, ty }
                                      }
                                  }

                                  if (p.typeId != null) out.typeId = p.typeId
                                  if (p.ownerId != null) out.ownerId = p.ownerId
                                  if (p.hp != null) out.hp = p.hp

                                  return out
                              })
                              .filter((x): x is EntityPatch => x !== null)
                        : []

                    entities.patchMany(normalized)
                    break
                }
                case 'training_queue':
                    const tmsg = msg as any
                    const training = {
                        queue: Array.isArray(tmsg.queue) ? tmsg.queue.slice(0, 10) : [],
                        currentTypeId: tmsg.currentTypeId ?? null,
                        ticksLeft: typeof tmsg.ticksLeft === 'number' ? tmsg.ticksLeft : 0,
                        totalTicks: typeof tmsg.totalTicks === 'number' ? tmsg.totalTicks : 0,
                    }
                    entities.patch({ id: tmsg.buildingId, training } as any)
                    break
                case 'tick':
                    // optional: drive animations, timers, etc.
                    break
                case 'error':
                    console.warn('Server error:', (msg as any).reason)
                    break
            }
        }

        ws.onclose = () => {
            session.setConnected(false)
            // optional backoff + reconnect
            setTimeout(connect, 1000)
        }
    }

    const sendMove = (unitId: string, tx: number, ty: number) => {
        const payload = { t: 'move', d: { unitId, tx, ty } }
        console.log(payload)
        ws?.send(JSON.stringify(payload))
    }

    const sendTarget = (unitId: string, targetUnitId: string) => {
        const payload = { t: 'target', d: { unitId, targetUnitId } }
        ws?.send(JSON.stringify(payload))
    }

    const sendBuild = (buildingTypeId: string, tx: number, ty: number) => {
        const payload = { t: 'build', d: { buildingTypeId, tx, ty } }
        ws?.send(JSON.stringify(payload))
    }

    const sendTrain = (entityId: string, unitTypeId: string) => {
        const payload = { t: 'train', d: { entityId, unitTypeId } }
        ws?.send(JSON.stringify(payload))
    }

    const sendPlay = () => {
        const payload = { t: 'play' }
        console.log('Sending play request', payload)
        ws?.send(JSON.stringify(payload))
    }

    const sendCancelTrain = (entityId: string, setIndex: number) => {
        const payload = { t: 'cancel_train', d: { entityId, setIndex } }
        ws?.send(JSON.stringify(payload))
    }

    connect()

    const destroy = () => {
        ws?.close()
        ws = null
    }

    const networkApi: NetworkApi = {
        sendMove,
        sendBuild,
        sendTarget,
        sendTrain,
        sendPlay,
        sendCancelTrain,
        destroy,
    }

    return networkApi
}
