// Global declarations for Screeps

declare const BUILD_ID: string;

// Global objects that will be accessible in the Screeps global scope
declare namespace NodeJS {
  interface Global {
    component: any;
    loggerInitialized?: boolean;
    setLogLevel?: (level: string | number) => void;
    help?: () => void;
    stats?: (automatic?: boolean | null) => void;
    ai: {
      harvester: {
        task: (creep: Creep) => void;
        routine?: (creep: Creep) => void;
        saveState: (creep: Creep, memory: CreepMemory) => void;
      };
      upgrader: {
        task: (creep: Creep) => void;
        routine?: (creep: Creep) => void;
      };
      archer: {
        task: (creep: Creep) => void;
        routine?: (creep: Creep) => void;
      };
      tower: {
        task: (structure: StructureTower) => void;
        routine: (tower: StructureTower) => void;
      };
      [key: string]: any;
    };
    config: {
      version: number;
      BUILD_ID?: string;
      [key: string]: any;
    };
    controller: {
      memory: {
        updateByCreep: (creep: Creep) => void;
        initCreep: (creep: Creep) => void;
        updateByRoom: (room: Room) => void;
        initRoom: (room: Room) => void;
      };
      creep: {
        routine: (creep: Creep) => void;
      };
      room: {
        default: {
          routine: (room: Room) => void;
          stage0: (room: Room) => void;
          stage1: (room: Room) => void;
          spawnCreep: (spawn: StructureSpawn, blueprint: any, roomMemory: any) => boolean;
        };
        [key: string]: any;
      };
      structure: {
        routine: (structure: Structure) => void;
      };
      [key: string]: any;
    };
    go: {
      findAvailableSpawnInRoom: (room: Room) => StructureSpawn | false;
      resource: {
        selectClosestTo: (entity: RoomObject) => Id<Source> | false;
        selectSecondClosestTo: (entity: RoomObject) => Id<Source> | false;
      };
      [key: string]: any;
    };
    patterns: {
      buildings: {
        [template: string]: {
          build: (room: Room) => void;
        };
      };
      [key: string]: any;
    };
    templates: {
      _300harvester: {
        body: BodyPartConstant[];
        name: string;
        memory: Partial<CreepMemory>;
      };
      _300upgrader: {
        body: BodyPartConstant[];
        name: string;
        memory: Partial<CreepMemory>;
      };
      _550harvester: {
        body: BodyPartConstant[];
        name: string;
        memory: Partial<CreepMemory>;
      };
      _550upgrader: {
        body: BodyPartConstant[];
        name: string;
        memory: Partial<CreepMemory>;
      };
      _800harvester: {
        body: BodyPartConstant[];
        name: string;
        memory: Partial<CreepMemory>;
      };
      _800upgrader: {
        body: BodyPartConstant[];
        name: string;
        memory: Partial<CreepMemory>;
      };
      _1300upgrader: {
        body: BodyPartConstant[];
        name: string;
        memory: Partial<CreepMemory>;
      };
      [key: string]: any;
    };
    helpers: {
      getEnergy: (structure: Structure) => number;
      getEnergyCapacity: (structure: Structure) => number;
      findDroppedEnergy: (room: Room) => Resource[];
      canSpawnCreep: (spawn: StructureSpawn, body: BodyPartConstant[], name?: string, memory?: any) => boolean;
      spawnCreep: (spawn: StructureSpawn, body: BodyPartConstant[], name?: string, memory?: any) => ScreepsReturnCode;
    };
    [key: string]: any;
  }
}