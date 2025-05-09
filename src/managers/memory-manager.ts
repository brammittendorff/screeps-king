/**
 * Memory Manager
 * Handles memory operations, cleanup, and optimization
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import * as _ from 'lodash';

export class MemoryManager {
  /**
   * Initialize memory structure
   */
  public static init(): void {
    // Ensure memory structures exist
    if (!Memory.creeps) Memory.creeps = {};
    if (!Memory.rooms) Memory.rooms = {};
  }
  
  /**
   * Clean up unused memory entries
   */
  @Profiler.wrap('MemoryManager.cleanup')
  public static cleanup(): void {
    // Clean up creep memory
    for (const name in Memory.creeps) {
      if (!Game.creeps[name]) {
        delete Memory.creeps[name];
        Logger.debug(`Cleared memory for non-existing creep: ${name}`);
      }
    }
    
    // Other cleanup as needed
    // TODO: Implement room memory cleanup for unused rooms
  }
  
  /**
   * Initialize memory for a creep
   */
  public static initCreepMemory(creep: Creep, role: string): void {
    if (!creep.memory.version || creep.memory.version < global.config.version) {
      creep.memory.version = global.config.version;
      creep.memory.role = role;
      
      // Initialize based on role
      switch (role) {
        case 'harvester':
          creep.memory.activity = 'harvesting';
          creep.memory.initiated = false;
          break;
        case 'upgrader':
          creep.memory.working = false;
          break;
        case 'builder':
          creep.memory.working = false;
          break;
        case 'archer':
          // Specific archer initialization
          break;
      }
      
      Logger.debug(`Initialized memory for creep ${creep.name} as ${role}`);
    }
  }
  
  /**
   * Update memory for a room
   */
  @Profiler.wrap('MemoryManager.updateRoomMemory')
  public static updateRoomMemory(room: Room): void {
    const memory = room.memory;
    
    // Initialize if needed
    if (!memory.version || memory.version < global.config.version) {
      this.initRoomMemory(room);
    }
    
    // Ensure basic values exist
    if (memory.ticks === undefined) memory.ticks = 0;
    if (memory.harvesters === undefined) memory.harvesters = 0;
    if (memory.upgraders === undefined) memory.upgraders = 0;
    
    // Increment tick count
    memory.ticks++;
    
    // Even ticks - Update creep counts
    if (!(memory.ticks & 1)) {
      try {
        const myCreeps = room.find(FIND_MY_CREEPS);
        
        // Count creeps by role
        memory.harvesters = _.filter(myCreeps, (c) => 
          c && c.memory && c.memory.role === 'harvester'
        ).length;
        
        memory.upgraders = _.filter(myCreeps, (c) => 
          c && c.memory && c.memory.role === 'upgrader'
        ).length;
        
        // Find hostiles
        memory.hostiles = room.find(FIND_HOSTILE_CREEPS, {
          filter: (c) => c.owner.username !== 'Invader'
        });
        
        memory.hostilesCount = memory.hostiles.length;
      } catch (e) {
        Logger.error(`Error updating creep counts: ${(e as Error).message}`, room.name);
      }
    }
    
    // Odd ticks - Update structure counts
    if (memory.ticks & 1) {
      try {
        const myStructures = room.find(FIND_MY_STRUCTURES);
        const mySpawns = room.find(FIND_MY_SPAWNS);
        const myConstructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
        
        memory.structures = myStructures.length;
        memory.spawns = mySpawns.length;
        memory.constructions = myConstructionSites.length;
      } catch (e) {
        Logger.error(`Error updating structure counts: ${(e as Error).message}`, room.name);
      }
    }
  }
  
  /**
   * Initialize memory for a room
   */
  public static initRoomMemory(room: Room): void {
    Logger.info(`Initializing memory for room ${room.name}`);
    
    const memory = room.memory;
    
    // Save important values
    const stage = memory.stage;
    const template = memory.template;
    
    // Clear all memory
    for (const prop in memory) {
      if (Object.prototype.hasOwnProperty.call(memory, prop)) {
        delete (memory as any)[prop];
      }
    }
    
    // Restore important values
    memory.stage = stage || 0;
    memory.template = template || 'default';
    
    // Initialize counters
    memory.harvesters = 0;
    memory.upgraders = 0;
    memory.ticks = 0;
    
    // Set version
    memory.version = global.config.version;
    
    // Initialize sources
    memory.sources = {};
    
    try {
      // Find and record all sources
      const sources = room.find(FIND_SOURCES);
      for (const source of sources) {
        if (source && source.id) {
          memory.sources[source.id] = {
            id: source.id,
            pos: {
              x: source.pos.x,
              y: source.pos.y,
              roomName: source.pos.roomName
            }
          };
        }
      }
    } catch (e) {
      Logger.error(`Error initializing sources: ${(e as Error).message}`, room.name);
    }
  }
}