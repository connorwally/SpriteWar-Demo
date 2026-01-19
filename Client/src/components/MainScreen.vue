<template>
    <div class="main-screen">
        <!-- Background -->
        <div ref="bgContainer" class="bg"></div>

        <!-- UI -->
        <div class="overlay">
            <h1 class="title">
                SPRITE<br />
                WAR
            </h1>
            <button
                @click="start"
                :class="{ 'kbd-pressed': isKeyboardPressed }"
                :aria-pressed="isKeyboardPressed ? 'true' : 'false'"
            >
                Play >
            </button>
            <footer>
                <div class="footer-left">
                    <span class="copyright">
                        <span class="symbol">© 2026 </span>
                        Connor Wallis
                    </span>
                    <span class="splitter"> / </span>
                    <span class="assets">
                        Art by
                        <a
                            class="shade-link"
                            href="https://merchant-shade.itch.io/"
                            target="_blank"
                            rel="noopener"
                            >Shade
                        </a>
                    </span>
                </div>
                <span class="version"> v0.1.0 </span>
            </footer>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ref, onMounted, onBeforeUnmount } from 'vue'
    import { preloadViewAssets } from '@/core/bootstrap/assets.ts'
    import { initMenuBackground } from '@/core/bootstrap/mainmenu/menuBackground.ts'

    const emit = defineEmits<{ (e: 'start'): void }>()

    const bgContainer = ref<HTMLDivElement | null>(null)

    const isLoading = ref(true)
    const loadLabel = ref('Loading...')
    const loadRatio = ref(0)

    const isKeyboardPressed = ref(false)
    let removeKeyHandler: (() => void) | null = null

    let teardown: (() => void) | null = null

    onMounted(async () => {
        await preloadViewAssets({
            onProgress: (ratio, label) => {
                isLoading.value = ratio < 1
                loadRatio.value = ratio
                if (label) loadLabel.value = label
            },
        })

        const handle = initMenuBackground(bgContainer.value!)
        teardown = handle.destroy
        isLoading.value = false

        const onKeyDown = (e: KeyboardEvent) => {
            if (isLoading.value || e.repeat) return
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (!isKeyboardPressed.value) isKeyboardPressed.value = true
            }
        }
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                const wasPressed = isKeyboardPressed.value
                isKeyboardPressed.value = false
                if (!isLoading.value && wasPressed) start()
            }
        }
        const onBlur = () => {
            isKeyboardPressed.value = false
        }

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('blur', onBlur)
        removeKeyHandler = () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('blur', onBlur)
        }
    })

    onBeforeUnmount(() => {
        teardown?.()
        teardown = null
        removeKeyHandler?.()
        removeKeyHandler = null
    })

    function start() {
        if (isLoading.value) return
        emit('start')
    }
</script>

<style scoped>
    .main-screen {
        position: relative;
        width: 100%;
        height: 100vh;
        overflow: hidden;
    }
    .bg {
        position: absolute;
        inset: 0;
    }
    .overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        place-content: center;
        gap: clamp(12px, 6.6vh, 60px); /* shrink gap on smaller screens */
        pointer-events: none;
        padding: 24px;
    }
    .title {
        --title-stroke: clamp(4px, 0.12em, 11px);
        color: var(--color-tertiary);
        text-shadow:
            calc(-1 * var(--title-stroke)) 0 0 var(--color-primary, #000),
            var(--title-stroke) 0 0 var(--color-primary, #000),
            0 calc(-1 * var(--title-stroke)) 0 var(--color-primary, #000),
            0 var(--title-stroke) 0 var(--color-primary, #000),
            calc(-1 * var(--title-stroke)) calc(-1 * var(--title-stroke)) 0
                var(--color-primary, #000),
            var(--title-stroke) calc(-1 * var(--title-stroke)) 0 var(--color-primary, #000),
            calc(-1 * var(--title-stroke)) var(--title-stroke) 0 var(--color-primary, #000),
            var(--title-stroke) var(--title-stroke) 0 var(--color-primary, #000);
        font-size: clamp(60px, 12vh, 96px);
        text-align: center;
        margin: 0 0 12px 0;
        line-height: 1;
        letter-spacing: 0.08em;
        pointer-events: auto;
        user-select: none;
    }

    button {
        position: relative;
        background: none;
        cursor: pointer;
        transition:
            transform 0.05s ease,
            opacity 0.2s;
        pointer-events: auto;

        /* Font */
        font-family: inherit;
        font-size: clamp(18px, 4vh, 32px);
        font-weight: bold;
        color: var(--color-primary);

        /* 9-slice */
        border-width: 4px 6px 12px 6px;
        border-style: solid;
        border-color: transparent;
        border-image-source: url('@/assets/ui/button_small@2x.png');
        border-image-slice: 4 6 12 6 fill; /* same slice size as above */
        border-image-repeat: stretch; /* tile edges if needed (use 'stretch' if preferred) */
    }
    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    button:active {
        border-image-source: url('@/assets/ui/button_small_depressed@2x.png');
        border-width: 8px 6px 8px 6px;
        border-image-slice: 8 6 8 6 fill; /* same slice size as above */
    }
    button.kbd-pressed {
        border-image-source: url('@/assets/ui/button_small_depressed@2x.png');
        border-width: 8px 6px 8px 6px;
        border-image-slice: 8 6 8 6 fill; /* same slice size as above */
    }
    footer {
        font-weight: 500;
        font-size: clamp(12px, 2.2vh, 20px); /* responsive */
        color: var(--color-primary);
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .footer-left {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .symbol {
        font-family: 'Alvetica', 'Arial', sans-serif;
        font-size: clamp(12px, 2.2vh, 20px); /* responsive */
        font-weight: bold;
    }
    .splitter {
        color: var(--color-secondary);
    }
    .shade-link {
        pointer-events: auto;
        color: var(--color-primary);
    }
</style>
