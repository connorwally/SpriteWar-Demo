<template>
    <button
        type="button"
        :disabled="disabled"
        :class="{ 'kbd-pressed': isKeyboardPressed || pressed }"
        @click="onClick"
        @keydown="onKeyDown"
        @keyup="onKeyUp"
        @blur="isKeyboardPressed = false"
    >
        <div v-if="icon" class="icon" :style="{ backgroundImage: `url(${icon})` }"></div>
        <div v-if="label" class="label">{{ label }}</div>
    </button>
</template>

<script setup lang="ts">
    import { ref } from 'vue'

    const props = withDefaults(
        defineProps<{
            icon?: string
            label?: string
            disabled?: boolean
            pressed?: boolean
        }>(),
        {
            icon: undefined,
            label: undefined,
            disabled: false,
            pressed: false,
        }
    )

    const emit = defineEmits<{
        (e: 'click', ev: MouseEvent): void
    }>()

    const isKeyboardPressed = ref(false)

    function onClick(ev: MouseEvent) {
        if (props.disabled) return
        emit('click', ev)
    }

    function onKeyDown(e: KeyboardEvent) {
        if (props.disabled || e.repeat) return
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!isKeyboardPressed.value) isKeyboardPressed.value = true
        }
    }

    function onKeyUp(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            isKeyboardPressed.value = false
        }
    }
</script>

<style scoped>
    button {
        width: 40px;
        height: 40px;
        overflow: visible; /* let the icon extend outside the background */
        position: relative;
        background: none;
        cursor: pointer;
        transition:
            transform 0.05s ease,
            opacity 0.2s;
        pointer-events: auto;
        display: grid;
        place-items: center;

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
    button:active {
        border-image-source: url('@/assets/ui/button_small_depressed@2x.png');
        border-width: 8px 6px 8px 6px;
        border-image-slice: 8 6 8 6 fill; /* same slice size as above */
    }
    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    button.kbd-pressed {
        border-image-source: url('@/assets/ui/button_small_depressed@2x.png');
        border-width: 8px 6px 8px 6px;
        border-image-slice: 8 6 8 6 fill;
    }
    .icon {
        pointer-events: none;
        width: clamp(18px, 4vh, 32px);
        aspect-ratio: 1 / 1;
        background: center / contain no-repeat;
        transition: transform 0.05s ease;
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -65%);
    }
    button:active .icon,
    button.kbd-pressed .icon {
        transform: translate(-50%, -62.5%);
    }
    .label {
        position: absolute;
        right: -8px;
        bottom: -22px;
        font-size: 20px;
        color: var(--color-tertiary);
        outline-width: thick;
        pointer-events: none;
        user-select: none;
        text-shadow:
            -3px 0 0 var(--color-primary, #0000),
            3px 0 0 var(--color-primary, #0000),
            0 -3px 0 var(--color-primary, #0000),
            0 3px 0 var(--color-primary, #0000),
            -3px -3px 0 var(--color-primary, #0000),
            -3px 3px 0 var(--color-primary, #0000),
            3px -3px 0 var(--color-primary, #0000),
            3px 3px 0 var(--color-primary, #0000);
    }
</style>
