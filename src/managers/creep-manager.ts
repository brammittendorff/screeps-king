/**
 * Creep Manager
 * Handles creep spawning, assignment, and lifecycle
 * Extended for multi-room support
 */

import { Logger } from '../utils/logger';
import { Helpers } from '../utils/helpers';
import { ScoutHelper } from '../utils/scout-helper';
import * as _ from 'lodash';
import { AI } from '../ai';
import { RoomCache } from '../utils/room-cache';

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
  }
  
  /**
   * Process the spawn queue for all rooms
   */
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
      } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Keep the request but don't try again this tick
      } else {
        // Something went wrong, remove the request
        this.spawnQueue[roomName].shift();
      }
    }
  }
  
  /**
   * Process all creeps based on their roles
   */
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
          if (Object.keys(room.memory.roadHeatmap).length === 0) {
            delete room.memory.roadHeatmap;
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
        // Something went wrong, remove the request
        this.spawnQueue[roomName].shift();
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
    }
    if (creep.memory.working && creep.store.getUsedCapacity() === 0) {
      creep.memory.working = false;
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
      }
    }

    // COLLECTING
    // Move to target room if not there
    if (creep.room.name !== targetRoom) {
      const exitDir = Game.map.findExit(creep.room, targetRoom);
      if (exitDir !== ERR_NO_PATH) {
        const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
        if (exit) creep.moveTo(exit, { reusePath: 20 });
      }
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
    }
    // Fallback: dropped energy
    const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
      filter: (r: Resource) => r.resourceType === RESOURCE_ENERGY
    });
    if (dropped) {
      if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
        creep.moveTo(dropped, { reusePath: 20 });
      }
    }
    // Nothing to collect, idle at a safe spot
    const idlePos = (creep.room.storage && creep.room.storage.pos) ||
                    (creep.room.find(FIND_MY_SPAWNS)[0]?.pos) ||
                    new RoomPosition(25, 25, creep.room.name);
    creep.moveTo(idlePos, { reusePath: 20 });
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
            return;
          }
        }
      }
      // Fallback to default logic
      const nextRoom = this.selectNextScoutTarget(creep);
      if (nextRoom) {
        creep.memory.targetRoom = nextRoom;
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
    }
  }
  
  /**
   * Try to spawn a creep with the given request
   */
  private static spawnCreep(spawn: StructureSpawn, request: CreepRequest): ScreepsReturnCode {
    // Always include role and room in the name
    const name = `${request.role}_${request.roomName}_${Game.time}_${Math.floor(Math.random() * 100)}`;
    
    // Add homeRoom to creep memory if not set
    if (!request.memory.homeRoom) {
      request.memory.homeRoom = spawn.room.name;
    }
    
    // Log when spawning upgraders and other creeps
    if (request.role === CreepRole.Upgrader) {
      Logger.info(`[CreepManager] Requesting UPGRADER: ${name} in room ${request.roomName}`);
    } else {
      Logger.info(`[CreepManager] Requesting ${request.role}: ${name} in room ${request.roomName}`);
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
    // --- DYNAMIC BODY SIZING BASED ON RCL AND SWARM/SCALING LOGIC ---
    let urgent = false;
    let storage = 0;
    let constructionSites = 0;
    let controllerDowngrade = 100000;
    let rcl = 1;
    if (room) {
      storage = room.storage?.store[RESOURCE_ENERGY] || 0;
      constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
      controllerDowngrade = room.controller?.ticksToDowngrade || 100000;
      rcl = room.controller?.level || 1;
      urgent = (room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'harvester').length === 0)
        || (controllerDowngrade < 2000)
        || (room.energyAvailable < 300);
    }
    // --- EMERGENCY: Always spawn a minimal harvester if all creeps are dead or controller at risk ---
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
    // --- SWARM LOGIC FOR RCL1-2 ---
    if (rcl <= 2) {
      switch (role) {
        case CreepRole.Harvester:
        case CreepRole.Upgrader:
        case CreepRole.Builder:
          // Swarm: small, cheap, fast creeps
          if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
          return [WORK, CARRY, MOVE];
        case CreepRole.Hauler:
          return [CARRY, CARRY, MOVE];
        case CreepRole.RemoteHarvester:
          return [WORK, CARRY, MOVE];
        default:
          break;
      }
    }
    // --- SCALING LOGIC FOR RCL3+ ---
    let body: BodyPartConstant[] = [];
    let partCost = 0;
    let maxParts = 50;
    // Cap body size for each role for efficiency
    let maxHarvesterParts = rcl < 5 ? 8 : 16;
    let maxUpgraderParts = rcl < 5 ? 8 : 15;
    let maxBuilderParts = rcl < 5 ? 8 : 15;
    let maxHaulerParts = rcl < 5 ? 10 : 20;
    switch (role) {
      case CreepRole.Harvester: {
        while (energy - partCost >= 200 && body.length < Math.min(maxParts, maxHarvesterParts)) {
          body.push(WORK, CARRY, MOVE);
          partCost += 200;
        }
        break;
      }
      case CreepRole.Upgrader: {
        while (energy - partCost >= 200 && body.length < Math.min(maxParts, maxUpgraderParts)) {
          body.push(WORK, CARRY, MOVE);
          partCost += 200;
        }
        break;
      }
      case CreepRole.Builder: {
        const ratio = constructionSites > 3 ? 2 : 1;
        while (energy - partCost >= 200 && body.length < Math.min(maxParts, maxBuilderParts)) {
          for (let i = 0; i < ratio && body.length < Math.min(maxParts, maxBuilderParts) && energy - partCost >= 200; i++) {
            body.push(WORK, CARRY, MOVE);
            partCost += 200;
          }
        }
        break;
      }
      case CreepRole.Hauler: {
        while (energy - partCost >= 100 && body.length < Math.min(maxParts, maxHaulerParts)) {
          body.push(CARRY, MOVE);
          partCost += 100;
        }
        break;
      }
      case CreepRole.RemoteHarvester: {
        while (energy - partCost >= 250 && body.length < 12) { // remote: smaller for pathing
          body.push(WORK, CARRY, MOVE, MOVE);
          partCost += 250;
        }
        break;
      }
      default:
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
      return;
    }
    // ... existing code ...
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
    const emptyExtensions = extensions.filter(e => e.store.getFreeCapacity(RESOURCE_ENERGY) > 0).length;
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

  /**
   * Generic, adaptive creep planner: returns CreepRequests for a room based on its profile and empire state
   */
  public static planCreeps(roomProfile: RoomProfile, empireProfile: EmpireProfile): CreepRequest[] {
    const requests: CreepRequest[] = [];
    const { name, rcl, energyCapacity, storageEnergy, controllerDowngrade, emergency, hostiles, boostedHostiles, constructionSites, damagedStructures, creepCounts } = roomProfile;
    const roomObj = Game.rooms[roomProfile.name];
    // --- EMPIRE-LEVEL: Emergency logic ---
    const harvesters = _.filter(Game.creeps, c => c.memory.role === CreepRole.Harvester && c.memory.homeRoom === name);
    if (harvesters.length === 0) {
      // Always ensure at least one harvester
      requests.push({
        role: CreepRole.Harvester,
        body: this.getOptimalBody(CreepRole.Harvester, roomProfile.energyAvailable, roomObj),
        priority: 120,
        roomName: name,
        memory: { role: CreepRole.Harvester, homeRoom: name }
      });
      return requests;
    }
    // --- PROFESSIONAL ROOM BOOTSTRAP LOGIC ---
    // 1. Assign harvesters/miners to sources (big WORK bodies if possible)
    const sources = roomObj ? roomObj.find(FIND_SOURCES) : [];
    const harvesterAssignments: Record<string, number> = {};
    for (const source of sources) harvesterAssignments[source.id] = 0;
    for (const creep of harvesters) {
      if (creep.memory.targetSourceId && harvesterAssignments[creep.memory.targetSourceId] !== undefined) {
        harvesterAssignments[creep.memory.targetSourceId]++;
      }
    }
    let harvestersRequested = 0;
    for (const source of sources) {
      if (harvesterAssignments[source.id] < 1) {
        // Use largest possible harvester body for fast mining
        const harvesterBody = this.getOptimalBody(CreepRole.Harvester, roomProfile.energyCapacity, roomObj);
        requests.push({
          role: CreepRole.Harvester,
          body: harvesterBody,
          priority: 110,
          roomName: name,
          memory: { role: CreepRole.Harvester, homeRoom: name, targetSourceId: source.id }
        });
        harvestersRequested++;
      }
    }
    // Prevent over-spawning: never request more harvesters than sources
    if (harvesters.length + harvestersRequested > sources.length) {
      // Remove extra harvester requests if any
      requests.splice(-harvestersRequested);
    }
    // 2. Upgraders: use big WORK bodies if energy/storage is high
    let desiredUpgraders = 1;
    let upgraderBody = this.getOptimalBody(CreepRole.Upgrader, roomProfile.energyCapacity, roomObj);
    if (emergency) {
      desiredUpgraders = Math.max(2, sources.length + 1);
    } else if (storageEnergy > 20000) {
      desiredUpgraders = Math.min(5, Math.floor(storageEnergy / 10000));
      // If storage is very high, use max body for upgraders
      if (storageEnergy > 50000) {
        upgraderBody = this.getOptimalBody(CreepRole.Upgrader, Math.min(roomProfile.energyCapacity, 3000), roomObj);
      }
    }
    const upgraders = _.filter(Game.creeps, c => c.memory.role === CreepRole.Upgrader && c.memory.homeRoom === name);
    if (upgraders.length < desiredUpgraders) {
      requests.push({
        role: CreepRole.Upgrader,
        body: upgraderBody,
        priority: 100,
        roomName: name,
        memory: { role: CreepRole.Upgrader, homeRoom: name }
      });
    }
    // 3. Builder logic: Only spawn if there are construction sites
    let desiredBuilders = 0;
    if (constructionSites > 0) {
      desiredBuilders = Math.min(2, Math.ceil(constructionSites / 5));
      if (rcl < 4) desiredBuilders = 1; // Limit builders before RCL 4
    }
    const builders = _.filter(Game.creeps, c => c.memory.role === CreepRole.Builder && c.memory.homeRoom === name);
    if (builders.length < desiredBuilders) {
      requests.push({
        role: CreepRole.Builder,
        body: this.getOptimalBody(CreepRole.Builder, roomProfile.energyCapacity, roomObj),
        priority: 90,
        roomName: name,
        memory: { role: CreepRole.Builder, homeRoom: name }
      });
    }
    // 4. Hauler logic: Only after RCL 4 or if storage exists
    let desiredHaulers = 0;
    if (rcl >= 4 || (roomObj && roomObj.storage)) {
      desiredHaulers = sources.length;
    }
    const haulers = _.filter(Game.creeps, c => c.memory.role === CreepRole.Hauler && c.memory.homeRoom === name);
    if (haulers.length < desiredHaulers) {
      requests.push({
        role: CreepRole.Hauler,
        body: this.getOptimalBody(CreepRole.Hauler, roomProfile.energyCapacity, roomObj),
        priority: 80,
        roomName: name,
        memory: { role: CreepRole.Hauler, homeRoom: name }
      });
    }
    // 5. Extra upgraders if energy is abundant and spawn is idle
    if (storageEnergy > 30000 && upgraders.length < 5 && requests.length === 0) {
      requests.push({
        role: CreepRole.Upgrader,
        body: this.getOptimalBody(CreepRole.Upgrader, roomProfile.energyCapacity, roomObj),
        priority: 60,
        roomName: name,
        memory: { role: CreepRole.Upgrader, homeRoom: name }
      });
    }
    return requests;
  }
}