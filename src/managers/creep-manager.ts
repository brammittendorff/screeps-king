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

export enum CreepRole {
  Harvester = 'harvester',
  Upgrader = 'upgrader',
  Builder = 'builder',
  Archer = 'archer',
  Reserver = 'reserver',
  RemoteHarvester = 'remoteHarvester',
  Hauler = 'hauler',
  Scout = 'scout',
  Claimer = 'claimer'
}

export interface CreepRequest {
  role: CreepRole;
  body: BodyPartConstant[];
  memory: Partial<CreepMemory>;
  priority: number;
  roomName: string;
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
        const body = this.getOptimalBody(CreepRole.Reserver, home.energyCapacityAvailable);
        
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
        const body = this.getOptimalBody(CreepRole.RemoteHarvester, home.energyCapacityAvailable);
        
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
        const body = this.getOptimalBody(CreepRole.Hauler, home.energyCapacityAvailable);
        
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
        const role = creep.memory.role || CreepRole.Harvester;

        // Run appropriate role logic
        switch (role) {
          case CreepRole.Harvester:
            if (global.ai.harvester && global.ai.harvester.task) {
              global.ai.harvester.task(creep);
            }
            break;
          case CreepRole.Upgrader:
            if (global.ai.upgrader && global.ai.upgrader.task) {
              global.ai.upgrader.task(creep);
            }
            break;
          case CreepRole.Builder:
            if (global.ai.builder && global.ai.builder.task) {
              global.ai.builder.task(creep);
            } else {
              // Fallback to harvester AI if builder AI is not available
              Logger.warn(`Builder AI not found for ${creep.name}, using harvester AI instead`);
              global.ai.harvester.task(creep);
            }
            break;
          case CreepRole.Archer:
            if (global.ai.archer && global.ai.archer.task) {
              global.ai.archer.task(creep);
            }
            break;
          case CreepRole.RemoteHarvester:
            // For now, use the harvester AI
            if (global.ai.harvester && global.ai.harvester.task) {
              global.ai.harvester.task(creep);
            }
            break;
          case CreepRole.Reserver:
            this.runReserver(creep);
            break;
          case CreepRole.Hauler:
            this.runHauler(creep);
            break;
          case CreepRole.Scout:
            this.runScout(creep);
            break;
          case CreepRole.Claimer:
            if (global.ai.claimer && global.ai.claimer.task) {
              global.ai.claimer.task(creep);
            } else {
              // If claimer AI not available, use reserver as fallback
              Logger.warn(`Claimer AI not found for ${creep.name}, using reserver behavior instead`);
              this.runReserver(creep);
            }
            break;
          default:
            // Run as harvester by default
            if (global.ai.harvester && global.ai.harvester.task) {
              global.ai.harvester.task(creep);
            }
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
          creep.moveTo(exit);
        }
      }
      return;
    }
    
    // If we're in the target room, reserve the controller
    if (creep.room.controller) {
      if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.controller);
      }
    }
  }

  /**
   * Run a hauler creep
   */
  private static runHauler(creep: Creep): void {
    const targetRoom = creep.memory.targetRoom;
    const homeRoom = creep.memory.homeRoom;
    
    // Toggle working state
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
      creep.say('🔄 deliver');
    }
    if (creep.memory.working && creep.store.getUsedCapacity() === 0) {
      creep.memory.working = false;
      creep.say('🔄 collect');
    }
    
    if (creep.memory.working) {
      // If we're full, deliver energy to the home room
      if (creep.room.name !== homeRoom) {
        // Move to home room
        const exitDir = Game.map.findExit(creep.room, homeRoom);
        if (exitDir !== ERR_NO_PATH) {
          const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
          if (exit) {
            creep.moveTo(exit);
          }
        }
      } else {
        // Deliver energy to storage or spawn
        let target: Structure | null = null;
        
        // First check for storage
        if (creep.room.storage) {
          target = creep.room.storage;
        } else {
          // Otherwise find spawns and extensions that need energy
          const structures = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) => {
              return (s.structureType === STRUCTURE_SPAWN ||
                     s.structureType === STRUCTURE_EXTENSION) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
          });
          
          if (structures.length > 0) {
            target = structures[0];
          }
        }
        
        if (target) {
          if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
          }
        }
      }
    } else {
      // If we're empty, go to target room and collect energy
      if (creep.room.name !== targetRoom) {
        // Move to target room
        const exitDir = Game.map.findExit(creep.room, targetRoom);
        if (exitDir !== ERR_NO_PATH) {
          const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
          if (exit) {
            creep.moveTo(exit);
          }
        }
      } else {
        // Find containers or dropped resources
        const containers = creep.room.find(FIND_STRUCTURES, {
          filter: (s) => {
            return s.structureType === STRUCTURE_CONTAINER &&
                  s.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
          }
        });
        
        if (containers.length > 0) {
          if (creep.withdraw(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(containers[0]);
          }
        } else {
          // Look for dropped resources
          const droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: (r) => r.resourceType === RESOURCE_ENERGY
          });
          
          if (droppedResources.length > 0) {
            if (creep.pickup(droppedResources[0]) === ERR_NOT_IN_RANGE) {
              creep.moveTo(droppedResources[0]);
            }
          }
        }
      }
    }
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
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.3 }
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

      // If room is an expansion target, evaluate it
      if (Memory.colony.expansionTargets.includes(creep.room.name)) {
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
              creep.moveTo(exit);
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
          [CreepRole.Claimer]: 0
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
   * Generate optimal body parts based on available energy
   */
  public static getOptimalBody(role: CreepRole, energy: number): BodyPartConstant[] {
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

      case CreepRole.RemoteHarvester:
        // Remote harvesters need more WORK parts and movement
        if (energy >= 400) {
          body = [WORK, WORK, WORK, CARRY, MOVE, MOVE];
        } else if (energy >= 300) {
          body = [WORK, WORK, CARRY, MOVE, MOVE];
        } else {
          body = [WORK, CARRY, MOVE];
        }

        remainingEnergy = energy - Helpers.getBodyCost(body);

        // Add more WORK and MOVE parts
        while (remainingEnergy >= 150 && body.length < 50) {
          if (remainingEnergy >= 100) {
            body.push(WORK);
            remainingEnergy -= 100;
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