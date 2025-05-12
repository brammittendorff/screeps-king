/**
 * Creep Manager
 * Handles creep spawning, assignment, and lifecycle
 * Extended for multi-room support
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import { Helpers } from '../utils/helpers';
import { ScoutHelper } from '../utils/scout-helper';
import * as _ from 'lodash';
import { AI } from '../ai';

export enum CreepRole {
  Harvester = 'harvester',
  Upgrader = 'upgrader',
  Builder = 'builder',
  Archer = 'archer',
  Reserver = 'reserver',
  RemoteHarvester = 'remoteHarvester',
  Hauler = '',
  Scout = 'scout',
  Claimer = 'claimer',
  Destroyer = 'destroyer',
  Defender = 'defender'
}

export interface CreepRequest {
  role: CreepRole;
  body: BodyPartConstant[];
  memory: Partial<CreepMemory>;
  priority: number;
  roomName: string;
}

// --- RoomProfile and EmpireProfile for generic planning ---
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

export interface EmpireProfile {
  tick: number;
  rooms: RoomProfile[];
  totalEnergy: number;
  totalStorage: number;
  totalCreeps: number;
  creepCounts: Record<string, number>;
}

export class CreepManager {
  private static spawnQueue: Record<string, CreepRequest[]> = {};
  private static creepCounts: Record<string, Record<string, number>> = {}; // Room to role counts
  
  // Track remote room creep assignments
  private static remoteAssignments: Record<string, { 
    harvester: number,
    reserver: number,
    hauler: number 
  }> = {};
  
  /**
   * Request a creep to be spawned
   */
  public static requestCreep(request: CreepRequest): void {
    if (!this.spawnQueue[request.roomName]) {
      this.spawnQueue[request.roomName] = [];
    }
    
    this.spawnQueue[request.roomName].push(request);
    
    // Sort by priority (highest first)
    this.spawnQueue[request.roomName].sort((a, b) => b.priority - a.priority);
    
    Logger.debug(`Requested ${request.role} creep in ${request.roomName} with priority ${request.priority}`);
  }
  
  /**
   * Process the spawn queue for all rooms
   */
  @Profiler.wrap('CreepManager.processSpawns')
  public static processSpawns(): void {
    for (const roomName in this.spawnQueue) {
      const room = Game.rooms[roomName];
      if (!room) continue;
      
      // Skip if no requests for this room
      if (this.spawnQueue[roomName].length === 0) continue;
      
      // Find available spawns
      const availableSpawns = room.find(FIND_MY_SPAWNS, {
        filter: (spawn) => !spawn.spawning
      });
      
      if (availableSpawns.length === 0) continue;
      
      // Get the highest priority request
      const request = this.spawnQueue[roomName][0];
      
      // Try to spawn the creep
      const result = this.spawnCreep(availableSpawns[0], request);
      
      if (result === OK) {
        // Remove the request from the queue
        this.spawnQueue[roomName].shift();
        Logger.info(`Spawning ${request.role} in ${roomName}`);
      } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Keep the request but don't try again this tick
        Logger.debug(`Not enough energy to spawn ${request.role} in ${roomName}`);
      } else {
        // Something went wrong, remove the request
        this.spawnQueue[roomName].shift();
        Logger.warn(`Failed to spawn ${request.role} in ${roomName}: ${result}`);
      }
    }
  }
  
  /**
   * Process all creeps based on their roles
   */
  @Profiler.wrap('CreepManager.runCreeps')
  public static runCreeps(): void {
    // Reset creep counts
    this.resetCreepCounts();
    this.resetRemoteAssignments();

    // Group creeps by room for better management
    const creepsByRoom: Record<string, Creep[]> = {};
    const creepsByTargetRoom: Record<string, Creep[]> = {};

    // Add all creeps to their respective rooms
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      
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
      this.incrementCreepCount(homeRoom, creep.memory.role);
      
      // Track remote assignments
      if (homeRoom !== targetRoom) {
        this.updateRemoteAssignment(targetRoom, creep.memory.role);
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
      this.logCreepCounts();
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
        }
      }
    }
    // --- END HEATMAP DECAY ---
  }

  /**
   * Track creep assignment to remote rooms
   */
  private static updateRemoteAssignment(roomName: string, role: string): void {
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
   * Reset remote assignment tracking
   */
  private static resetRemoteAssignments(): void {
    this.remoteAssignments = {};
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
      const assignments = this.remoteAssignments[roomName] || { harvester: 0, reserver: 0, hauler: 0 };
      
      // Find the closest owned room to spawn from
      const homeRoom = this.findClosestOwnedRoom(roomName);
      if (!homeRoom) continue;
      
      // Skip if we don't have the home room visible
      const home = Game.rooms[homeRoom];
      if (!home) continue;
      
      // Check if we need a reserver
      if (assignments.reserver < 1) {
        const body = this.getOptimalBody(CreepRole.Reserver, home.energyCapacityAvailable, home);
        
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
        const body = this.getOptimalBody(CreepRole.RemoteHarvester, home.energyCapacityAvailable, home);
        
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
        const body = this.getOptimalBody(CreepRole.Hauler, home.energyCapacityAvailable, home);
        
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
        Logger.error(`Error running creep ${creep.name}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Run a reserver creep
   */
  private static runReserver(creep: Creep): void {
    const targetRoom = creep.memory.targetRoom;
    
    // If we're not in the target room, move there
    if (creep.room.name !== targetRoom) {
      const exitDir = Game.map.findExit(creep.room, targetRoom);
      if (exitDir !== ERR_NO_PATH) {
        const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
        if (exit) {
          creep.moveTo(exit, { reusePath: 20 });
        }
      }
      return;
    }
    
    // If we're in the target room, reserve the controller
    if (creep.room.controller) {
      if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.controller, { reusePath: 20 });
      }
    }
  }

  /**
   * Run a hauler creep
   */
  private static runHauler(creep: Creep): void {
    const homeRoom = creep.memory.homeRoom || creep.room.name;
    const targetRoom = creep.memory.targetRoom || homeRoom;

    // Initialize working state if undefined
    if (creep.memory.working === undefined) {
      creep.memory.working = creep.store.getUsedCapacity() > 0;
    }

    // State transitions
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
      creep.say('🔄 deliver');
    }
    if (creep.memory.working && creep.store.getUsedCapacity() === 0) {
      creep.memory.working = false;
      creep.say('🔄 collect');
    }

    // DELIVERING
    if (creep.memory.working) {
      // Move to home room if not there
      if (creep.room.name !== homeRoom) {
        const exitDir = Game.map.findExit(creep.room, homeRoom);
        if (exitDir !== ERR_NO_PATH) {
          const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
          if (exit) creep.moveTo(exit, { reusePath: 20 });
        }
        return;
      }
      // Find best delivery target
      let target: Structure | null = null;
      // 1. Spawns/extensions with free capacity
      target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (s: AnyStructure) =>
          ((s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
           s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
      });
      // 2. Towers (if not full)
      if (!target) {
        target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
          filter: (s: AnyStructure) =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
      }
      // 3. Storage/terminal (if exists and not full)
      if (!target && creep.room.storage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        target = creep.room.storage;
      }
      if (!target && creep.room.terminal && creep.room.terminal.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        target = creep.room.terminal;
      }
      if (target) {
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(target, { reusePath: 20 });
        }
      } else {
        // Nowhere to deliver, idle at storage or spawn
        const idlePos = (creep.room.storage && creep.room.storage.pos) ||
                        (creep.room.find(FIND_MY_SPAWNS)[0]?.pos) ||
                        new RoomPosition(25, 25, creep.room.name);
        creep.moveTo(idlePos, { reusePath: 20 });
        creep.say('❓ idle');
      }
      return;
    }

    // COLLECTING
    // Move to target room if not there
    if (creep.room.name !== targetRoom) {
      const exitDir = Game.map.findExit(creep.room, targetRoom);
      if (exitDir !== ERR_NO_PATH) {
        const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
        if (exit) creep.moveTo(exit, { reusePath: 20 });
      }
      return;
    }
    // Find best source (container/storage with most energy)
    let sources = creep.room.find(FIND_STRUCTURES, {
      filter: (s: AnyStructure) =>
        (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
        s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    }) as (StructureContainer | StructureStorage)[];
    sources = _.sortBy(sources, s => -s.store[RESOURCE_ENERGY]);
    if (sources.length > 0) {
      if (creep.withdraw(sources[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(sources[0], { reusePath: 20 });
      }
      return;
    }
    // Fallback: dropped energy
    const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
      filter: (r: Resource) => r.resourceType === RESOURCE_ENERGY
    });
    if (dropped) {
      if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
        creep.moveTo(dropped, { reusePath: 20 });
      }
      return;
    }
    // Nothing to collect, idle at a safe spot
    const idlePos = (creep.room.storage && creep.room.storage.pos) ||
                    (creep.room.find(FIND_MY_SPAWNS)[0]?.pos) ||
                    new RoomPosition(25, 25, creep.room.name);
    creep.moveTo(idlePos, { reusePath: 20 });
    creep.say('❓ idle');
  }

  /**
   * Run a scout creep
   */
  private static runScout(creep: Creep): void {
    // If we have a targetRoom, head there
    if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
      const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
      if (exitDir !== ERR_NO_PATH) {
        const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
        if (exit) {
          creep.moveTo(exit, {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.3 },
            reusePath: 5
          });
        }
      }
      return;
    }

    // If we're in the target room, scout it thoroughly
    if (creep.memory.targetRoom && creep.room.name === creep.memory.targetRoom) {
      // Use custom move pattern to explore important areas
      this.scoutRoom(creep);

      // Mark this room as scouted in memory
      if (!Memory.roomData[creep.room.name]) {
        Memory.roomData[creep.room.name] = {
          ownedRoom: false,
          reservedRoom: false,
          lastSeen: Game.time
        } as any;
      } else {
        Memory.roomData[creep.room.name].lastSeen = Game.time;
      }

      // Mark as scouted in parent room's adjacentRooms if applicable
      for (const myRoomName in Game.rooms) {
        const myRoom = Game.rooms[myRoomName];
        if (myRoom.memory.adjacentRooms && myRoom.memory.adjacentRooms[creep.room.name]) {
          myRoom.memory.adjacentRooms[creep.room.name].status = 'scouted';
        }
      }

      // If room is an expansion target, evaluate it
      if (Memory.colony.expansionTargets && Memory.colony.expansionTargets.includes(creep.room.name)) {
        const score = ScoutHelper.evaluateRoom(creep.room);
        if (!Memory.roomData[creep.room.name].expansionScore ||
            Game.time % 100 === 0) { // Update score occasionally
          Memory.roomData[creep.room.name].expansionScore = score;
        }
      }

      // Only change target every 20 ticks to fully explore the room
      if (Game.time % 20 === 0) {
        // Select next room to scout
        const nextRoom = this.selectNextScoutTarget(creep);

        if (nextRoom && nextRoom !== creep.room.name) {
          creep.memory.targetRoom = nextRoom;
          creep.say(`Scout: ${nextRoom}`);
        }
      }
    } else if (!creep.memory.targetRoom) {
      // No target room, select one
      // Priority: unexplored adjacent rooms
      const homeRoom = Game.rooms[creep.memory.homeRoom || creep.room.name];
      if (homeRoom && homeRoom.memory.adjacentRooms) {
        for (const adjRoom in homeRoom.memory.adjacentRooms) {
          if (homeRoom.memory.adjacentRooms[adjRoom].status === 'unexplored') {
            creep.memory.targetRoom = adjRoom;
            creep.say(`Scout: ${adjRoom}`);
            return;
          }
        }
      }
      // Fallback to default logic
      const nextRoom = this.selectNextScoutTarget(creep);
      if (nextRoom) {
        creep.memory.targetRoom = nextRoom;
        creep.say(`Scout: ${nextRoom}`);
      } else {
        // No rooms to scout, wait in home room
        if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
          // Return to home room
          const exitDir = Game.map.findExit(creep.room, creep.memory.homeRoom);
          if (exitDir !== ERR_NO_PATH) {
            const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
            if (exit) {
              creep.moveTo(exit, { reusePath: 20 });
            }
          }
        } else {
          // Wait in spawn
          const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
          if (spawn) {
            creep.moveTo(spawn, { range: 3 });
          }
        }
      }
    }
  }

  /**
   * Select the next room for a scout to target
   */
  private static selectNextScoutTarget(creep: Creep): string | null {
    // Priority 1: Check expansion targets that need scouting
    if (Memory.colony.expansionTargets && Memory.colony.expansionTargets.length > 0) {
      for (const targetRoom of Memory.colony.expansionTargets) {
        // Skip if we've seen this room recently
        if (Memory.roomData[targetRoom] &&
            Memory.roomData[targetRoom].lastSeen > Game.time - 500) {
          continue;
        }

        return targetRoom;
      }
    }

    // Priority 2: Check unvisited rooms in Memory.roomData
    for (const roomName in Memory.roomData) {
      // Skip rooms we've seen recently
      if (Memory.roomData[roomName].lastSeen > Game.time - 1000) {
        continue;
      }

      // Skip rooms that are too far from our territory
      const closestOwnedRoom = ScoutHelper.findClosestOwnedRoom(roomName);
      if (closestOwnedRoom &&
          ScoutHelper.getRoomDistance(roomName, closestOwnedRoom) > 5) {
        continue;
      }

      return roomName;
    }

    // Priority 3: Check adjacent rooms that are unexplored
    const exits = Game.map.describeExits(creep.room.name);
    for (const exitDir in exits) {
      const nextRoom = exits[exitDir];

      // Skip if we've seen this room recently
      if (Memory.roomData[nextRoom] &&
          Memory.roomData[nextRoom].lastSeen > Game.time - 1000) {
        continue;
      }

      return nextRoom;
    }

    return null;
  }

  /**
   * Scout important areas in a room
   */
  private static scoutRoom(creep: Creep): void {
    // Determine points of interest to visit
    const pointsOfInterest = [];

    // Always check controller
    if (creep.room.controller) {
      pointsOfInterest.push(creep.room.controller.pos);
    }

    // Check sources
    const sources = creep.room.find(FIND_SOURCES);
    for (const source of sources) {
      pointsOfInterest.push(source.pos);
    }

    // Check minerals
    const minerals = creep.room.find(FIND_MINERALS);
    for (const mineral of minerals) {
      pointsOfInterest.push(mineral.pos);
    }

    // Add cardinal points and center if no other points
    if (pointsOfInterest.length === 0) {
      pointsOfInterest.push(
        new RoomPosition(25, 25, creep.room.name),
        new RoomPosition(10, 10, creep.room.name),
        new RoomPosition(10, 40, creep.room.name),
        new RoomPosition(40, 10, creep.room.name),
        new RoomPosition(40, 40, creep.room.name)
      );
    }

    // Pick a point based on tick
    const pointIndex = Game.time % pointsOfInterest.length;
    const targetPos = pointsOfInterest[pointIndex];

    // Move to the point
    creep.moveTo(targetPos, {
      visualizePathStyle: { stroke: '#ffffff', opacity: 0.3 },
      reusePath: 5
    });
  }

  /**
   * Reset the creep count tracking
   */
  private static resetCreepCounts(): void {
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
          [CreepRole.Defender]: 0
        };
      }
    }
  }

  /**
   * Increment the count for a specific role in a specific room
   */
  private static incrementCreepCount(roomName: string, role: string): void {
    if (!this.creepCounts[roomName]) {
      this.creepCounts[roomName] = {};
    }

    if (!this.creepCounts[roomName][role]) {
      this.creepCounts[roomName][role] = 0;
    }

    this.creepCounts[roomName][role]++;
  }

  /**
   * Log the current creep counts
   */
  private static logCreepCounts(): void {
    for (const roomName in this.creepCounts) {
      const counts = this.creepCounts[roomName];
      Logger.info(`Room ${roomName} creep counts: ` +
        Object.entries(counts)
          .map(([role, count]) => `${role}: ${count}`)
          .join(', '),
        'CreepManager'
      );
    }
  }
  
  /**
   * Try to spawn a creep with the given request
   */
  private static spawnCreep(spawn: StructureSpawn, request: CreepRequest): ScreepsReturnCode {
    const name = `${request.role}_${Game.time}_${Math.floor(Math.random() * 100)}`;
    
    // Add homeRoom to creep memory if not set
    if (!request.memory.homeRoom) {
      request.memory.homeRoom = spawn.room.name;
    }
    
    // Check if we can spawn the creep
    if (!Helpers.canSpawnCreep(spawn, request.body, name, request.memory)) {
      return ERR_NOT_ENOUGH_ENERGY;
    }
    
    // Spawn the creep
    return Helpers.spawnCreep(spawn, request.body, name, request.memory);
  }
  
  /**
   * Generate adaptive, context-aware body parts based on available energy and room state
   */
  public static getOptimalBody(role: CreepRole, energy: number, room?: Room): BodyPartConstant[] {
    // If room is provided, use its state for dynamic sizing
    let urgent = false;
    let storage = 0;
    let constructionSites = 0;
    let controllerDowngrade = 100000;
    if (room) {
      storage = room.storage?.store[RESOURCE_ENERGY] || 0;
      constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
      controllerDowngrade = room.controller?.ticksToDowngrade || 100000;
      // Urgent if no harvesters, controller at risk, or energy is low
      urgent = (room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'harvester').length === 0)
        || (controllerDowngrade < 2000)
        || (room.energyAvailable < 300);
    }
    // For urgent situations, spawn a minimal creep
    if (urgent) {
      switch (role) {
        case CreepRole.Harvester:
        case CreepRole.Upgrader:
        case CreepRole.Builder:
          return [WORK, CARRY, MOVE];
        case CreepRole.Hauler:
          return [CARRY, CARRY, MOVE];
        case CreepRole.RemoteHarvester:
          return [WORK, CARRY, MOVE];
        default:
          break;
      }
    }
    // Otherwise, build the biggest, most efficient creep for the role and situation
    let body: BodyPartConstant[] = [];
    let partCost = 0;
    switch (role) {
      case CreepRole.Harvester: {
        // For high energy, prefer 2:1:1 WORK:CARRY:MOVE, up to 50 parts
        while (energy - partCost >= 200 && body.length < 50) {
          body.push(WORK, CARRY, MOVE);
          partCost += 200;
        }
        break;
      }
      case CreepRole.Upgrader: {
        // If controller is at risk, spawn small, otherwise big
        while (energy - partCost >= 200 && body.length < 50) {
          body.push(WORK, CARRY, MOVE);
          partCost += 200;
        }
        break;
      }
      case CreepRole.Builder: {
        // If lots of construction, make big builders; else, small
        const ratio = constructionSites > 3 ? 2 : 1;
        while (energy - partCost >= 200 && body.length < 50) {
          for (let i = 0; i < ratio && body.length < 50 && energy - partCost >= 200; i++) {
            body.push(WORK, CARRY, MOVE);
            partCost += 200;
          }
        }
        break;
      }
      case CreepRole.Hauler: {
        // For haulers, maximize CARRY/MOVE
        while (energy - partCost >= 100 && body.length < 50) {
          body.push(CARRY, MOVE);
          partCost += 100;
        }
        break;
      }
      case CreepRole.RemoteHarvester: {
        // For remote, more MOVE for distance
        while (energy - partCost >= 250 && body.length < 50) {
          body.push(WORK, CARRY, MOVE, MOVE);
          partCost += 250;
        }
        break;
      }
      default:
        // Fallback to previous logic for other roles
        return CreepManager.getOptimalBodyOld(role, energy);
    }
    return body.length > 0 ? body : [WORK, CARRY, MOVE];
  }

  /**
   * Legacy fallback for non-worker roles
   */
  public static getOptimalBodyOld(role: CreepRole, energy: number): BodyPartConstant[] {
    // Basic body - every creep needs these
    let body: BodyPartConstant[] = [];
    let remainingEnergy = 0;

    switch (role) {
      case CreepRole.Harvester:
        // Base body
        if (energy >= 300) {
          body = [WORK, WORK, CARRY, MOVE];
        } else {
          body = [WORK, CARRY, MOVE];
        }

        // Add more parts if energy allows
        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Add more WORK parts for efficient harvesting
        while (remainingEnergy >= 100 && body.filter(p => p === WORK).length < 5) {
          body.push(WORK);
          remainingEnergy -= 100;
        }

        // Add balanced CARRY and MOVE
        while (remainingEnergy >= 100 && body.length < 50) {
          if (remainingEnergy >= 50) {
            body.push(CARRY);
            remainingEnergy -= 50;
          }

          if (remainingEnergy >= 50) {
            body.push(MOVE);
            remainingEnergy -= 50;
          }
        }

        return body;

      case CreepRole.Upgrader:
        // Upgraders need WORK parts and some CARRY/MOVE
        if (energy >= 300) {
          body = [WORK, WORK, CARRY, MOVE];
        } else {
          body = [WORK, CARRY, MOVE];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Balance WORK, CARRY and MOVE
        while (remainingEnergy >= 150 && body.length < 50) {
          if (remainingEnergy >= 100) {
            body.push(WORK);
            remainingEnergy -= 100;
          }

          if (remainingEnergy >= 50) {
            body.push(CARRY);
            remainingEnergy -= 50;
          }

          if (remainingEnergy >= 50) {
            body.push(MOVE);
            remainingEnergy -= 50;
          }
        }

        return body;

      case CreepRole.Builder:
        // Builders need balanced WORK, CARRY and MOVE
        if (energy >= 300) {
          body = [WORK, CARRY, CARRY, MOVE, MOVE];
        } else {
          body = [WORK, CARRY, MOVE];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Balance all parts
        while (remainingEnergy >= 200 && body.length < 50) {
          if (remainingEnergy >= 100) {
            body.push(WORK);
            remainingEnergy -= 100;
          }

          if (remainingEnergy >= 50) {
            body.push(CARRY);
            remainingEnergy -= 50;
          }

          if (remainingEnergy >= 50) {
            body.push(MOVE);
            remainingEnergy -= 50;
          }
        }

        return body;

      case CreepRole.Archer:
        // Archers need RANGED_ATTACK and MOVE
        if (energy >= 300) {
          body = [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE];
        } else {
          body = [RANGED_ATTACK, MOVE];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Balance RANGED_ATTACK and MOVE
        while (remainingEnergy >= 200 && body.length < 50) {
          if (remainingEnergy >= 150) {
            body.push(RANGED_ATTACK);
            remainingEnergy -= 150;
          }

          if (remainingEnergy >= 50) {
            body.push(MOVE);
            remainingEnergy -= 50;
          }
        }

        return body;

      case CreepRole.Reserver:
        // Reservers need CLAIM parts
        if (energy >= 650) {
          body = [CLAIM, CLAIM, MOVE, MOVE];
        } else {
          body = [CLAIM, MOVE];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Add more CLAIM and MOVE if possible
        while (remainingEnergy >= 650 && body.length < 50) {
          if (remainingEnergy >= 600) {
            body.push(CLAIM);
            remainingEnergy -= 600;
          }

          if (remainingEnergy >= 50) {
            body.push(MOVE);
            remainingEnergy -= 50;
          }
        }

        return body;

      case CreepRole.Hauler:
        // Haulers need lots of CARRY and MOVE
        if (energy >= 300) {
          body = [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
        } else {
          body = [CARRY, CARRY, MOVE, MOVE];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Add balanced CARRY and MOVE
        while (remainingEnergy >= 100 && body.length < 50) {
          if (remainingEnergy >= 50) {
            body.push(CARRY);
            remainingEnergy -= 50;
          }

          if (remainingEnergy >= 50) {
            body.push(MOVE);
            remainingEnergy -= 50;
          }
        }

        return body;

      case CreepRole.Scout:
        // Scouts just need MOVE parts
        body = [MOVE];

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Add more MOVE parts
        while (remainingEnergy >= 50 && body.length < 50) {
          body.push(MOVE);
          remainingEnergy -= 50;
        }

        return body;

      case CreepRole.Claimer:
        // Claimers need CLAIM parts
        if (energy >= 850) {
          body = [CLAIM, MOVE, MOVE, MOVE];
        } else if (energy >= 650) {
          body = [CLAIM, MOVE, MOVE];
        } else {
          body = [CLAIM, MOVE];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Add more MOVE parts if possible, but just one CLAIM part
        while (remainingEnergy >= 50 && body.length < 50) {
          body.push(MOVE);
          remainingEnergy -= 50;
        }

        return body;

      case CreepRole.Destroyer:
        // Destroyers need TOUGH and ATTACK parts
        if (energy >= 650) {
          body = [TOUGH, TOUGH, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK];
        } else if (energy >= 390) {
          body = [TOUGH, MOVE, ATTACK, ATTACK, ATTACK];
        } else {
          body = [MOVE, ATTACK];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Add more TOUGH and ATTACK parts
        while (remainingEnergy >= 200 && body.length < 50) {
          if (remainingEnergy >= 150) {
            body.push(TOUGH);
            remainingEnergy -= 150;
          }

          if (remainingEnergy >= 50) {
            body.push(MOVE);
            remainingEnergy -= 50;
          }
        }

        return body;

      case CreepRole.Defender:
        // Defenders need TOUGH and ATTACK parts
        if (energy >= 550) {
          body = [TOUGH, TOUGH, MOVE, MOVE, ATTACK, ATTACK, ATTACK, HEAL];
        } else if (energy >= 390) {
          body = [TOUGH, MOVE, ATTACK, ATTACK, HEAL];
        } else {
          body = [MOVE, ATTACK];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Add more TOUGH and ATTACK parts
        while (remainingEnergy >= 200 && body.length < 50) {
          if (remainingEnergy >= 150) {
            body.push(TOUGH);
            remainingEnergy -= 150;
          }

          if (remainingEnergy >= 50) {
            body.push(MOVE);
            remainingEnergy -= 50;
          }
        }

        return body;

      default:
        // Default body
        return [WORK, CARRY, MOVE];
    }
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

  // In requestCreeps (or similar room logic), add destroyer spawn logic
  // This is a simplified version; you may want to place it in a more advanced room evaluation section
  private static requestCreeps(room: Room): void {
    // ... existing code ...
    // Spawn a defender if hostiles are detected and no defender present
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    const defenderCount = _.filter(Game.creeps, c => c.memory.role === CreepRole.Defender && c.memory.homeRoom === room.name).length;
    if (hostiles.length > 0 && defenderCount === 0) {
      const energy = room.energyCapacityAvailable;
      let body: BodyPartConstant[] = [];
      if (energy >= 550) {
        body = [TOUGH, TOUGH, MOVE, MOVE, ATTACK, ATTACK, ATTACK, HEAL];
      } else if (energy >= 390) {
        body = [TOUGH, MOVE, ATTACK, ATTACK, HEAL];
      } else {
        body = [MOVE, ATTACK];
      }
      this.requestCreep({
        role: CreepRole.Defender,
        body: body,
        priority: 95, // High priority
        roomName: room.name,
        memory: {
          role: CreepRole.Defender,
          homeRoom: room.name
        }
      });
      Logger.info(`[${room.name}] Requested defender due to hostiles.`);
      return;
    }
    // ... existing code ...
  }

  /**
   * Build a fast RoomProfile for a given room (CPU/memory efficient)
   */
  public static buildRoomProfile(room: Room): RoomProfile {
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

  /**
   * Generic, adaptive creep planner: returns CreepRequests for a room based on its profile and empire state
   */
  public static planCreeps(roomProfile: RoomProfile, empireProfile: EmpireProfile): CreepRequest[] {
    const requests: CreepRequest[] = [];
    const { name, rcl, energyCapacity, storageEnergy, controllerDowngrade, emergency, hostiles, boostedHostiles, constructionSites, damagedStructures, creepCounts } = roomProfile;

    // --- SUPER-SAFE FALLBACK: Always ensure at least one harvester and one upgrader ---
    const harvesters = _.filter(Game.creeps, c => c.memory.role === CreepRole.Harvester && c.memory.homeRoom === name);
    const upgraders = _.filter(Game.creeps, c => c.memory.role === CreepRole.Upgrader && c.memory.homeRoom === name);
    const builders = _.filter(Game.creeps, c => c.memory.role === CreepRole.Builder && c.memory.homeRoom === name);
    const numSources = Game.rooms[name] ? Game.rooms[name].find(FIND_SOURCES).length : 1;
    const energyAvailable = roomProfile.energyAvailable;
    const emergencyBody = (energyCapacity >= 300 || energyAvailable >= 300) ? [WORK, CARRY, MOVE, MOVE] : [WORK, CARRY, MOVE];
    if (harvesters.length < Math.min(2, numSources)) {
      for (let i = harvesters.length; i < Math.min(2, numSources); i++) {
        requests.push({
          role: CreepRole.Harvester,
          body: this.getOptimalBody(CreepRole.Harvester, energyAvailable, Game.rooms[name]),
          priority: 100,
          roomName: name,
          memory: { role: CreepRole.Harvester, homeRoom: name }
        });
      }
      return requests;
    }
    // Emergency upgrader
    if (upgraders.length === 0) {
      requests.push({
        role: CreepRole.Upgrader,
        body: this.getOptimalBody(CreepRole.Upgrader, energyAvailable, Game.rooms[name]),
        priority: 99,
        roomName: name,
        memory: { role: CreepRole.Upgrader, homeRoom: name }
      });
      return requests;
    }
    // Emergency builder in early game (RCL 1/2 or construction sites)
    const earlyRcl = Game.rooms[name]?.controller?.level || 1;
    const hasSites = Game.rooms[name]?.find(FIND_MY_CONSTRUCTION_SITES).length > 0;
    if (builders.length === 0 && (earlyRcl <= 2 || hasSites)) {
      requests.push({
        role: CreepRole.Builder,
        body: this.getOptimalBody(CreepRole.Builder, energyAvailable, Game.rooms[name]),
        priority: 98,
        roomName: name,
        memory: { role: CreepRole.Builder, homeRoom: name }
      });
      return requests;
    }

    // Helper: calculate average body size for a role in this room
    function averageBodySize(role: CreepRole): number {
      const creeps = _.filter(Game.creeps, c => c.memory.role === role && c.memory.homeRoom === name);
      if (creeps.length === 0) return 0;
      return _.sumBy(creeps, c => c.body.length) / creeps.length;
    }

    // Helper: calculate max body size for a role in this room
    function maxBodySize(role: CreepRole): number {
      // Use getOptimalBody to get the largest possible body for this role
      const body = CreepManager.getOptimalBody(role, energyCapacity, Game.rooms[name]);
      return body.length;
    }

    // --- Setup for dynamic logic ---
    const idealBody: Partial<Record<CreepRole, number>> = {};
    const numSites = roomProfile.constructionSites;

    // --- Level as fast as possible: prioritize upgraders and energy delivery ---
    // 1. Maximize upgraders (largest possible, as many as can be supplied with energy)
    // 2. Minimize builders (only for essential construction)
    // 3. Ensure harvesters/haulers keep upgraders supplied

    // --- Upgraders ---
    // At RCL < 8, spawn as many large upgraders as you can keep supplied
    let maxUpgraderWork = Math.floor(energyCapacity / 200); // Each WORK+CARRY+MOVE = 200
    if (maxUpgraderWork > 15) maxUpgraderWork = 15; // Controller upgrade cap
    let maxUpgraders = 1;
    let availableEnergy = (Game.rooms[name]?.storage?.store[RESOURCE_ENERGY] || 0) + energyCapacity;
    if (rcl < 8) {
      // Try to keep at least 1 upgrader per source, more if lots of energy
      maxUpgraders = Math.max(numSources, Math.floor(availableEnergy / 2000));
      if (availableEnergy > 10000) maxUpgraders += 1;
      if (availableEnergy > 50000) maxUpgraders += 2;
    }
    idealBody[CreepRole.Upgrader] = maxUpgraderWork * maxUpgraders;

    // --- Auto-tuning: Track controller progress per tick ---
    const roomObj = Game.rooms[name];
    if (roomObj && roomObj.controller && roomObj.controller.my) {
      if (!roomObj.memory.lastControllerProgress) roomObj.memory.lastControllerProgress = 0;
      if (!roomObj.memory.progressHistory) roomObj.memory.progressHistory = [];
      const progressDelta = roomObj.controller.progress - (roomObj.memory.lastControllerProgress || 0);
      roomObj.memory.progressHistory.push(progressDelta);
      if (roomObj.memory.progressHistory.length > 200) roomObj.memory.progressHistory.shift();
      roomObj.memory.lastControllerProgress = roomObj.controller.progress;
    }
    // --- Calculate average progress per tick ---
    let avgProgress = 0;
    if (roomObj && roomObj.memory.progressHistory && roomObj.memory.progressHistory.length > 0) {
      avgProgress = _.sum(roomObj.memory.progressHistory) / roomObj.memory.progressHistory.length;
    }
    // --- Auto-tune upgrader count based on progress and energy ---
    let autoTunedUpgraders = maxUpgraders;
    if (avgProgress < 2 && availableEnergy > 5000) autoTunedUpgraders++;
    if (avgProgress > 10 && availableEnergy < 2000) autoTunedUpgraders = Math.max(1, autoTunedUpgraders - 1);
    maxUpgraders = autoTunedUpgraders;
    idealBody[CreepRole.Upgrader] = maxUpgraderWork * maxUpgraders;

    // --- Builders ---
    // Only spawn builders if there is essential construction (extensions for next RCL, storage at RCL 4, spawn if missing)
    let essentialSites = 0;
    if (numSites > 0) {
      // Count only essential construction sites
      const room = Game.rooms[name];
      if (room) {
        const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
        essentialSites = sites.filter(site =>
          site.structureType === STRUCTURE_EXTENSION ||
          site.structureType === STRUCTURE_SPAWN ||
          (site.structureType === STRUCTURE_STORAGE && rcl === 4)
        ).length;
      }
    }
    idealBody[CreepRole.Builder] = Math.min(15, essentialSites * 5); // e.g., 5 parts per essential site, max 15

    // --- Harvesters ---
    // Always keep all sources harvested
    idealBody[CreepRole.Harvester] = numSources * 10;

    // --- Haulers ---
    // Only spawn if needed to move energy to upgraders (e.g., if containers/storage are far from controller)
    // For now, keep at 0 for owned rooms unless remote mining is detected elsewhere
    idealBody[CreepRole.Hauler] = 0;

    // --- Defenders ---
    idealBody[CreepRole.Defender] = emergency ? Math.max(10, (hostiles + boostedHostiles) * 5) : 0;

    // --- Calculate desired count for each role based on average body size ---
    const desired: Record<string, number> = {};
    for (const role of Object.keys(idealBody) as CreepRole[]) {
      const ideal = idealBody[role] || 0;
      const avgSize = averageBodySize(role) || 1;
      desired[role] = Math.max(1, Math.ceil(ideal / avgSize));
    }
    // --- Remote mining/reserving ---
    if (empireProfile && Memory.colony && Memory.colony.rooms && Memory.colony.rooms.reserved) {
      for (const remoteRoom of Memory.colony.rooms.reserved) {
        // Find closest owned room
        const homeRoom = this.findClosestOwnedRoom(remoteRoom);
        if (!homeRoom || homeRoom !== roomProfile.name) continue; // Only plan for this room
        // Get current assignments
        const assignments = roomProfile.remoteAssignments[remoteRoom] || { harvester: 0, reserver: 0, hauler: 0 };
        // Reserver
        if (assignments.reserver < 1) {
          requests.push({
            role: CreepRole.Reserver,
            body: this.getOptimalBody(CreepRole.Reserver, energyCapacity),
            priority: 40,
            roomName: homeRoom,
            memory: { role: CreepRole.Reserver, homeRoom, targetRoom: remoteRoom }
          });
        }
        // Remote harvester
        if (assignments.harvester < 2) {
          requests.push({
            role: CreepRole.RemoteHarvester,
            body: this.getOptimalBody(CreepRole.RemoteHarvester, energyCapacity),
            priority: 50,
            roomName: homeRoom,
            memory: { role: CreepRole.RemoteHarvester, homeRoom, targetRoom: remoteRoom }
          });
        }
        // Hauler
        if (assignments.harvester > 0 && assignments.hauler < assignments.harvester) {
          requests.push({
            role: CreepRole.Hauler,
            body: this.getOptimalBody(CreepRole.Hauler, energyCapacity),
            priority: 45,
            roomName: homeRoom,
            memory: { role: CreepRole.Hauler, homeRoom, targetRoom: remoteRoom }
          });
        }
      }
    }
    // --- Scouts ---
    if (Game.time % 1000 === 0) { // Only check occasionally for CPU
      const scoutTargets = (Memory.colony.expansionTargets || []).filter(roomName =>
        !Memory.roomData[roomName] || (Game.time - (Memory.roomData[roomName].lastSeen || 0) > 10000)
      );
      if (scoutTargets.length > 0 && (creepCounts[CreepRole.Scout] || 0) < 1) {
        requests.push({
          role: CreepRole.Scout,
          body: [MOVE, MOVE, MOVE, MOVE, MOVE],
          priority: 10,
          roomName: roomProfile.name,
          memory: { role: CreepRole.Scout, homeRoom: roomProfile.name, targetRoom: scoutTargets[0] }
        });
      }
    }
    // --- Empire-level cross-room support: energy delivery ---
    if (emergency && storageEnergy < 1000 && empireProfile && empireProfile.rooms.length > 1) {
      const donors = empireProfile.rooms.filter(r => r.storageEnergy > 20000 && r.name !== roomProfile.name);
      for (const donor of donors) {
        requests.push({
          role: CreepRole.Hauler,
          body: this.getOptimalBody(CreepRole.Hauler, donor.energyCapacity),
          priority: 90,
          roomName: donor.name,
          memory: { role: CreepRole.Hauler, homeRoom: donor.name, targetRoom: roomProfile.name }
        });
        break; // Only one donor per tick for CPU
      }
    }
    // --- Analytics: Track idle ticks for each role ---
    if (roomObj && roomObj.controller && roomObj.controller.my) {
      if (!roomObj.memory.idleTicks) roomObj.memory.idleTicks = {};
      for (const role of [CreepRole.Harvester, CreepRole.Upgrader, CreepRole.Builder, CreepRole.Hauler]) {
        if (roomObj.memory.idleTicks[role] === undefined) roomObj.memory.idleTicks[role] = 0;
        // Count creeps of this role that are idle (not working or not carrying/harvesting/building)
        const creeps = _.filter(Game.creeps, c => c.memory.role === role && c.memory.homeRoom === name);
        let idle = 0;
        for (const creep of creeps) {
          if (role === CreepRole.Harvester && creep.store.getFreeCapacity() === 0) idle++;
          if (role === CreepRole.Upgrader && creep.store[RESOURCE_ENERGY] === 0) idle++;
          if (role === CreepRole.Builder && creep.store[RESOURCE_ENERGY] === 0) idle++;
          if (role === CreepRole.Hauler && creep.store.getUsedCapacity() === 0) idle++;
        }
        roomObj.memory.idleTicks[role] = ((roomObj.memory.idleTicks[role] || 0) + idle) % 1000;
      }
    }
    // --- Auto-tune harvesters ---
    let autoTunedHarvesters = desired[CreepRole.Harvester] || 1;
    if (roomObj) {
      const sources = roomObj.find(FIND_SOURCES);
      const unharvested = sources.filter(s => s.energy > 0).length;
      if (unharvested > 0 && availableEnergy < energyCapacity) autoTunedHarvesters++;
      if (roomObj.memory.idleTicks && roomObj.memory.idleTicks[CreepRole.Harvester] > 10) autoTunedHarvesters = Math.max(1, autoTunedHarvesters - 1);
    }
    desired[CreepRole.Harvester] = autoTunedHarvesters;
    // --- Auto-tune haulers ---
    let autoTunedHaulers = desired[CreepRole.Hauler] || 0;
    if (roomObj) {
      const containers = roomObj.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
      const fullContainers = containers.filter(c => c.store.getFreeCapacity(RESOURCE_ENERGY) === 0).length;
      if (fullContainers > 0) autoTunedHaulers++;
      if (roomObj.memory.idleTicks && roomObj.memory.idleTicks[CreepRole.Hauler] > 10) autoTunedHaulers = Math.max(0, autoTunedHaulers - 1);
    }
    desired[CreepRole.Hauler] = autoTunedHaulers;
    // --- Auto-tune builders ---
    let autoTunedBuilders = desired[CreepRole.Builder] || 0;
    if (roomObj) {
      const sites = roomObj.find(FIND_MY_CONSTRUCTION_SITES);
      const unfinished = sites.filter(s => s.progress < s.progressTotal).length;
      if (unfinished > 0 && availableEnergy > energyCapacity * 0.5) autoTunedBuilders++;
      if (roomObj.memory.idleTicks && roomObj.memory.idleTicks[CreepRole.Builder] > 10) autoTunedBuilders = Math.max(0, autoTunedBuilders - 1);
    }
    desired[CreepRole.Builder] = autoTunedBuilders;
    // --- Analytics logging ---
    if (Game.time % 100 === 0 && roomObj) {
      Logger.info(`[Analytics][${name}] Controller progress/tick: ${avgProgress.toFixed(2)}, Energy: ${energyCapacity}, Storage: ${storageEnergy}, IdleTicks: ${JSON.stringify(roomObj.memory.idleTicks)}, CreepCounts: ${JSON.stringify(creepCounts)}`);
    }
    // --- Debug logging ---
    if (Game.time % 100 === 0) {
      Logger.info(`[${roomProfile.name}] Profile: ` + JSON.stringify(roomProfile));
      Logger.info(`[Empire] Profile: ` + JSON.stringify(empireProfile));
      Logger.info(`[${roomProfile.name}] Planned creep requests: ` + JSON.stringify(requests.map(r => ({ role: r.role, room: r.roomName, target: r.memory.targetRoom, priority: r.priority }))));
    }
    return requests;
  }
}

// Extend CreepMemory interface for multi-room support
declare global {
  interface CreepMemory {
    homeRoom?: string;         // The room this creep was spawned in
    targetRoom?: string;       // The room this creep should work in
    working?: boolean;         // Whether the creep is currently working or gathering resources
    stage?: number;            // For complex tasks requiring multiple steps
  }
}