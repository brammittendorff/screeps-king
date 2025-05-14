interface RoomMemory {
  adjacentRooms?: {
    [roomName: string]: {
      status: string;
    };
  };
  emergency?: boolean;
  lastControllerProgress?: number;
  lastControllerTick?: number;
  lastConstructionProgress?: number;
  lastConstructionTick?: number;
  lastEnergy?: number;
  lastEnergyTick?: number;
  lastRemoteHarvest?: number;
}

interface CreepMemory {
  idle?: boolean;
} 