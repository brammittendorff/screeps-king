/**
 * General helper functions
 */

import { Logger } from './logger';
import * as _ from 'lodash';

export class Helpers {
  /**
   * Safely get energy from a structure
   */
  public static getEnergy(structure: Structure | null): number {
    if (!structure) return 0;
    
    // Direct access for extensions, spawns, towers etc
    if ((structure as any).energy !== undefined) {
      return (structure as any).energy;
    }
    
    // Store access for containers, storage, etc
    if ((structure as any).store) {
      return (structure as any).store[RESOURCE_ENERGY] || 0;
    }
    
    return 0;
  }
  
  /**
   * Safely get energy capacity from a structure
   */
  public static getEnergyCapacity(structure: Structure | null): number {
    if (!structure) return 0;
    
    // Direct access
    if ((structure as any).energyCapacity !== undefined) {
      return (structure as any).energyCapacity;
    }
    
    // Store access
    if ((structure as any).store) {
      if ((structure as any).storeCapacity !== undefined) {
        return (structure as any).storeCapacity;
      }
      
      if ((structure as any).store.getCapacity) {
        return (structure as any).store.getCapacity(RESOURCE_ENERGY) || 0;
      }
    }
    
    return 0;
  }
  
  /**
   * Find dropped energy in a room
   */
  public static findDroppedEnergy(room: Room): Resource[] {
    try {
      // Check if old API constant exists in global scope
      if (typeof FIND_DROPPED_ENERGY !== 'undefined') {
        // Old API - we have to cast to any to avoid type errors
        return room.find(FIND_DROPPED_ENERGY as any);
      }

      // New API with filter
      return room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType === RESOURCE_ENERGY
      });
    } catch (e) {
      Logger.error(`Error finding dropped energy: ${e.message}`);
      return [];
    }
  }
  
  /**
   * Check if a spawn can create a creep
   */
  public static canSpawnCreep(
    spawn: StructureSpawn,
    body: BodyPartConstant[],
    name?: string,
    memory?: any
  ): boolean {
    try {
      // Handle old API
      if ((spawn as any).canCreateCreep) {
        // Old API - need to cast to any to avoid TypeScript errors
        return (spawn as any).canCreateCreep(body, name, memory) === OK;
      }

      // New API - dry run
      const result = spawn.spawnCreep(body, name || `test_${Game.time}`, {
        dryRun: true,
        memory: memory
      });

      return result === OK;
    } catch (e) {
      Logger.error(`Error checking if spawn can create creep: ${e.message}`);
      return false;
    }
  }
  
  /**
   * Spawn a creep with compatibility for old/new API
   */
  public static spawnCreep(
    spawn: StructureSpawn, 
    body: BodyPartConstant[], 
    name?: string, 
    memory?: any
  ): ScreepsReturnCode {
    if (spawn.createCreep) {
      // Old API
      return spawn.createCreep(body, name, memory) as ScreepsReturnCode;
    } else if (spawn.spawnCreep) {
      // New API
      return spawn.spawnCreep(body, name || `creep_${Game.time}`, { 
        memory: memory 
      });
    }
    
    return ERR_NOT_FOUND;
  }
  
  /**
   * Calculate the cost of a body
   */
  public static getBodyCost(body: BodyPartConstant[]): number {
    return body.reduce((cost, part) => cost + BODYPART_COST[part], 0);
  }
  
  /**
   * Find an available spawn in a room
   */
  public static findAvailableSpawnInRoom(room: Room): StructureSpawn | null {
    const spawns = room.find(FIND_MY_SPAWNS);
    
    for (const spawn of spawns) {
      if (!spawn.spawning) {
        return spawn;
      }
    }
    
    return null;
  }
  
  /**
   * Run a function at a specific frequency
   */
  public static runAtFrequency(
    frequency: number, 
    offset: number,
    callback: () => void
  ): void {
    if ((Game.time + offset) % frequency === 0) {
      callback();
    }
  }
}