// Type definitions for memory objects

interface CreepMemory {
  role: string;
  state?: string;
  working?: boolean;
  targetId?: Id<any>;
  buildMode?: number;
  activity?: string;
  initiated?: boolean;
  sourceId?: Id<Source>;
  targetSourceId?: Id<Source>;
  version?: number;
  path?: string;
  task?: TaskData;

  // Multi-room properties
  homeRoom?: string;        // The room this creep was spawned in or is assigned to
  targetRoom?: string;      // The room this creep should work in (may be different from homeRoom)
  assignment?: string;      // Special assignment for this creep (e.g., 'reserve', 'remote_harvest')
  stage?: number;           // Creep's current task sequence stage
}

interface RoomMemory {
  version?: number;
  stage?: number;
  template?: string;
  ticks?: number;
  harvesters?: number;
  upgraders?: number;
  hostiles?: any[];
  hostilesCount?: number;
  structures?: number;
  spawns?: number;
  constructions?: number;
  sources?: {
    [id: string]: {
      id: Id<Source>;
      pos: {
        x: number;
        y: number;
        roomName: string;
      };
    };
  };
  buildId?: string;
  lastBuildLog?: number;
  constructionQueue?: any[];
  buildFlags?: any;
  buildState?: any;
  initialized?: boolean;
  energy?: {
    available?: number;
    capacity?: number;
    storage?: number;
    terminal?: number;
  };
  fillTargets?: Id<Structure>[];
  collectTargets?: Id<StructureContainer>[];
}

interface Memory {
  creeps: { [name: string]: CreepMemory };
  rooms: { [name: string]: RoomMemory };
  buildId?: string;
  lastBuildLog?: number;
  stats?: any;
  tasks?: any;
  _profiler?: any;
  logLevel?: number;
  enableStats?: boolean;

  // Colony-wide data for multi-room management
  colony: {
    rooms: {
      owned: string[];
      reserved: string[];
      scouted: string[];
    };
    resourceBalance: { [resource: string]: { [roomName: string]: number } };
    expansionTargets: string[];
    version: number;
  };
  
  // Room data cache
  roomData: {
    [roomName: string]: {
      ownedRoom: boolean;
      reservedRoom: boolean;
      lastSeen: number;
      rcl?: number;
      sources?: { id: Id<Source>, pos: RoomPosition }[];
      minerals?: { id: Id<Mineral>, pos: RoomPosition, mineralType: MineralConstant }[];
      hostileTime?: number;
      hostileCount?: number;
      expansionScore?: number;
    }
  };
  
  [key: string]: any;  // Allow any property during migration
}

interface TaskData {
  id?: string;
  type: string;
  targetId?: Id<any>;
  resourceType?: ResourceConstant;
  amount?: number;
  priority?: number;
  data?: any;
}