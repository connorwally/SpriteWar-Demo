<!-- src/components/Resources.vue -->
<template>
    <div class="playercount">
        <span>7/100</span>
        <div class="image"></div>
    </div>
</template>

<script setup lang="ts"></script>

<style scoped>
    .playercount {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 2px;
        position: relative;
        overflow: visible;
        padding: 12px 16px 10px 20px;
        font-size: 20px;
        font-weight: bold;
    }

    .playercount::before {
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

    .playercount > * {
        position: relative;
        z-index: 1;
    }

    .image {
        width: 32px;
        height: 32px;
        background-repeat: no-repeat;
        background-position: center;
        background-size: 100%;
        image-rendering: pixelated;
    }

    .playercount .image {
        background-image: url('@/assets/ui/icons/playercount@2x.png');
    }
</style>
