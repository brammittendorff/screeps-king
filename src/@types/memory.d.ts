// Type definitions for memory objects

interface CreepMemory {
  role: string;
  state?: string;           // State in the state machine pattern (harvesting, working, etc)
  working?: boolean;        // Legacy state for creeps using the old system
  targetId?: Id<any>;
  buildMode?: number;
  activity?: string;        // Activity for creeps using the old system
  initiated?: boolean;
  sourceId?: Id<Source>;
  targetSourceId?: Id<Source>;
  version?: number;
  path?: string;
  task?: TaskData;
  phasingOut?: boolean;
  parked?: boolean;         // Whether the creep is parked in a static position
  containerPos?: {          // Position of a container or link this creep is associated with
    x: number;
    y: number;
    roomName: string;
  };
  prioritizeUpgrade?: boolean; // Whether this upgrader should prioritize upgrading over other tasks

  // Multi-room properties
  homeRoom?: string;        // The room this creep was spawned in or is assigned to
  targetRoom?: string;      // The room this creep should work in (may be different from homeRoom)
  assignment?: string;      // Special assignment for this creep (e.g., 'reserve', 'remote_harvest')
  stage?: number;           // Creep's current task sequence stage
  
  // Strategy pattern properties
  strategy?: string;        // Strategy used by this creep (for BaseCreep architecture)
  idle?: boolean;           // Whether the creep is currently idle
  
  // Defender strategy properties
  patrolTarget?: { x: number; y: number; roomName: string }; // Target position for defender patrols
  
  // Scout strategy properties
  visitedPOI?: number; // Number of points of interest visited in current room
}

interface RoomMemory {
  version?: number;
  stage?: number; // Room development stage
  template?: string;
  ticks?: number;
  harvesters?: number;
  upgraders?: number;
  hostilesCount?: number; // Hostile creep count (prefer this for efficiency)
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
  controllerId?: Id<StructureController>; // Controller ID for quick access
  structureIds?: { [type: string]: Id<Structure>[] }; // Key structure IDs by type
  constructionSites?: Id<ConstructionSite>[]; // Construction site IDs
  threatLevel?: number; // Calculated threat level
  resourceBalance?: { [resource: string]: number }; // Resource management
  expansionScore?: number; // Expansion logic
  minerals?: MineralConstant; // Mineral type in room
  owner?: string; // Room owner username
  reservation?: { username: string; ticksToEnd: number }; // Reservation info
  buildId?: string;
  lastBuildLog?: number;
  constructionQueue?: any[];
  buildFlags?: any;
  buildState?: any;
  initialized?: boolean;
  upgradeFocus?: boolean; // Whether this room is focusing on controller upgrading
  energy?: {
    available?: number;
    capacity?: number;
    storage?: number;
    terminal?: number;
  };
  fillTargets?: Id<Structure>[];
  collectTargets?: Id<StructureContainer>[];
  roadHeatmap?: { [x: number]: { [y: number]: number } };
  lastControllerProgress?: number;
  progressHistory?: number[];
  idleTicks?: { [role: string]: number };
  extensionFillStats?: { full: number; empty: number; ticks: number };
  mapping?: any;
  lastEmergencySpawnTick?: number;
}

// For scouted rooms, use a dedicated type
interface ScoutedRoomMemory {
  lastSeen: number; // Last tick seen
  sources?: number; // Number of sources
  minerals?: MineralConstant; // Mineral type
  owner?: string; // Owner username
  reservation?: { username: string; ticksToEnd: number };
  hostileStructures?: number; // Hostile structure count
  expansionScore?: number; // Expansion score
  threatLevel?: number; // Calculated threat level
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
      scouted: Record<string, ScoutedRoomMemory>;
    };
    resourceBalance: { [resource: string]: { [roomName: string]: number } };
    expansionTargets: string[];
    version: number;
    lostRooms?: { roomName: string; time: number }[];
  };
  
  // Room data cache
  roomData: {
    [roomName: string]: {
      ownedRoom: boolean;
      reservedRoom: boolean;
      lastSeen: number;
      rcl?: number;
      sources?: { id: Id<Source>, pos: RoomPosition }[];
      sourceCount?: number;            // Count of sources in room (for scouts)
      minerals?: { id: Id<Mineral>, pos: RoomPosition, mineralType: MineralConstant }[];
      hostileTime?: number;
      hostileCount?: number;
      hostiles?: number;               // Number of hostile creeps
      hostileOwners?: string[];        // List of usernames of hostile creeps
      hostileStructures?: number;
      expansionScore?: number;
      owner?: string;
      mineralType?: MineralConstant;   // Type of mineral in the room
      controllerLevel?: number;        // Level of the controller
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