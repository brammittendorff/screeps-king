/**
 * Scout Strategy
 * Implements the specific logic for the scout role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import { RoomCache } from '../../utils/room-cache';
import { Logger } from '../../utils/logger';
import * as _ from 'lodash';

export class ScoutStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Scouts just need MOVE parts
    if (energy >= 250) return [MOVE, MOVE, MOVE, MOVE, MOVE];
    if (energy >= 150) return [MOVE, MOVE, MOVE];
    return [MOVE];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'scout',
      state: CreepState.Working, // Scouts are always in working state
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Handle harvesting state - scouts don't harvest
   */
  public runStateHarvesting(creep: Creep): void {
    // Scouts don't harvest, change to working state
    creep.memory.state = CreepState.Working;
    creep.say('🔭 Scout');
  }
  
  /**
   * Handle working state - scout new rooms
   */
  public runStateWorking(creep: Creep): void {
    // 1. If we have a targetRoom and not there, move there
    if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
      this.travelToTargetRoom(creep);
      return;
    }
    
    // 2. If in target room, visit points of interest
    if (creep.memory.targetRoom && creep.room.name === creep.memory.targetRoom) {
      this.exploreRoom(creep);
      return;
    }
    
    // 3. If no targetRoom, pick an unexplored adjacent room or expansion target
    this.findNewTargetRoom(creep);
  }
  
  /**
   * Travel to the target room
   */
  private travelToTargetRoom(creep: Creep): void {
    // Use the BaseCreep moveToRoom method
    if (creep.memory.targetRoom) {
      const success = BaseCreepAI.moveToRoom(creep, creep.memory.targetRoom);
      if (success) {
        creep.say('🔍 Arrived');
      } else {
        creep.say(`🛣️ ${creep.memory.targetRoom.substring(0, 4)}`);
      }
    }
  }
  
  /**
   * Explore the current room, visiting points of interest
   */
  private exploreRoom(creep: Creep): void {
    const pointsOfInterest: RoomPosition[] = [];
    
    // Add controller if available
    if (creep.room.controller) {
      pointsOfInterest.push(creep.room.controller.pos);
      
      // Record controller level and owner
      if (!Memory.roomData) Memory.roomData = {};
      if (!Memory.roomData[creep.room.name]) {
        Memory.roomData[creep.room.name] = { 
          ownedRoom: !!creep.room.controller.owner,
          reservedRoom: !!creep.room.controller.reservation,
          controllerLevel: creep.room.controller.level,
          lastSeen: Game.time 
        } as any;
      } else {
        Memory.roomData[creep.room.name].ownedRoom = !!creep.room.controller.owner;
        Memory.roomData[creep.room.name].reservedRoom = !!creep.room.controller.reservation;
        Memory.roomData[creep.room.name].controllerLevel = creep.room.controller.level;
        Memory.roomData[creep.room.name].lastSeen = Game.time;
      }
    }
    
    // Add sources
    const sources = creep.room.find(FIND_SOURCES);
    for (const source of sources) {
      pointsOfInterest.push(source.pos);
    }
    
    // Count sources
    if (Memory.roomData && Memory.roomData[creep.room.name]) {
      // Store just the count of sources, not the actual sources array
      Memory.roomData[creep.room.name].sourceCount = sources.length;
    }
    
    // Add minerals
    const minerals = creep.room.find(FIND_MINERALS);
    for (const mineral of minerals) {
      pointsOfInterest.push(mineral.pos);
      
      // Record mineral type
      if (Memory.roomData && Memory.roomData[creep.room.name]) {
        Memory.roomData[creep.room.name].mineralType = mineral.mineralType;
      }
    }
    
    // If no points of interest, create a grid of points to explore
    if (pointsOfInterest.length === 0) {
      pointsOfInterest.push(
        new RoomPosition(25, 25, creep.room.name),
        new RoomPosition(10, 10, creep.room.name),
        new RoomPosition(10, 40, creep.room.name),
        new RoomPosition(40, 10, creep.room.name),
        new RoomPosition(40, 40, creep.room.name)
      );
    }
    
    // Visit a different point each tick to get good coverage
    const pointIndex = Game.time % pointsOfInterest.length;
    const targetPos = pointsOfInterest[pointIndex];
    
    // Move to the current target
    MovementOptimizer.moveToTarget(creep, targetPos, {
      visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 },
      reusePath: 5
    });
    
    // Check for hostiles
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
      if (Memory.roomData && Memory.roomData[creep.room.name]) {
        Memory.roomData[creep.room.name].hostiles = hostiles.length;
        Memory.roomData[creep.room.name].hostileOwners = _.uniq(
          hostiles.map(h => h.owner.username)
        );
      }
      
      // Avoid hostiles if they're too close
      const closeHostile = creep.pos.findInRange(hostiles, 3)[0];
      if (closeHostile) {
        let fleeDirection = creep.pos.getDirectionTo(closeHostile) + 4;
        if (fleeDirection > 8) fleeDirection -= 8;
        
        creep.say('⚠️ Danger!');
        
        // Try to move in the opposite direction
        creep.move(fleeDirection as DirectionConstant);
        return;
      }
    }
    
    // Mark as scouted in parent room's adjacentRooms if applicable
    for (const myRoomName in Game.rooms) {
      const myRoom = Game.rooms[myRoomName];
      if (myRoom.memory.adjacentRooms && myRoom.memory.adjacentRooms[creep.room.name]) {
        myRoom.memory.adjacentRooms[creep.room.name].status = 'scouted';
      }
    }
    
    // If room is fully explored (visited all points of interest), look for a new target
    if (creep.memory.visitedPOI) {
      creep.memory.visitedPOI++;
      if (creep.memory.visitedPOI >= pointsOfInterest.length * 2) {
        delete creep.memory.targetRoom;
        delete creep.memory.visitedPOI;
        this.findNewTargetRoom(creep);
      }
    } else {
      creep.memory.visitedPOI = 1;
    }
  }
  
  /**
   * Find a new room to scout
   */
  private findNewTargetRoom(creep: Creep): void {
    // Try to find an unexplored adjacent room from home room
    const homeRoom = Game.rooms[creep.memory.homeRoom || creep.room.name];
    if (homeRoom && homeRoom.memory.adjacentRooms) {
      for (const adjRoom in homeRoom.memory.adjacentRooms) {
        if (homeRoom.memory.adjacentRooms[adjRoom].status === 'unexplored') {
          creep.memory.targetRoom = adjRoom;
          delete creep.memory.visitedPOI;
          creep.say(`🔭 ${adjRoom.substring(0, 4)}`);
          return;
        }
      }
    }
    
    // Try expansion targets if defined
    if (Memory.colony && Memory.colony.expansionTargets && Memory.colony.expansionTargets.length > 0) {
      for (const target of Memory.colony.expansionTargets) {
        if (!Memory.roomData[target] || (Game.time - (Memory.roomData[target].lastSeen || 0) > 10000)) {
          creep.memory.targetRoom = target;
          delete creep.memory.visitedPOI;
          creep.say(`🔭 ${target.substring(0, 4)}`);
          return;
        }
      }
    }
    
    // If no specific targets, pick a random adjacent room to current room
    const exits = Game.map.describeExits(creep.room.name);
    if (exits) {
      const exitDirections = Object.keys(exits);
      if (exitDirections.length > 0) {
        const randomDir = exitDirections[Math.floor(Math.random() * exitDirections.length)];
        const randomRoom = exits[randomDir as unknown as keyof typeof exits];
        
        // Only go to normal rooms (not highway or source keeper rooms)
        if (randomRoom && this.isNormalRoom(randomRoom)) {
          creep.memory.targetRoom = randomRoom;
          delete creep.memory.visitedPOI;
          creep.say(`🔭 ${randomRoom.substring(0, 4)}`);
          return;
        }
      }
    }
    
    // If nothing to do, idle at spawn or center
    this.idleInRoom(creep);
  }
  
  /**
   * Check if a room name corresponds to a normal room
   */
  private isNormalRoom(roomName: string): boolean {
    // Highway rooms have names where both the x and y coordinates are divisible by 10
    const coords = this.getRoomCoordinates(roomName);
    if (!coords) return false;
    
    // Check for highways (both coordinates divisible by 10)
    if (coords.x % 10 === 0 && coords.y % 10 === 0) return false;
    
    // Check for source keeper rooms (both coordinates between 4 and 6 away from multiples of 10)
    const xMod10 = coords.x % 10;
    const yMod10 = coords.y % 10;
    if ((xMod10 >= 4 && xMod10 <= 6) && (yMod10 >= 4 && yMod10 <= 6)) return false;
    
    return true;
  }
  
  /**
   * Extract coordinates from a room name
   */
  private getRoomCoordinates(roomName: string): { x: number, y: number } | null {
    const match = roomName.match(/^([WE])([0-9]+)([NS])([0-9]+)$/);
    if (!match) return null;
    
    const [, we, xStr, ns, yStr] = match;
    let x = parseInt(xStr);
    let y = parseInt(yStr);
    
    if (we === 'W') x = -x;
    if (ns === 'S') y = -y;
    
    return { x, y };
  }
  
  /**
   * Idle behavior when no scouting targets are available
   */
  private idleInRoom(creep: Creep): void {
    // Check if we have energy to deposit
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      let targets = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_SPAWN || 
                        s.structureType === STRUCTURE_EXTENSION) && 
                       'store' in s && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      });
      
      if (targets.length > 0) {
        const target = creep.pos.findClosestByPath(targets);
        if (target) {
          if (CreepActionGuard.allow(creep, 'transfer')) {
            const result = creep.transfer(target, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
              MovementOptimizer.moveToTarget(creep, target);
            }
          }
          return;
        }
      }
    }
    
    // Park near spawn or center of room
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn) {
      MovementOptimizer.moveToTarget(creep, spawn, { range: 3 });
    } else {
      const centerPos = new RoomPosition(25, 25, creep.room.name);
      MovementOptimizer.moveToTarget(creep, centerPos, { range: 3 });
    }
  }
}