import { defineStore } from 'pinia'
import type { EntityType } from '@/entities/types'

export const useBuildingStore = defineStore('building', {
    state: () => ({
        // Building placement state
        isPlacingBuilding: false,
        placingBuildingType: null as EntityType | null,
        buildingMenuVisible: false,
    }),
    actions: {
        // Building placement actions
        startBuildingPlacement(buildingType: EntityType) {
            this.isPlacingBuilding = true
            this.placingBuildingType = buildingType
            this.buildingMenuVisible = false
        },
        cancelBuildingPlacement() {
            this.isPlacingBuilding = false
            this.placingBuildingType = null
        },
        showBuildingMenu() {
            this.buildingMenuVisible = true
            this.cancelBuildingPlacement()
        },
        hideBuildingMenu() {
            this.buildingMenuVisible = false
        },
    },
})
