import { useEntityStore } from '@/entities/state/entityStore'
import { useSessionStore } from '@/core/stores/session'
import { useAppStore } from '@/core/stores/app'
import { typeRegistry } from '@/entities/data/entityTypeRegistry'

export const setupGameState = () => {
    const entityStore = useEntityStore()
    const sessionStore = useSessionStore()
    const appStore = useAppStore()

    entityStore.$onAction(({ name, args }) => {
        if (name !== 'remove') return

        const id = args[0] as string | undefined
        if (!id) return

        const entity = entityStore.byId.get(id)
        if (!entity) return

        const playerId = sessionStore.playerId
        if (!playerId) return

        if (entity.ownerId !== playerId) return

        const t = typeRegistry.get(entity.typeId)
        if (!t || t.id !== 'Castle') return

        if (appStore.mode !== 'defeat') {
            appStore.setMode('defeat')
        }
    })

    return { stop }
}
