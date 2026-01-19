<!-- src/components/Resources.vue -->
<template>
    <div class="resources">
        <div class="wood resource">
            <div class="image"></div>
            <span>{{ wood }}</span>
        </div>
        <div class="food resource">
            <div class="image"></div>
            <span>{{ food }}</span>
        </div>
        <div class="stone resource">
            <div class="image"></div>
            <span>{{ stone }}</span>
        </div>
        <div class="population resource">
            <div class="image"></div>
            <span>{{ popUsed }}/ {{ popCap }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { storeToRefs } from 'pinia'
    import { usePlayerStore } from '@/core/stores/player'
    import { computed } from 'vue'
    const { wood, food, stone } = storeToRefs(usePlayerStore())
    const player = usePlayerStore()
    const popUsed = computed(() => player.popUsed)
    const popCap = computed(() => player.popCap)
</script>

<style scoped>
    .resources {
        display: flex;
        flex-direction: row;
        gap: 24px;

        position: relative;
        overflow: visible;
        padding: 10px 25px;
    }

    .resources::before {
        content: '';
        position: absolute;
        inset: 0;
        top: -2px;
        border-width: 16px;
        border-style: solid;
        border-color: transparent;
        border-image-source: url('@/assets/ui/small_section@2x.png');
        border-image-slice: 16 16 16 16 fill;
        border-image-repeat: stretch;
        image-rendering: pixelated;
        pointer-events: none;
        z-index: 0;
    }

    .resources > * {
        position: relative;
        z-index: 1;
    }

    .resource {
        display: flex;
        flex-direction: row;
        gap: 8px;
        font-size: 21px;
        font-weight: bold;
        align-items: center;
    }

    .population {
        width: auto;
    }

    .image {
        width: 32px;
        height: 32px;
        background-size: 100%;
        image-rendering: pixelated;
    }

    .wood .image {
        background-image: url('@/assets/ui/icons/resources/wood@2x.png');
    }

    .stone .image {
        background-image: url('@/assets/ui/icons/resources/stone@2x.png');
    }

    .food .image {
        background-image: url('@/assets/ui/icons/resources/wheat@2x.png');
    }

    .population .image {
        background-image: url('@/assets/ui/icons/buildings/house@2x.png');
    }
</style>
