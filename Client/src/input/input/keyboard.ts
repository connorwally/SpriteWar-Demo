// File: src/input/keyboard.ts

import { useAppStore } from '@/core/stores/app'
import { GameHotkeys, matchesInput, getContextActionIndex } from '../hotkeys'
import type { CameraControlsApi } from '../cameraControls'
import { CONTEXT_HOTKEY_EVENT } from '@/core/config' // <-- add this
import type { BuildingInputApi } from '../building'

// Helper to ignore input when typing
const isTyping = (e: Event) => {
    const target = e.target as HTMLElement
    return (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    )
}

export function setupKeyboardManager(
    cameraControls: CameraControlsApi,
    buildingInput: BuildingInputApi
) {
    const appStore = useAppStore()

    const dispatchContextHotkey = (idx: number, phase: 'down' | 'up') => {
        document.dispatchEvent(
            new CustomEvent(CONTEXT_HOTKEY_EVENT, {
                detail: { idx, phase },
            })
        )
    }

    const onKeyDown = (e: KeyboardEvent) => {
        if (appStore.mode !== 'gameplay') return
        if (isTyping(e)) return

        buildingInput?.onKeyDown(e)

        const ctxIdx = getContextActionIndex(e)
        if (ctxIdx !== -1) {
            if (!e.repeat) dispatchContextHotkey(ctxIdx, 'down')
            e.preventDefault()
            return
        }

        if (matchesInput(e, GameHotkeys.PanHome)) {
            cameraControls.panToHome()
            e.preventDefault()
        }
    }

    const onKeyUp = (e: KeyboardEvent) => {
        if (appStore.mode !== 'gameplay') return
        if (isTyping(e)) return

        const ctxIdx = getContextActionIndex(e)
        if (ctxIdx !== -1) {
            dispatchContextHotkey(ctxIdx, 'up')
            e.preventDefault()
        }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    const destroy = () => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
    }

    return { destroy }
}
