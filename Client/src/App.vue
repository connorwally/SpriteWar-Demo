<script setup lang="ts">
    import { ref } from 'vue'
    import MainScreen from './components/MainScreen.vue'
    import { useAppStore } from '@/core/stores/app'
    import Game from './components/Game.vue'

    const started = ref(false)
    const appStore = useAppStore()

    function handleStart() {
        started.value = true
        appStore.setMode('gameplay')
    }

    function handleExitToMenu() {
        started.value = false
        appStore.setMode('menu')
    }
</script>

<template>
    <div id="app">
        <MainScreen v-if="!started" @start="handleStart" />
        <Game v-else @exitToMenu="handleExitToMenu" @play="handleStart" />
    </div>
</template>

<style scoped>
    #app {
        position: relative;
        width: 100%;
        height: 100vh;
        overflow: hidden;
    }

    .auth-required h2 {
        margin-bottom: 1rem;
        font-size: 2rem;
    }

    .auth-required p {
        font-size: 1.2rem;
        opacity: 0.8;
    }
</style>
