<template>
    <div class="context-menu" v-if="hasContext">
        <div class="queue" v-if="showQueue">
            <Button
                v-for="(it, idx) in trainingDisplayQueue"
                :key="idx"
                :icon="it.icon"
                :label="String(it.count)"
                :title="it.tooltip"
                :disabled="false"
                @click="onTrainingClick(it, idx)"
            />
        </div>

        <div class="context">
            <div class="header">
                <div
                    v-if="headerIcon"
                    class="image"
                    :style="{ backgroundImage: `url(${headerIcon})` }"
                ></div>
                <span class="name">{{ displayName }}</span>
            </div>

            <div class="context-items" v-for="(row, ri) in actionRows" :key="ri">
                <Button
                    v-for="(it, i) in row"
                    :key="i"
                    :label="it.hotkey"
                    :disabled="!it.action.enabled"
                    :title="it.action.label"
                    :icon="it.action.icon"
                    :pressed="it.idx === heldIndex || it.idx === stickyIndex"
                    @click="onActionClick(it)"
                />
            </div>

            <div class="stats" v-if="hasStats">
                <Stat
                    v-if="stats.baseHP != null"
                    :value="String(stats.baseHP)"
                    :icon="healthIcon"
                />
                <Stat
                    v-if="stats.attackDamage != null && stats.attackDamage > 0"
                    :value="String(stats.attackDamage)"
                    :icon="damageIcon"
                />
                <Stat
                    v-if="stats.attackRange && stats.attackRange > 1"
                    :value="String(stats.attackRange)"
                    :icon="rangeIcon"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import Button from '@/components/Button.vue'
    import Stat from '@/components/hud/context/Stat.vue'
    import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
    import { CONTEXT_ACTION_KEYS, CONTEXT_HOTKEY_EVENT } from '@/core/config'

    import healthIcon from '@/assets/ui/icons/stats/health@2x.png'
    import damageIcon from '@/assets/ui/icons/stats/damage@2x.png'
    import rangeIcon from '@/assets/ui/icons/stats/range@2x.png'

    import { useSelectionStore } from '@/input/state/selectionStore'
    import { useEntityStore } from '@/entities/state/entityStore'
    import { typeRegistry } from '@/entities/data/entityTypeRegistry'
    import { getActionsForEntityType, type ContextAction } from '@/entities/contextActions'
    import type { NetworkApi } from '@/network/types'
    import type { Entity } from '@/entities/types'
    import { useBuildingStore } from '@/input/state/buildingStore'
    import { GameHotkeys } from '@/input/hotkeys'
    import { GameAction } from '@/input/types'

    const props = defineProps<{
        network: NetworkApi
    }>()

    const emit = defineEmits<{
        (e: 'cancel-training', payload: { buildingId: string; setIndex: number }): void
    }>()

    function iconForType(typeId: string): string | undefined {
        return typeRegistry.get(typeId)?.ui?.icon
    }

    const CONTEXT_ACTIONS: GameAction[] = [
        GameAction.ContextAction1,
        GameAction.ContextAction2,
        GameAction.ContextAction3,
        GameAction.ContextAction4,
        GameAction.ContextAction5,
        GameAction.ContextAction6,
        GameAction.ContextAction7,
        GameAction.ContextAction8,
    ]

    function keyCodeToPrettyKey(code: string): string {
        if (code.startsWith('Key') && code.length === 4) return code.slice(3)
        if (code.startsWith('Digit') && code.length === 5) return code.slice(5)
        if (code.startsWith('Numpad') && code.length === 6) return code.slice(6)
        if (code.startsWith('Arrow') && code.length === 5) return code.slice(5)
        if (code.startsWith('Space')) return 'Space'
        if (code.startsWith('Enter')) return 'Enter'
        if (code.startsWith('Escape')) return 'Escape'
        if (code.startsWith('Backspace')) return 'Backspace'
        if (code.startsWith('Delete')) return 'Delete'
        if (code.startsWith('Tab')) return 'Tab'
        if (code.startsWith('CapsLock')) return 'CapsLock'
        if (code.startsWith('Shift')) return 'Shift'
        return code
    }

    function bindingToLabel(action: GameAction): string {
        const b = GameHotkeys[action]
        if (!b) return ''
        const parts: string[] = []
        if (b.ctrl) parts.push('Ctrl')
        if (b.shift) parts.push('Shift')
        if (b.alt) parts.push('Alt')
        if (b.meta) parts.push('Meta')
        if (b.code) parts.push(keyCodeToPrettyKey(b.code))
        else if (b.mouseButton != null) parts.push(`M${b.mouseButton + 1}`)
        else if (b.wheel != null) parts.push(b.wheel === 'up' ? 'Wheel↑' : 'Wheel↓')

        return parts.join('+')
    }

    const selectionStore = useSelectionStore()
    const buildingStore = useBuildingStore()
    const entityStore = useEntityStore()

    // UI-only “focus” for multi-type selections. Does NOT change selected ids.
    const focusedTypeId = ref<string | null>(null)

    type Group = {
        typeId: string
        label: string
        count: number
        memberIds: string[]
    }

    const selectedEntities = computed<Entity[]>(() => {
        const out: Entity[] = []
        for (const id of selectionStore.selectedEntityIds) {
            const e = entityStore.byId.get(id)
            if (e) out.push(e)
        }
        return out
    })

    const groups = computed<Group[]>(() => {
        const byType = new Map<string, Entity[]>()
        for (const e of selectedEntities.value) {
            const arr = byType.get(e.typeId)
            if (arr) arr.push(e)
            else byType.set(e.typeId, [e])
        }

        return Array.from(byType.entries()).map(([typeId, ents]) => {
            const t = typeRegistry.get(typeId)
            const base = t?.label ?? typeId
            const count = ents.length
            const label = count === 1 ? base : `${count}x ${base}`
            return { typeId, label, count, memberIds: ents.map((e) => e.id) }
        })
    })

    // Keep focusedTypeId stable, but ensure it remains valid as selection changes.
    watch(
        () => groups.value.map((g) => g.typeId).join('|'),
        () => {
            const g = groups.value
            if (g.length <= 1) {
                focusedTypeId.value = null
                return
            }
            const stillExists = g.some((x) => x.typeId === focusedTypeId.value)
            if (!stillExists) focusedTypeId.value = g[0]?.typeId ?? null
        },
        { immediate: true }
    )

    const focusedGroup = computed(() => {
        const g = groups.value
        if (g.length <= 1) return null
        return g.find((x) => x.typeId === focusedTypeId.value) ?? g[0] ?? null
    })

    const primaryEntity = computed<Entity | null>(() => {
        const ents = selectedEntities.value
        if (ents.length === 0) return null
        const fg = focusedGroup.value
        if (!fg) return ents[0]

        // pick first entity of the focused type
        const e = ents.find((x) => x.typeId === fg.typeId)
        return e ?? ents[0]
    })

    const selectedType = computed(() => {
        const e = primaryEntity.value
        return e ? typeRegistry.get(e.typeId) : null
    })

    const displayName = computed(() => {
        const g = groups.value
        const total = selectedEntities.value.length
        if (total === 0) return ''
        if (g.length > 1) return `${total}x Units`
        // single-type
        const only = g[0]
        return only?.label ?? selectedType.value?.label ?? selectedType.value?.id ?? ''
    })

    const stats = computed(() => {
        const t = selectedType.value
        if (!t) return { baseHP: undefined, attackDamage: undefined, attackRange: undefined }
        const baseHP = t.unit?.baseHP ?? t.building?.baseHP
        const attackDamage = t.unit?.attackDamage ?? t.building?.attackDamage
        const attackRange = t.unit?.attackRange ?? t.building?.attackRange
        return { baseHP, attackDamage, attackRange }
    })

    const hasStats = computed(() => {
        const s = stats.value
        return (
            s.baseHP != null ||
            (s.attackDamage != null && s.attackDamage > 0) ||
            (s.attackRange != null && s.attackRange > 1)
        )
    })

    // Adapter expected by getActionsForEntityType()
    const send = (cmd: any) => {
        switch (cmd?.t) {
            case 'train':
                return props.network.sendTrain(
                    cmd.d?.entityId ?? cmd.entityId,
                    cmd.d?.unitTypeId ?? cmd.unitTypeId
                )
            case 'build':
                return props.network.sendBuild(
                    cmd.d?.buildingTypeId ?? cmd.buildingTypeId,
                    cmd.d?.tx ?? cmd.tx,
                    cmd.d?.ty ?? cmd.ty
                )
            case 'move':
                return props.network.sendMove(
                    cmd.d?.unitId ?? cmd.unitId,
                    cmd.d?.tx ?? cmd.tx,
                    cmd.d?.ty ?? cmd.ty
                )
            case 'target':
                return props.network.sendTarget(
                    cmd.d?.unitId ?? cmd.unitId,
                    cmd.d?.targetUnitId ?? cmd.targetUnitId
                )
            default:
                return
        }
    }

    const derivedActions = computed<ContextAction[]>(() => {
        const e = primaryEntity.value
        if (!e) return []
        return getActionsForEntityType(e, send, typeRegistry)
    })

    // Header icon only for single-type selection
    const headerIcon = computed(() => {
        if (groups.value.length > 1) return null
        return selectedType.value?.ui?.icon ?? null
    })

    const hasContext = computed(() => selectedEntities.value.length > 0)

    // Training queue display (unchanged behavior)
    const training = computed(() => {
        const e = primaryEntity.value as any
        return e?.training ?? null
    })

    type TrainingDisplayItem = {
        typeId: string
        icon?: string
        label: string
        count: number
        inProgress: boolean
        tooltip: string
    }

    const trainingDisplayQueue = computed<TrainingDisplayItem[]>(() => {
        const t = training.value
        const st = selectedType.value
        if (!t || !st || st.category !== 'building') return []

        const ids: string[] = []
        if (t.currentTypeId) ids.push(t.currentTypeId)
        if (Array.isArray(t.queue)) ids.push(...t.queue)
        if (ids.length === 0) return []

        const items: TrainingDisplayItem[] = []
        let lastTypeId: string | null = null
        let count = 0
        let isFirstSet = true

        const flush = () => {
            if (!lastTypeId || count <= 0) return
            const tt = typeRegistry.get(lastTypeId)
            const labelBase = tt?.label ?? lastTypeId
            const tooltip = `${count}x ${labelBase}`
            const inProgress = isFirstSet && !!t.currentTypeId && lastTypeId === t.currentTypeId

            items.push({
                typeId: lastTypeId,
                icon: tt?.ui?.icon ?? iconForType(lastTypeId) ?? undefined,
                label: labelBase,
                count,
                inProgress,
                tooltip,
            })

            isFirstSet = false
        }

        for (const typeId of ids) {
            if (lastTypeId === null) {
                lastTypeId = typeId
                count = 1
            } else if (typeId === lastTypeId) {
                count++
            } else {
                flush()
                if (items.length >= 5) return items
                lastTypeId = typeId
                count = 1
            }
        }
        flush()

        return items.slice(0, 5)
    })

    function onTrainingClick(_item: TrainingDisplayItem, index: number) {
        const b = primaryEntity.value as any
        if (!b || !b.id) return
        emit('cancel-training', { buildingId: b.id, setIndex: index })
    }

    const showQueue = computed(() => trainingDisplayQueue.value.length > 0)

    function chunk<T>(arr: T[], size: number): T[][] {
        const out: T[][] = []
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
        return out
    }

    const heldIndex = ref<number | null>(null)
    const stickyIndex = ref<number | null>(null)
    const lastTriggerIdx = ref<number | null>(null)

    const flatItems = computed<{ action: ContextAction; idx: number; hotkey: string }[]>(() => {
        const g = groups.value

        // Multi-type selection => row of focus buttons (Q/E/R/...)
        if (g.length > 1) {
            return g.slice(0, CONTEXT_ACTION_KEYS.length).map((group, idx) => ({
                action: {
                    id: 'move' as any, // not actually used; kept to satisfy ContextAction shape
                    label: group.label,
                    icon: iconForType(group.typeId),
                    enabled: true,
                    onClick: () => {
                        // optional: preserve current selection ordering
                        const memberSet = new Set(group.memberIds)
                        const ordered = selectionStore.selectedEntityIds.filter((id) =>
                            memberSet.has(id)
                        )
                        selectionStore.setSelectedEntityIds(
                            ordered.length ? ordered : group.memberIds
                        )
                    },
                },
                idx,
                hotkey: bindingToLabel(CONTEXT_ACTIONS[idx]),
            }))
        }

        // Single-type selection => real actions for the primary entity
        return derivedActions.value
            .filter((a) => a?.enabled)
            .slice(0, CONTEXT_ACTIONS.length)
            .map((a, idx) => ({
                action: a,
                idx,
                hotkey: bindingToLabel(CONTEXT_ACTIONS[idx]),
            }))
    })

    const actionRows = computed(() => {
        if (groups.value.length > 1) return [flatItems.value] // single row
        return chunk(flatItems.value, 4) // 4 per row
    })

    function onActionClick(it: { action: ContextAction; idx: number }) {
        lastTriggerIdx.value = it.idx
        if (buildingStore.isPlacingBuilding) {
            stickyIndex.value = it.action?.id === ('build' as any) ? it.idx : null
        }
        it.action.onClick()
    }

    let hotkeyHandler: ((e: Event) => void) | null = null

    onMounted(() => {
        hotkeyHandler = (e: Event) => {
            const { idx, phase } = (e as CustomEvent).detail as {
                idx: number
                phase: 'down' | 'up'
            }
            if (phase === 'down') {
                heldIndex.value = idx
                lastTriggerIdx.value = idx

                const it = flatItems.value[idx]
                // Trigger the same path as a mouse click, but only if usable
                if (it && it.action.enabled) {
                    onActionClick(it)
                }

                if (buildingStore.isPlacingBuilding) {
                    stickyIndex.value = it?.action?.id === ('build' as any) ? idx : null
                }
            } else {
                if (heldIndex.value === idx) heldIndex.value = null
            }
        }
        document.addEventListener(CONTEXT_HOTKEY_EVENT, hotkeyHandler as EventListener)
    })

    onBeforeUnmount(() => {
        if (hotkeyHandler)
            document.removeEventListener(CONTEXT_HOTKEY_EVENT, hotkeyHandler as EventListener)
        hotkeyHandler = null
    })

    watch(
        () => buildingStore.isPlacingBuilding,
        (placing) => {
            if (placing) {
                const i = lastTriggerIdx.value
                if (i != null) {
                    const it = flatItems.value[i]
                    stickyIndex.value = it?.action?.id === ('build' as any) ? i : null
                }
            } else {
                stickyIndex.value = null
            }
        }
    )
</script>

<style scoped>
    .context-menu {
        display: flex;
        flex-direction: column;
        gap: 10px;

        pointer-events: auto;
    }
    .queue {
        display: flex;
        flex-direction: row;
        gap: 8px;
    }
    .context {
        display: flex;
        flex-direction: column;
        gap: 16px;

        position: relative;
        overflow: visible;
        padding: 25px 30px;

        align-items: center;
    }

    .context::before {
        content: '';
        position: absolute;
        inset: 0;
        top: -2px;
        border-width: 20px;
        border-style: solid;
        border-color: transparent;
        border-image-source: url('@/assets/ui/medium_section@2x.png');
        border-image-slice: 20 20 20 20 fill;
        border-image-repeat: stretch;
        image-rendering: pixelated;
        pointer-events: none;
        z-index: 0;
    }

    .context > * {
        position: relative;
        z-index: 1;
    }

    .header {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 10px;
        font-size: 32px;
        font-weight: bold;
    }

    .image {
        width: 32px;
        height: 32px;
        background-size: 32px 32px;
        background-repeat: no-repeat;
        background-position: center;
    }

    .context-items {
        display: flex;
        flex-direction: row;
        gap: 7px;
    }

    .stats {
        display: flex;
        flex-direction: row;
        gap: 7px;
    }
</style>
