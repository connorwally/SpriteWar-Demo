import { GameAction, type InputBinding, type KeyBinds } from './types'

// 1. Define Defaults
const DEFAULTS: KeyBinds = {
    // Mouse Interaction
    Select: { mouseButton: 0 },
    Command: { mouseButton: 2 },
    Pan: { mouseButton: 1 },

    // Camera
    PanHome: { code: 'Space' },
    PanLeft: { code: 'ArrowLeft' },
    PanRight: { code: 'ArrowRight' },
    PanUp: { code: 'ArrowUp' },
    PanDown: { code: 'ArrowDown' },
    ZoomIn: { wheel: 'up' },
    ZoomOut: { wheel: 'down' },

    // Context Actions
    ContextAction1: { code: 'KeyQ' },
    ContextAction2: { code: 'KeyE' },
    ContextAction3: { code: 'KeyR' },
    ContextAction4: { code: 'KeyT' },
    ContextAction5: { code: 'KeyZ' },
    ContextAction6: { code: 'KeyX' },
    ContextAction7: { code: 'KeyC' },
    ContextAction8: { code: 'KeyV' },
} as const

// 2. Export Hotkeys
export const GameHotkeys: KeyBinds = { ...DEFAULTS }

/**
 * Updates a specific hotkey binding.
 */
export function setHotkey(action: GameAction, binding: InputBinding) {
    GameHotkeys[action] = binding
}

/**
 * Resets all hotkeys to their default values.
 */
export function resetAllHotkeys() {
    Object.assign(GameHotkeys, DEFAULTS)
}

/**
 * Resets a specific hotkey to its default value.
 * @param action - The action to reset.
 */
export function resetHotkey(action: GameAction) {
    GameHotkeys[action] = DEFAULTS[action]
}

/**
 * Checks if an event matches the binding.
 * Accepts KeyboardEvent, MouseEvent (clicks), or WheelEvent (scroll).
 */
export function matchesInput(event: Event, binding: InputBinding): boolean {
    if (!binding) return false

    // 1. Check Modifiers (common to all events)
    const e = event as KeyboardEvent | MouseEvent
    if (!!binding.ctrl !== e.ctrlKey) return false
    if (!!binding.shift !== e.shiftKey) return false
    if (!!binding.alt !== e.altKey) return false
    if (!!binding.meta !== e.metaKey) return false

    // 2. Check Wheel
    if (binding.wheel && event.type === 'wheel') {
        const we = event as WheelEvent
        if (binding.wheel === 'up' && we.deltaY < 0) return true
        if (binding.wheel === 'down' && we.deltaY > 0) return true
        return false
    }

    // 3. Check Mouse Button (mousedown/mouseup/click)
    // Note: 'click' events often don't reliably report the button in some browsers/frameworks,
    // so usually it's best to check 'mousedown' or 'pointerdown'.
    if (
        binding.mouseButton !== undefined &&
        (event.type.includes('down') || event.type.includes('up') || event.type.includes('click'))
    ) {
        const me = event as MouseEvent
        return me.button === binding.mouseButton
    }

    // 4. Check Keyboard
    if (binding.code && (event.type === 'keydown' || event.type === 'keyup')) {
        const ke = event as KeyboardEvent
        return ke.code === binding.code || ke.key.toLowerCase() === binding.code?.toLowerCase()
    }

    return false
}

/**
 * Helper to get the Context Action index (0-7) from an event.
 */
export function getContextActionIndex(event: KeyboardEvent): number {
    const actions: GameAction[] = [
        GameAction.ContextAction1,
        GameAction.ContextAction2,
        GameAction.ContextAction3,
        GameAction.ContextAction4,
        GameAction.ContextAction5,
        GameAction.ContextAction6,
        GameAction.ContextAction7,
        GameAction.ContextAction8,
    ]

    return actions.findIndex((action) => matchesInput(event, GameHotkeys[action]))
}
