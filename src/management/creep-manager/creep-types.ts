/**
 * Creep Types
 * Contains shared types and interfaces for creep management
 */

export enum CreepRole {
  Harvester = 'harvester',
  Upgrader = 'upgrader',
  Builder = 'builder',
  Archer = 'archer',
  Reserver = 'reserver',
  RemoteHarvester = 'remoteHarvester',
  Hauler = 'hauler',
  Scout = 'scout',
  Claimer = 'claimer',
  Destroyer = 'destroyer',
  Defender = 'defender',
  Repairer = 'repairer'
}

/**
 * Room profile for creep planning
 */
export interface RoomProfile {
  name: string;
  rcl: number;
  energyAvailable: number;
  energyCapacity: number;
  storageEnergy: number;
  controllerDowngrade: number;
  emergency: boolean;
  hostiles: number;
  boostedHostiles: number;
  constructionSites: number;
  damagedStructures: number;
  creepCounts: Record<string, number>;
  remoteAssignments: Record<string, { harvester: number, reserver: number, hauler: number }>;
}

/**
 * Empire-wide profile for multi-room coordination
 */
export interface EmpireProfile {
  tick: number;
  rooms: RoomProfile[];
  totalEnergy: number;
  totalStorage: number;
  totalCreeps: number;
  creepCounts: Record<string, number>;
}