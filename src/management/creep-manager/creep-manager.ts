/**
 * Creep Manager
 * Core module that coordinates creep lifecycle management
 * This module has been refactored to be more maintainable
 */

import { Logger } from '../../utils/logger';
import { Helpers } from '../../utils/helpers';
import { ScoutHelper } from '../../utils/scout-helper';
import * as _ from 'lodash';
import { AI } from '../../roles';
import { RoomCache } from '../../utils/room-cache';
import { UpgradeStrategyManager } from '../upgrade-strategy';

// Import refactored modules
import { CreepRole, RoomProfile, EmpireProfile } from './creep-types';
import { CreepRequest, CreepSpawner } from './creep-spawner';
import { CreepBodyBuilder } from './creep-body-builder';
import { CreepProfiler } from './creep-profiler';

// Export role enum for convenience
export { CreepRole };

// Constants for throttling
const CONSTRUCTION_STALLED_TICKS = 1000;
const CONTROLLER_DOWNGRADE_TICKS = 5000;
const ENERGY_STARVATION_TICKS = 500;
const REMOTE_ROOM_NEGLECT_TICKS = 1000;
const STORAGE_FULL_THRESHOLD = 1900000;
const MAX_BUILDERS_IDLE = 2;
const MAX_REPAIRERS_IDLE = 1;
const IDLE_PARK_X = 25;
const IDLE_PARK_Y = 25;

export class CreepManager {
  /**
   * Request a creep to be spawned
   */
  public static requestCreep(request: CreepRequest): void {
    CreepSpawner.requestCreep(request);
  }
  
  /**
   * Process the spawn queue for all rooms
   */
  public static processSpawns(): void {
    // Just process the spawn queue - planning is now done separately in main.ts
    CreepSpawner.processSpawns();
  }
  
  /**
   * Process all creeps based on their roles
   */
  public static runCreeps(): void {
    // Reset creep counts and remote assignments
    CreepProfiler.resetCreepCounts();
    CreepProfiler.resetRemoteAssignments();

    // Group creeps by room for better management
    const creepsByRoom: Record<string, Creep[]> = {};
    const creepsByTargetRoom: Record<string, Creep[]> = {};

    // Add all creeps to their respective rooms
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      // --- BATCHING: Only process 1/3 of creeps per tick ---
      if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) continue;
      
      // --- ROAD HEATMAP TRACKING ---
      const room = creep.room;
      if (room.controller && room.controller.my) {
        if (!room.memory.roadHeatmap) room.memory.roadHeatmap = {};
        const x = creep.pos.x;
        const y = creep.pos.y;
        if (!room.memory.roadHeatmap[x]) room.memory.roadHeatmap[x] = {};
        room.memory.roadHeatmap[x][y] = (room.memory.roadHeatmap[x][y] || 0) + 1;
      }
      // --- END HEATMAP TRACKING ---
      
      // Determine which room this creep belongs to
      const homeRoom = creep.memory.homeRoom || creep.room.name;
      const targetRoom = creep.memory.targetRoom || creep.memory.homeRoom || creep.room.name;
      
      // Group by home room for spawning decisions
      if (!creepsByRoom[homeRoom]) {
        creepsByRoom[homeRoom] = [];
      }
      creepsByRoom[homeRoom].push(creep);
      
      // Group by target room for operation
      if (!creepsByTargetRoom[targetRoom]) {
        creepsByTargetRoom[targetRoom] = [];
      }
      creepsByTargetRoom[targetRoom].push(creep);

      // Update creep counts by home room
      CreepProfiler.incrementCreepCount(homeRoom, creep.memory.role);
      
      // Track remote assignments
      if (homeRoom !== targetRoom) {
        CreepProfiler.updateRemoteAssignment(targetRoom, creep.memory.role);
      }
    }

    // Process creeps room by room based on target room
    for (const roomName in creepsByTargetRoom) {
      this.runCreepsInRoom(roomName, creepsByTargetRoom[roomName]);
    }

    // Check if we need to spawn creeps for remote operations
    this.requestRemoteCreeps();

    // Log creep counts every 100 ticks
    if (Game.time % 100 === 0) {
      CreepProfiler.logCreepCounts();
    }

    // --- HEATMAP DECAY ---
    if (Game.time % 1000 === 0) {
      for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.controller && room.controller.my && room.memory.roadHeatmap) {
          for (const x in room.memory.roadHeatmap) {
            for (const y in room.memory.roadHeatmap[x]) {
              room.memory.roadHeatmap[x][y] = Math.floor(room.memory.roadHeatmap[x][y] * 0.5); // decay by 50%
              if (room.memory.roadHeatmap[x][y] === 0) {
                delete room.memory.roadHeatmap[x][y];
              }
            }
            if (Object.keys(room.memory.roadHeatmap[x]).length === 0) {
              delete room.memory.roadHeatmap[x];
            }
          }
          if (Object.keys(room.memory.roadHeatmap).length === 0) {
            delete room.memory.roadHeatmap;
          }
        }
      }
    }
    // --- END HEATMAP DECAY ---
  }

  /**
   * Process all creeps in a specific room
   */
  private static runCreepsInRoom(roomName: string, creeps: Creep[]): void {
    if (!creeps || creeps.length === 0) return;

    for (const creep of creeps) {
      try {
        // Get role from memory
        const role = creep.memory.role || 'harvester';
        // Use modular AI system for all roles
        if (role && AI[role] && typeof AI[role].task === 'function') {
          AI[role].task(creep);
        } else {
          // Fallback to harvester if role is missing or not implemented
          AI.harvester.task(creep);
        }
      } catch (e) {
        Logger.error(`Error processing creep ${creep.name}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Request creeps for remote operations
   */
  private static requestRemoteCreeps(): void {
    // Check reserved rooms from colony data
    if (!Memory.colony || !Memory.colony.rooms || !Memory.colony.rooms.reserved) {
      return;
    }
    
    // Check each reserved room
    for (const roomName of Memory.colony.rooms.reserved) {
      // Skip rooms we already have plenty of creeps assigned to
      const assignments = CreepProfiler.getRemoteAssignments()[roomName] || { harvester: 0, reserver: 0, hauler: 0 };
      
      // Find the closest owned room to spawn from
      const homeRoom = this.findClosestOwnedRoom(roomName);
      if (!homeRoom) continue;
      
      // Skip if we don't have the home room visible
      const home = Game.rooms[homeRoom];
      if (!home) continue;
      
      // Check if we need a reserver
      if (assignments.reserver < 1) {
        const body = CreepBodyBuilder.getOptimalBody(CreepRole.Reserver, home.energyCapacityAvailable, home);
        
        this.requestCreep({
          role: CreepRole.Reserver,
          body: body,
          priority: 40, // Medium priority
          roomName: homeRoom,
          memory: {
            role: CreepRole.Reserver,
            homeRoom: homeRoom,
            targetRoom: roomName
          }
        });
      }
      
      // Check if we need remote harvesters
      if (assignments.harvester < 2) {
        const body = CreepBodyBuilder.getOptimalBody(CreepRole.RemoteHarvester, home.energyCapacityAvailable, home);
        
        this.requestCreep({
          role: CreepRole.RemoteHarvester,
          body: body,
          priority: 50, // Medium-high priority
          roomName: homeRoom,
          memory: {
            role: CreepRole.RemoteHarvester,
            homeRoom: homeRoom,
            targetRoom: roomName
          }
        });
      }
      
      // Check if we need haulers
      if (assignments.harvester > 0 && assignments.hauler < assignments.harvester) {
        const body = CreepBodyBuilder.getOptimalBody(CreepRole.Hauler, home.energyCapacityAvailable, home);
        
        this.requestCreep({
          role: CreepRole.Hauler,
          body: body,
          priority: 45, // Medium priority
          roomName: homeRoom,
          memory: {
            role: CreepRole.Hauler,
            homeRoom: homeRoom,
            targetRoom: roomName
          }
        });
      }
    }
  }

  /**
   * Find the closest owned room to a target room
   */
  private static findClosestOwnedRoom(targetRoom: string): string | null {
    if (!Memory.colony || !Memory.colony.rooms || !Memory.colony.rooms.owned || Memory.colony.rooms.owned.length === 0) {
      return null;
    }
    
    // If we only have one owned room, use that
    if (Memory.colony.rooms.owned.length === 1) {
      return Memory.colony.rooms.owned[0];
    }
    
    // Simple linear distance for now (could be improved with pathfinding)
    let closestRoom = Memory.colony.rooms.owned[0];
    let closestDist = Infinity;
    
    for (const roomName of Memory.colony.rooms.owned) {
      const dist = Game.map.getRoomLinearDistance(roomName, targetRoom);
      if (dist < closestDist) {
        closestDist = dist;
        closestRoom = roomName;
      }
    }
    
    return closestRoom;
  }

  /**
   * Request scouts to explore the map
   */
  public static requestScouts(): void {
    // Only do this every 1000 ticks
    if (Game.time % 1000 !== 0) return;
    
    // Check for each owned room
    for (const roomName of Memory.colony.rooms.owned) {
      const room = Game.rooms[roomName];
      if (!room) continue;
      
      // Check if we have any scouts
      const scouts = _.filter(Game.creeps, (c) => 
        c.memory.role === CreepRole.Scout &&
        c.memory.homeRoom === roomName
      );
      
      if (scouts.length < 1) {
        // Request a scout
        this.requestCreep({
          role: CreepRole.Scout,
          body: [MOVE, MOVE, MOVE, MOVE, MOVE],
          priority: 10, // Low priority
          roomName: roomName,
          memory: {
            role: CreepRole.Scout,
            homeRoom: roomName
          }
        });
      }
    }
  }

  /**
   * Get optimal body for a role
   */
  public static getOptimalBody(role: CreepRole, energy: number, room?: Room): BodyPartConstant[] {
    return CreepBodyBuilder.getOptimalBody(role, energy, room);
  }

  /**
   * Build a room profile for creep planning
   */
  public static buildRoomProfile(room: Room): RoomProfile {
    return CreepProfiler.buildRoomProfile(room);
  }

  /**
   * Build an empire profile for multi-room coordination
   */
  public static buildEmpireProfile(): EmpireProfile {
    return CreepProfiler.buildEmpireProfile();
  }

  /**
   * Plan creeps for a room based on its profile and empire state
   */
  public static planCreeps(roomProfile: RoomProfile, empireProfile: EmpireProfile): CreepRequest[] {
    // UpgradeStrategyManager is now properly imported at the top of the file
    
    const requests: CreepRequest[] = [];
    const { name, rcl, energyCapacity, storageEnergy, controllerDowngrade, emergency, hostiles, boostedHostiles, constructionSites, damagedStructures, creepCounts } = roomProfile;
    const roomObj = Game.rooms[roomProfile.name];
    const sources = roomObj ? roomObj.find(FIND_SOURCES) : [];
    const mapping = roomObj?.memory?.mapping;
    
    // Use mapping to determine max harvesters per source
    let maxHarvestersPerSource: number[] = sources.map((s, i) => (mapping?.sources?.[i]?.spots || 1));
    const harvesters = _.filter(Game.creeps, c => c.memory.role === CreepRole.Harvester && c.memory.homeRoom === name);
    
    // Count assignments per source
    const harvesterAssignments: Record<string, number> = {};
    for (const source of sources) harvesterAssignments[source.id] = 0;
    for (const creep of harvesters) {
      if (creep.memory.targetSourceId && harvesterAssignments[creep.memory.targetSourceId] !== undefined) {
        harvesterAssignments[creep.memory.targetSourceId]++;
      }
    }
    
    let harvestersRequested = 0;
    // Evenly distribute new harvesters to sources with least assigned (and available spots)
    let totalNeeded = 0;
    for (let i = 0; i < sources.length; i++) {
      totalNeeded += maxHarvestersPerSource[i];
    }
    
    while (harvesters.length + harvestersRequested < totalNeeded) {
      // Find the source with the fewest assigned harvesters and available spots
      let minAssigned = Infinity;
      let minSourceIdx = 0;
      for (let i = 0; i < sources.length; i++) {
        const assigned = harvesterAssignments[sources[i].id];
        if (assigned < maxHarvestersPerSource[i] && assigned < minAssigned) {
          minAssigned = assigned;
          minSourceIdx = i;
        }
      }
      // If all sources are full, break
      if (minAssigned === Infinity) break;
      
      const source = sources[minSourceIdx];
      const harvesterBody = this.getOptimalBody(CreepRole.Harvester, roomProfile.energyCapacity, roomObj);
      
      requests.push({
        role: CreepRole.Harvester,
        body: harvesterBody,
        priority: 110,
        roomName: name,
        memory: { role: CreepRole.Harvester, homeRoom: name, targetSourceId: source.id }
      });
      harvesterAssignments[source.id]++;
      harvestersRequested++;
    }
    
    // --- HAULERS (advanced scaling & distribution) ---
    // Estimate required hauler count based on source-to-storage distances and throughput
    let desiredHaulers = 0;
    const containers = roomObj ? roomObj.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER }) : [];
    if (rcl >= 3 && (roomObj && (roomObj.storage || containers.length > 0))) {
      let totalDistance = 0;
      if (mapping && mapping.sources && (mapping.storage || mapping.spawns)) {
        const target = mapping.storage || mapping.spawns[0];
        for (const source of mapping.sources) {
          totalDistance += Game.map.getRoomLinearDistance(roomObj.name, roomObj.name) + Math.abs(source.x - target.x) + Math.abs(source.y - target.y);
        }
      } else {
        totalDistance = sources.length * 10; // fallback
      }
      // Assume each source produces 10 energy/tick, roundtrip
      const energyPerTick = sources.length * 10;
      const roundtrip = totalDistance * 2;
      const haulerCarry = Math.min(50, Math.floor(roomProfile.energyCapacity / 50));
      desiredHaulers = Math.max(1, Math.ceil((energyPerTick * roundtrip) / (haulerCarry * 2 * 50)));
      if (rcl >= 5) desiredHaulers = Math.max(sources.length, Math.floor((storageEnergy + _.sumBy(containers, c => (c as StructureContainer).store[RESOURCE_ENERGY] || 0)) / 20000));
    }
    
    // Evenly distribute haulers to sources
    const haulers = _.filter(Game.creeps, c => c.memory.role === CreepRole.Hauler && c.memory.homeRoom === name);
    const haulerAssignments: Record<string, number> = {};
    for (const source of sources) haulerAssignments[source.id] = 0;
    for (const creep of haulers) {
      if (creep.memory.targetSourceId && haulerAssignments[creep.memory.targetSourceId] !== undefined) {
        haulerAssignments[creep.memory.targetSourceId]++;
      }
    }
    
    let haulersRequested = 0;
    while (haulers.length + haulersRequested < desiredHaulers) {
      // Find the source with the fewest assigned haulers
      let minAssigned = Infinity;
      let minSourceIdx = 0;
      for (let i = 0; i < sources.length; i++) {
        const assigned = haulerAssignments[sources[i].id];
        if (assigned < minAssigned) {
          minAssigned = assigned;
          minSourceIdx = i;
        }
      }
      const source = sources[minSourceIdx];
      requests.push({
        role: CreepRole.Hauler,
        body: this.getOptimalBody(CreepRole.Hauler, roomProfile.energyCapacity, roomObj),
        priority: 100,
        roomName: name,
        memory: { role: CreepRole.Hauler, homeRoom: name, targetSourceId: source.id }
      });
      haulerAssignments[source.id]++;
      haulersRequested++;
    }
    
    // --- UPGRADERS ---
    // Use upgrade strategy manager for optimal upgrader allocation
    // Get maximum possible upgraders (physical limitation)
    const maxUpgraders = mapping?.controller?.spots || 2;
    
    // Get desired upgraders from strategy manager
    let desiredUpgraders = UpgradeStrategyManager.getDesiredUpgraders(roomObj);
    
    // Cap at physical maximum
    desiredUpgraders = Math.min(desiredUpgraders, maxUpgraders);
    
    // Always ensure at least 1 upgrader
    desiredUpgraders = Math.max(1, desiredUpgraders);
    
    // Emergency case - about to downgrade
    if (emergency || (roomObj.controller && roomObj.controller.ticksToDowngrade < 3000)) {
      desiredUpgraders = Math.max(desiredUpgraders, 2);
    }
    
    // Get upgrader spawn priority from strategy manager
    const upgraderPriority = UpgradeStrategyManager.getUpgraderPriority(roomObj);
    
    // Spawn upgraders as needed
    const upgraders = _.filter(Game.creeps, c => c.memory.role === CreepRole.Upgrader && c.memory.homeRoom === name);
    while (upgraders.length + requests.filter(r => r.role === CreepRole.Upgrader).length < desiredUpgraders) {
      // Get optimal body based on RCL and available energy
      const upgraderBody = this.getOptimalBody(CreepRole.Upgrader, roomProfile.energyCapacity, roomObj);
      
      requests.push({
        role: CreepRole.Upgrader,
        body: upgraderBody,
        priority: upgraderPriority,
        roomName: name,
        memory: { 
          role: CreepRole.Upgrader, 
          homeRoom: name,
          // Add flag for upgrader focus based on strategy
          prioritizeUpgrade: UpgradeStrategyManager.shouldPrioritizeUpgrade(roomObj)
        }
      });
    }
    
    // --- BUILDERS ---
    // Add dynamic builder requests based on construction sites
    if (constructionSites > 0) {
      let desiredBuilders = (rcl < 4) ? 1 : Math.ceil(constructionSites / 5);
      desiredBuilders = Math.min(desiredBuilders, 3); // Cap at 3 builders
      
      const builders = _.filter(Game.creeps, c => c.memory.role === CreepRole.Builder && c.memory.homeRoom === name);
      while (builders.length + requests.filter(r => r.role === CreepRole.Builder).length < desiredBuilders) {
        requests.push({
          role: CreepRole.Builder,
          body: this.getOptimalBody(CreepRole.Builder, roomProfile.energyCapacity, roomObj),
          priority: 80,
          roomName: name,
          memory: { role: CreepRole.Builder, homeRoom: name }
        });
      }
    }
    
    // --- REPAIRERS ---
    if (damagedStructures > 0) {
      let desiredRepairers = Math.min(2, Math.ceil(damagedStructures / 10));
      
      const repairers = _.filter(Game.creeps, c => c.memory.role === CreepRole.Repairer && c.memory.homeRoom === name);
      while (repairers.length + requests.filter(r => r.role === CreepRole.Repairer).length < desiredRepairers) {
        requests.push({
          role: CreepRole.Repairer,
          body: this.getOptimalBody(CreepRole.Repairer, roomProfile.energyCapacity, roomObj),
          priority: 70,
          roomName: name,
          memory: { role: CreepRole.Repairer, homeRoom: name }
        });
      }
    }
    
    // --- EMERGENCY RECOVERY ---
    // If room has very low energy or controller about to downgrade
    if (roomObj) {
      // Controller emergency
      if (roomObj.controller && roomObj.controller.ticksToDowngrade < 5000) {
        Logger.warning(`[${name}] Controller downgrade imminent (${roomObj.controller.ticksToDowngrade} ticks)! Boosting upgraders.`);
        
        // Force emergency upgraders
        const upgraders = _.filter(Game.creeps, c => c.memory.role === CreepRole.Upgrader && c.memory.homeRoom === name);
        if (upgraders.length === 0) {
          requests.push({
            role: CreepRole.Upgrader,
            body: [WORK, CARRY, MOVE], // Minimal viable upgrader
            priority: 200, // Highest emergency priority
            roomName: name,
            memory: { role: CreepRole.Upgrader, homeRoom: name }
          });
        }
      }
      
      // Energy emergency
      if (roomObj.energyAvailable < 200) {
        Logger.warning(`[${name}] Critical energy shortage! Spawning emergency harvester.`);
        
        // Check if we have any harvesters
        const harvesters = _.filter(Game.creeps, c => c.memory.role === CreepRole.Harvester && c.memory.homeRoom === name);
        if (harvesters.length === 0) {
          // Find an available source
          const source = roomObj.find(FIND_SOURCES)[0];
          if (source) {
            requests.push({
              role: CreepRole.Harvester,
              body: [WORK, CARRY, MOVE], // Minimal viable harvester
              priority: 300, // Absolute highest priority
              roomName: name,
              memory: { role: CreepRole.Harvester, homeRoom: name, targetSourceId: source.id }
            });
          }
        }
      }
    }
    
    return requests;
  }
}