import type { EntityType } from '@/entities/types'

export type TypeRegistryApi = {
    get: (id: string) => EntityType | null
    register: (entityType: EntityType) => void
    all: () => EntityType[]
    clear: () => void
}

function setupTypeRegistry(): TypeRegistryApi {
    const map = new Map<string, EntityType>()

    const register = (entityType: EntityType) => {
        map.set(entityType.id, entityType)
    }

    const get = (id: string) => {
        return map.get(id) ?? null
    }

    const all = () => {
        return Array.from(map.values())
    }

    const clear = () => {
        map.clear()
    }

    return {
        get,
        register,
        all,
        clear,
    }
}

export const typeRegistry = setupTypeRegistry()
