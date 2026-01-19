import { defineStore } from 'pinia'

export const useSelectionStore = defineStore('selection', {
    state: () => ({
        selectedEntityIds: [] as string[],
        previewEntityIds: [] as string[],
        hoveredEntityIds: [] as string[],
    }),
    actions: {
        setPreviewEntityIds(ids: string[]) {
            this.previewEntityIds = ids
        },
        clearPreviewEntityIds() {
            this.previewEntityIds = []
        },
        setSelectedEntityIds(ids: string[]) {
            this.selectedEntityIds = ids
            console.log('setSelectedEntityIds', ids)
        },
        clearSelectedEntityIds() {
            this.selectedEntityIds = []
        },
        setHoveredEntityIds(ids: string[]) {
            this.hoveredEntityIds = ids
        },
        clearHoveredEntityIds() {
            this.hoveredEntityIds = []
        },
    },
})
