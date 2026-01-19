// ------------------- CAMERA ACTIONS -------------------

export type Tween = {
    t: number
    dur: number
    sx: number
    sy: number
    ss: number
    es?: number
    ex?: number
    ey?: number
    wx?: number
    wy?: number
} | null

// ------------------- KEYBINDINGS -------------------

export interface InputBinding {
    /** The KeyboardEvent.code (e.g., 'Space', 'KeyQ') or .key value */
    code?: string
    mouseButton?: number
    wheel?: 'up' | 'down'
    ctrl?: boolean
    shift?: boolean
    alt?: boolean
    meta?: boolean
}

export const GameAction = {
    Select: 'Select',
    Command: 'Command',
    Pan: 'Pan',

    PanHome: 'PanHome',
    PanLeft: 'PanLeft',
    PanRight: 'PanRight',
    PanUp: 'PanUp',
    PanDown: 'PanDown',
    ZoomIn: 'ZoomIn',
    ZoomOut: 'ZoomOut',

    ContextAction1: 'ContextAction1',
    ContextAction2: 'ContextAction2',
    ContextAction3: 'ContextAction3',
    ContextAction4: 'ContextAction4',
    ContextAction5: 'ContextAction5',
    ContextAction6: 'ContextAction6',
    ContextAction7: 'ContextAction7',
    ContextAction8: 'ContextAction8',
} as const

export type GameAction = (typeof GameAction)[keyof typeof GameAction]

export type KeyBinds = Record<GameAction, InputBinding>

export type InputApi = {
    setHotkey: (action: GameAction, binding: InputBinding) => void
    resetHotkey: (action: GameAction) => void
    resetAllHotkeys: () => void
    destroy: () => void
}
