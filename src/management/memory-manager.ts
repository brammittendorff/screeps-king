/**
 * Memory Manager
 * Handles memory operations, cleanup, and optimization
 */

import { Logger } from '../utils/logger';
import * as _ from 'lodash';
import { RoomCache } from '../utils/room-cache';
import { CONFIG } from '../configuration';

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
   * Run memory operations for the current tick
   */
  public static run(): void {
    // Run every tick
    this.cleanup();
    this.updateAllCreepMemory();
    
    // Run less frequently
    if (Game.time % 10 === 0) {
      // Update room memory every 10 ticks
      for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.controller && room.controller.my) {
          this.updateRoomMemory(room);
        }
      }
    }
  }
  
  /**
   * Clean up unused memory entries
   */
  public static cleanup(): void {
    // Clean up creep memory
    for (const name in Memory.creeps) {
      if (!Game.creeps[name]) {
        delete Memory.creeps[name];
      }
    }
    // Clean up room memory for rooms we no longer own or see
    for (const roomName in Memory.rooms) {
      if (!Game.rooms[roomName] || !Game.rooms[roomName].controller || !Game.rooms[roomName].controller.my) {
        delete Memory.rooms[roomName];
      }
    }
    // Analytics and stats are now kept only in global, not in Memory, for CPU/memory efficiency
    // (Removed all Memory.analytics and Memory.stats cleanup)
    // Clean up containers memory for non-existing containers
    if (Memory.containers) {
      for (const id in Memory.containers) {
        if (!Game.getObjectById(id as Id<StructureContainer>)) {
          delete Memory.containers[id];
        }
      }
    }
    // Clean up links memory for non-existing links
    if (Memory.links) {
      for (const id in Memory.links) {
        if (!Game.getObjectById(id as Id<StructureLink>)) {
          delete Memory.links[id];
        }
      }
    }
    // Clean up roomData for rooms not seen in a long time
    if (Memory.roomData) {
      for (const roomName in Memory.roomData) {
        if (!Game.rooms[roomName] && (!Memory.roomData[roomName].lastSeen || Game.time - Memory.roomData[roomName].lastSeen > 20000)) {
          delete Memory.roomData[roomName];
        }
      }
    }
    // Clean up colony expansionTargets for rooms that no longer exist
    if (Memory.colony && Memory.colony.expansionTargets) {
      Memory.colony.expansionTargets = Memory.colony.expansionTargets.filter((roomName: string) => Game.map.getRoomStatus(roomName).status === 'normal');
    }
    // Prune scouted rooms by age (not seen in last 10,000 ticks)
    const SCOUTED_ROOM_MAX_AGE = 10000;
    if (Memory.colony && Memory.colony.rooms && Memory.colony.rooms.scouted && typeof Memory.colony.rooms.scouted === 'object') {
      for (const roomName in Memory.colony.rooms.scouted) {
        const data = Memory.colony.rooms.scouted[roomName];
        if (!data.lastSeen || Game.time - data.lastSeen > SCOUTED_ROOM_MAX_AGE) {
          delete Memory.colony.rooms.scouted[roomName];
        }
      }
    }
  }
  
  /**
   * Initialize memory for a creep
   */
  public static initCreepMemory(creep: Creep, role: string): void {
    // Only set or update your own fields; do NOT delete or overwrite the whole memory object!
    creep.memory.version = global.config.version;
    creep.memory.role = role;
    // Initialize based on role
    switch (role) {
      case 'harvester':
        if (creep.memory.activity === undefined) creep.memory.activity = 'harvesting';
        if (creep.memory.initiated === undefined) creep.memory.initiated = false;
        break;
      case 'upgrader':
        if (creep.memory.working === undefined) creep.memory.working = false;
        break;
      case 'builder':
        if (creep.memory.working === undefined) creep.memory.working = false;
        break;
      case 'archer':
        // Specific archer initialization
        break;
    }
  }
  
  /**
   * Update memory for a room
   */
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
        const myCreeps = RoomCache.get(room, FIND_MY_CREEPS);
        
        // Count creeps by role
        memory.harvesters = _.filter(myCreeps, (c) => 
          c && c.memory && c.memory.role === 'harvester'
        ).length;
        
        memory.upgraders = _.filter(myCreeps, (c) => 
          c && c.memory && c.memory.role === 'upgrader'
        ).length;
        
        // Find hostiles
        memory.hostilesCount = RoomCache.get(room, FIND_HOSTILE_CREEPS, {
          filter: (c) => c.owner.username !== 'Invader'
        }).length;
      } catch (e) {
        // No logging in this method
      }
    }
    
    // Odd ticks - Update structure counts
    if (memory.ticks & 1) {
      try {
        const myStructures = RoomCache.get(room, FIND_MY_STRUCTURES);
        const mySpawns = RoomCache.get(room, FIND_MY_SPAWNS);
        const myConstructionSites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES);
        
        memory.structures = myStructures.length;
        memory.spawns = mySpawns.length;
        memory.constructions = myConstructionSites.length;
      } catch (e) {
        // No logging in this method
      }
    }
  }
  
  /**
   * Initialize memory for a room
   */
  public static initRoomMemory(room: Room): void {
    // No logging in this method
    
    const memory = room.memory;
    
    // Save important values
    const stage = memory.stage;
    const template = memory.template;
    const mapping = memory.mapping; // Preserve mapping data
    
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
    
    // Initialize mapping if it doesn't exist
    if (!mapping) {
      // Create new mapping structure
      memory.mapping = {
        sources: []
      };
    } else {
      // Restore mapping data
      memory.mapping = mapping;
    }
    
    try {
      // Find and record all sources
      const sources = RoomCache.get(room, FIND_SOURCES);
      
      // Initialize sources in mapping if they don't exist
      if (!memory.mapping.sources || memory.mapping.sources.length === 0) {
        memory.mapping.sources = [];
        
        for (const source of sources) {
          if (source && source.id) {
            // Add source to mapping with harvester spots (default to 2)
            memory.mapping.sources.push({
              id: source.id,
              x: source.pos.x,
              y: source.pos.y,
              spots: 2 // Allow 2 harvesters per source by default
            });
          }
        }
      }
    } catch (e) {
      // No logging in this method
    }
  }

  /**
   * Update the scouted rooms record for a room
   */
  public static markRoomScouted(roomName: string): void {
    if (!Memory.colony || !Memory.colony.rooms) return;
    if (!Memory.colony.rooms.scouted || Array.isArray(Memory.colony.rooms.scouted)) Memory.colony.rooms.scouted = {};
    Memory.colony.rooms.scouted[roomName] = { lastSeen: Game.time };
  }

  /**
   * Update memory for all existing creeps every tick (versioning and role-based init)
   */
  public static updateAllCreepMemory(): void {
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      // If version is missing or outdated, or role is missing, re-init
      if (!creep.memory.version || creep.memory.version < global.config.version || !creep.memory.role) {
        this.initCreepMemory(creep, creep.memory.role || 'harvester');
      }
    }
  }
}

if (Memory.tasks && Memory.buildId !== CONFIG.BUILD_ID) {
  delete Memory.tasks;
  console.log('[DEPLOY] Cleared old Memory.tasks for new build.');
}