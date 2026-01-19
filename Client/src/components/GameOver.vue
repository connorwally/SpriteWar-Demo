<script setup lang="ts">
    import Button from '@/components/Button.vue'

    import backIcon from '@/assets/ui/icons/mainmenu@2x.png'
    import playIcon from '@/assets/ui/icons/replay@2x.png'

    const emit = defineEmits<{
        (e: 'backToMenu'): void
        (e: 'playAgain'): void
    }>()

    const onBackToMenu = () => emit('backToMenu')
    const onPlayAgain = () => emit('playAgain')
</script>

<template>
    <div class="game-over-overlay">
        <div class="panel">
            <h2>Game Over</h2>
            <p class="subtitle">Your castle has fallen.</p>

            <div class="actions">
                <Button title="Back to Main Menu" @click="onBackToMenu" :icon="backIcon" />
                <Button title="Play Again" @click="onPlayAgain" :icon="playIcon" />
            </div>
        </div>
    </div>
</template>

<style scoped>
    .game-over-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.6);
        z-index: 20;
        pointer-events: auto;
    }

    .panel {
        position: relative;
        padding: 30px 40px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        align-items: center;
        text-align: center;
    }

    /* same border style as ContextAction.vue `.context::before` */
    .panel::before {
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

    .panel > * {
        position: relative;
        z-index: 1;
    }

    h2 {
        font-size: 32px;
        font-weight: bold;
        margin: 0;
    }

    .subtitle {
        margin: 0;
        opacity: 0.9;
    }

    .actions {
        display: flex;
        flex-direction: row;
        gap: 12px;
        margin-top: 12px;
    }
</style>
