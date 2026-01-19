<template>
    <!--

    TODO:
    1. Refactor Game.vue modules into respective index files.
    2. Refactor MainScreen.vue into this file.

    Game Display:
    1. Main Menu Screen + HUD - Hide on gameplay
    2. Gameplay Screen + HUD - Show on gameplay
    3. Game Over Screen - On defeat
    -->

    <div ref="container" class="game-container">
        <div class="hud">
            <div class="header">
                <div class="top-left">
                    <Resources />
                </div>
                <div class="top-right">
                    <PlayerCount />
                </div>
            </div>
            <div class="footer">
                <div class="bottom-left">
                    <ContextAction :network="socket" @cancel-training="onCancelTraining" />
                </div>
            </div>
            <GameOver
                v-if="useAppStore().mode === 'defeat'"
                @backToMenu="$emit('exitToMenu')"
                @playAgain="onPlay"
            ></GameOver>
        </div>
    </div>
</template>
<script setup lang="ts">
    import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
    import * as PIXI from 'pixi.js'

    import ContextAction from './hud/context/ContextAction.vue'
    import Resources from './hud/resources/Resources.vue'
    import PlayerCount from './hud/PlayerCount.vue'
    import GameOver from './GameOver.vue'

    import { registerSprites } from '@/entities/view/sprites/spriteAtlas'
    import { registerEntityTypes } from '@/entities/data/entityData'
    import { setupSceneContainers } from '@/core/bootstrap/setupSceneContainers'
    import { useAppStore } from '@/core/stores/app'
    import { useSessionStore } from '@/core/stores/session'
    import { setupSocket } from '@/network/setupSocket'
    import { setupGameState } from '@/core/gameState'
    import { setupWorld } from '@/world'
    import { setupEntities } from '@/entities'
    import { setupInput } from '@/input'
    import { setupCamera } from '@/input/camera'

    //TODO: On Mount
    // Move selection layer from marquee view into centralised container setup
    // Move all input into a single input module.
    // 1. Setup destroy functions for each module

    function setupApp(targetEl: HTMLElement) {
        const app = new PIXI.Application({
            resizeTo: targetEl,
            backgroundColor: 0x0d0d0f,
            antialias: false,
        })
        targetEl.appendChild(app.view as HTMLCanvasElement)

        return app
    }

    const emit = defineEmits<{
        (e: 'exitToMenu'): void
        (e: 'play'): void
    }>()

    const socket = setupSocket()

    const onPlay = () => {
        socket.sendPlay()
        emit('play')
    }

    const onCancelTraining = (payload: { buildingId: string; setIndex: number }) => {
        socket.sendCancelTrain(payload.buildingId, payload.setIndex)
    }

    const container = ref<HTMLDivElement | null>(null)

    PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST
    PIXI.BaseTexture.defaultOptions.mipmap = PIXI.MIPMAP_MODES.OFF

    onMounted(async () => {
        initGame(container.value!)
    })

    function initGame(targetEl: HTMLElement) {
        registerSprites() // TODO: Get actual reference for this and pass where needed.
        registerEntityTypes()
        const app = setupApp(targetEl)
        const containers = setupSceneContainers(app)
        const camera = setupCamera(app, containers)
        const world = setupWorld(app, containers, camera)
        const entities = setupEntities(containers, camera)
        const input = setupInput(app, socket, camera, containers, entities)
        const { stop: stopGameState } = setupGameState()

        const connectedStopWatch = watch(
            () => useSessionStore().connected,
            (connected) => {
                if (connected) {
                    console.log('Connected to server, sending play request')
                    onPlay()
                }
            },
            { immediate: true }
        )

        onBeforeUnmount(() => {
            socket.destroy()
            entities.destroy()
            world.destroy()
            input.destroy()
            connectedStopWatch()
            stopGameState()
            containers.destroy()
            app.destroy(true)
        })
    }
</script>
<style scoped>
    .game-container {
        width: 100%;
        height: 100vh;
        overflow: hidden;
    }
    canvas {
        display: block;
        cursor: grab;
    }
    canvas:active {
        cursor: grabbing;
    }
    .hud {
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10;
    }
    .header {
        left: 0;
        right: 0;
        position: absolute;
        display: flex;
        justify-content: space-between;
        pointer-events: none;
        margin: 16px 32px 16px 32px;
    }

    .footer {
        left: 0;
        right: 0;
        bottom: 0;
        position: absolute;
        display: flex;
        justify-content: space-between;
        margin: 16px 32px 16px 32px;
        pointer-events: none;
    }
</style>
