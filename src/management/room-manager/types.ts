export enum RoomStage {
  Initial = 0,
  Basic = 1,
  Intermediate = 2,
  Advanced = 3
}

export interface RoomData {
  ownedRoom: boolean;
  reservedRoom: boolean;
  lastSeen: number;
  rcl?: number;
  sources?: { id: Id<Source>, pos: RoomPosition }[];
  minerals?: { id: Id<Mineral>, pos: RoomPosition, mineralType: MineralConstant }[];
  hostileTime?: number;
  hostileCount?: number;
  hostileStructures?: number;
  expansionScore?: number;
  owner?: string;
} 