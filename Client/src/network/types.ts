export type NetworkApi = {
    sendMove: (unitId: string, tx: number, ty: number) => void
    sendTarget: (unitId: string, targetUnitId: string) => void
    sendBuild: (buildingTypeId: string, tx: number, ty: number) => void
    sendTrain: (entityId: string, unitTypeId: string) => void
    sendPlay: () => void
    sendCancelTrain: (entityId: string, setIndex: number) => void
    destroy: () => void
}
