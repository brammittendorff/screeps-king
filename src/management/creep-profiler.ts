/**
 * Creep Profiler
 * Handles metrics, profiling, and statistics for creeps
 */

import { Logger } from '../utils/logger';
import { CreepRole, RoomProfile, EmpireProfile } from './creep-types';
import * as _ from 'lodash';

export class CreepProfiler {
  // Track creep counts by room
  private static creepCounts: Record<string, Record<string, number>> = {};
  
  // Track remote room creep assignments
  private static remoteAssignments: Record<string, { 
    harvester: number,
    reserver: number,
    hauler: number 
  }> = {};
  
  /**
   * Reset creep count tracking
   */
  public static resetCreepCounts(): void {
    this.creepCounts = {};

    // Initialize counts for all rooms we own
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (room.controller && room.controller.my) {
        this.creepCounts[roomName] = {
          [CreepRole.Harvester]: 0,
          [CreepRole.Upgrader]: 0,
          [CreepRole.Builder]: 0,
          [CreepRole.Archer]: 0,
          [CreepRole.RemoteHarvester]: 0,
          [CreepRole.Reserver]: 0,
          [CreepRole.Hauler]: 0,
          [CreepRole.Scout]: 0,
          [CreepRole.Claimer]: 0,
          [CreepRole.Destroyer]: 0,
          [CreepRole.Defender]: 0,
          [CreepRole.Repairer]: 0
        };
      }
    }
  }

  /**
   * Increment the count for a specific role in a specific room
   */
  public static incrementCreepCount(roomName: string, role: string): void {
    if (!this.creepCounts[roomName]) {
      this.creepCounts[roomName] = {};
    }

    if (!this.creepCounts[roomName][role]) {
      this.creepCounts[roomName][role] = 0;
    }

    this.creepCounts[roomName][role]++;
  }
  
  /**
   * Reset remote assignment tracking
   */
  public static resetRemoteAssignments(): void {
    this.remoteAssignments = {};
  }
  
  /**
   * Track creep assignment to remote rooms
   */
  public static updateRemoteAssignment(roomName: string, role: string): void {
    if (!this.remoteAssignments[roomName]) {
      this.remoteAssignments[roomName] = {
        harvester: 0,
        reserver: 0,
        hauler: 0
      };
    }
    
    if (role === CreepRole.RemoteHarvester) {
      this.remoteAssignments[roomName].harvester++;
    } else if (role === CreepRole.Reserver) {
      this.remoteAssignments[roomName].reserver++;
    } else if (role === CreepRole.Hauler) {
      this.remoteAssignments[roomName].hauler++;
    }
  }
  
  /**
   * Get remote assignments
   */
  public static getRemoteAssignments(): Record<string, { harvester: number, reserver: number, hauler: number }> {
    return this.remoteAssignments;
  }
  
  /**
   * Get creep counts
   */
  public static getCreepCounts(): Record<string, Record<string, number>> {
    return this.creepCounts;
  }
  
  /**
   * Log the current creep counts
   */
  public static logCreepCounts(): void {
    for (const roomName in this.creepCounts) {
      const counts = this.creepCounts[roomName];
      if (!_.isEmpty(counts)) {
        const countString = Object.entries(counts)
          .map(([role, count]) => `${role}:${count}`)
          .join(', ');
        Logger.info(`Creep counts for ${roomName}: ${countString}`);
      }
    }
  }
  
  /**
   * Build a fast RoomProfile for a given room (CPU/memory efficient)
   */
  public static buildRoomProfile(room: Room): RoomProfile {
    // --- Extension fill tracking for harvester auto-tuning ---
    if (!room.memory.extensionFillStats) {
      room.memory.extensionFillStats = { full: 0, empty: 0, ticks: 0 };
    }
    const extensions = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
    const emptyExtensions = extensions.filter(e => (e as StructureExtension).store.getFreeCapacity(RESOURCE_ENERGY) > 0).length;
    if (extensions.length > 0) {
      if (emptyExtensions === 0) {
        room.memory.extensionFillStats.full++;
      } else {
        room.memory.extensionFillStats.empty++;
      }
      room.memory.extensionFillStats.ticks++;
      // Reset stats every 500 ticks for rolling window
      if (room.memory.extensionFillStats.ticks > 500) {
        room.memory.extensionFillStats.full = 0;
        room.memory.extensionFillStats.empty = 0;
        room.memory.extensionFillStats.ticks = 0;
      }
    }
    
    // Count creeps by role for this room
    const creepCounts: Record<string, number> = {};
    for (const role of Object.values(CreepRole)) {
      creepCounts[role] = _.filter(Game.creeps, c => c.memory.role === role && c.memory.homeRoom === room.name).length;
    }
    
    // Count damaged structures (cheap: only count, not list)
    const damagedStructures = room.find(FIND_STRUCTURES, {
      filter: s => s.hits < s.hitsMax * 0.75
    }).length;
    
    // Count hostiles and boosted hostiles
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    const boostedHostiles = hostiles.filter(c => c.body.some(part => part.boost)).length;
    
    // Construction sites
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
    
    // Storage energy
    const storageEnergy = room.storage?.store[RESOURCE_ENERGY] || 0;
    
    // Remote assignments (from static property)
    const remoteAssignments = this.remoteAssignments[room.name] || { harvester: 0, reserver: 0, hauler: 0 };
    
    return {
      name: room.name,
      rcl: room.controller?.level || 0,
      energyAvailable: room.energyAvailable,
      energyCapacity: room.energyCapacityAvailable,
      storageEnergy,
      controllerDowngrade: room.controller?.ticksToDowngrade || 100000,
      emergency: !!room.memory.emergency,
      hostiles: hostiles.length,
      boostedHostiles,
      constructionSites,
      damagedStructures,
      creepCounts,
      remoteAssignments: { [room.name]: remoteAssignments }
    };
  }

  /**
   * Build a fast EmpireProfile (aggregate of all RoomProfiles)
   */
  public static buildEmpireProfile(): EmpireProfile {
    const rooms: RoomProfile[] = [];
    let totalEnergy = 0;
    let totalStorage = 0;
    let totalCreeps = 0;
    const creepCounts: Record<string, number> = {};
    
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      
      const profile = this.buildRoomProfile(room);
      rooms.push(profile);
      totalEnergy += profile.energyAvailable;
      totalStorage += profile.storageEnergy;
      
      for (const role of Object.keys(profile.creepCounts)) {
        creepCounts[role] = (creepCounts[role] || 0) + profile.creepCounts[role];
        totalCreeps += profile.creepCounts[role];
      }
    }
    
    return {
      tick: Game.time,
      rooms,
      totalEnergy,
      totalStorage,
      totalCreeps,
      creepCounts
    };
  }
}