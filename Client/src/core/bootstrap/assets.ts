import { registerSprites } from '@/entities/view/sprites/spriteAtlas'

export async function preloadViewAssets(opts?: {
    onProgress?: (ratio: number, label?: string) => void
}) {
    opts?.onProgress?.(0.5, 'Entities')
    await registerSprites()
    opts?.onProgress?.(1, 'Done')
    return {}
}
