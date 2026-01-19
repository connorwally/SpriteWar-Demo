<template>
    <div class="stat">
        <div v-if="icon" class="icon" :style="{ backgroundImage: `url(${icon})` }"></div>
        <div v-if="value" class="value">{{ value }}</div>
    </div>
</template>

<script setup lang="ts">
    withDefaults(
        defineProps<{
            icon?: string
            value?: string
            disabled?: boolean
        }>(),
        {
            icon: undefined,
            value: undefined,
            disabled: false,
        }
    )
</script>

<style scoped>
    .stat {
        display: flex;
        flex-direction: row;
        gap: 4px;
        align-items: center;
    }

    .icon {
        width: 32px;
        height: 32px;
    }

    .value {
        font-size: 20px;
        font-weight: normal;
        color: var(--color-primary);
    }
</style>
