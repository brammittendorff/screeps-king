/**
 * Destroyer Strategy
 * Implements the specific logic for the destroyer role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import { RoomCache } from '../../utils/room-cache';
import { Logger } from '../../utils/logger';
import * as _ from 'lodash';

export class DestroyerStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Early game (RCL 1-3): Basic destroyer
    if (rcl <= 3) {
      if (energy >= 390) return [ATTACK, ATTACK, MOVE, MOVE, TOUGH, TOUGH];
      return [ATTACK, MOVE, TOUGH];
    }
    
    // Mid game (RCL 4-5): Stronger destroyer with more attack
    if (rcl <= 5) {
      if (energy >= 650) return [ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, TOUGH, TOUGH];
      if (energy >= 390) return [ATTACK, ATTACK, MOVE, MOVE, TOUGH, TOUGH];
      return [ATTACK, MOVE, TOUGH];
    }
    
    // Late game (RCL 6+): Heavy destroyer
    if (rcl >= 6) {
      if (energy >= 1300) {
        return [
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          TOUGH, TOUGH, TOUGH, TOUGH
        ];
      }
      if (energy >= 780) {
        return [
          ATTACK, ATTACK, ATTACK, ATTACK,
          MOVE, MOVE, MOVE, MOVE,
          TOUGH, TOUGH
        ];
      }
      return [ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, TOUGH];
    }
    
    // Fallback
    return [ATTACK, MOVE, TOUGH];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'destroyer',
      state: CreepState.Working, // Destroyers are always in working state
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Handle harvesting state - destroyers don't harvest
   */
  public runStateHarvesting(creep: Creep): void {
    // Destroyers don't harvest, change to working state
    creep.memory.state = CreepState.Working;
    creep.say('⚔️ Destroy');
  }
  
  /**
   * Handle working state - attack hostile structures
   */
  public runStateWorking(creep: Creep): void {
    // Batch actions: only run every 3 ticks, staggered by creep name
    if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) return;
    
    // If creep is dying or has no attack parts, fallback to idle
    if (creep.ticksToLive && creep.ticksToLive < 10) {
      creep.say('💀');
      return;
    }
    
    if (!creep.body.some(part => part.type === ATTACK)) {
      creep.say('❌ No ATTACK');
      return;
    }
    
    // Priority 1: Check if we've been assigned a specific target room
    if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
      BaseCreepAI.moveToRoom(creep, creep.memory.targetRoom);
      return;
    }
    
    // Priority 2: Find and attack hostile spawns
    const hostileSpawns = creep.room.find(FIND_HOSTILE_SPAWNS);
    if (hostileSpawns.length > 0) {
      const target = creep.pos.findClosestByPath(hostileSpawns);
      if (target) {
        if (CreepActionGuard.allow(creep, 'attack')) {
          const result = creep.attack(target);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#ff0000', opacity: 0.3 }
            });
            creep.say('🚶➡️⚔️');
          } else if (result === OK) {
            creep.say('⚔️ Spawn');
            Logger.info(`${creep.name} attacking spawn at ${target.pos.x},${target.pos.y} in ${creep.room.name}`);
          } else {
            creep.say(`❌ ${result}`);
            Logger.warn(`${creep.name} failed to attack spawn: ${result}`);
          }
        }
        return;
      }
    }
    
    // Priority 3: Find and attack other hostile structures (except walls/ramparts)
    const hostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
      filter: (s) => s.structureType !== STRUCTURE_RAMPART && 
                     s.structureType !== 'constructedWall' as StructureConstant
    });
    
    if (hostileStructures.length > 0) {
      // Prioritize by structure type: spawn > tower > extension > others
      const prioritizedStructures = _.sortBy(hostileStructures, (s) => {
        switch (s.structureType) {
          case STRUCTURE_SPAWN: return 0;
          case STRUCTURE_TOWER: return 1;
          case STRUCTURE_EXTENSION: return 2;
          case STRUCTURE_STORAGE: return 3;
          case STRUCTURE_TERMINAL: return 4;
          default: return 5;
        }
      });
      
      const target = creep.pos.findClosestByPath(prioritizedStructures);
      if (target) {
        if (CreepActionGuard.allow(creep, 'attack')) {
          const result = creep.attack(target);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#ffaa00', opacity: 0.3 }
            });
            creep.say('🚶➡️⚔️');
          } else if (result === OK) {
            creep.say('⚔️ Struct');
            Logger.info(`${creep.name} attacking ${target.structureType} at ${target.pos.x},${target.pos.y} in ${creep.room.name}`);
          } else {
            creep.say(`❌ ${result}`);
            Logger.warn(`${creep.name} failed to attack structure: ${result}`);
          }
        }
        return;
      }
    }
    
    // Priority 4: Attack hostile walls and ramparts if no other targets
    const defensiveStructures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_RAMPART || 
                     s.structureType === 'constructedWall' as StructureConstant
    });
    
    if (defensiveStructures.length > 0) {
      // Find the weakest structure to attack
      defensiveStructures.sort((a, b) => a.hits - b.hits);
      
      const target = defensiveStructures[0];
      if (target) {
        if (CreepActionGuard.allow(creep, 'attack')) {
          const result = creep.attack(target);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#ffaa00', opacity: 0.3 }
            });
            creep.say('🚶➡️⚔️');
          } else if (result === OK) {
            creep.say('⚔️ Wall');
            Logger.info(`${creep.name} attacking ${target.structureType} at ${target.pos.x},${target.pos.y} in ${creep.room.name}`);
          } else {
            creep.say(`❌ ${result}`);
            Logger.warn(`${creep.name} failed to attack structure: ${result}`);
          }
        }
        return;
      }
    }
    
    // Priority 5: If nothing to attack, move to the center of the room or find hostiles
    creep.say('😴 Idle');
    
    // Look for hostile creeps to attack (as a fallback)
    const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    if (hostileCreeps.length > 0) {
      const target = creep.pos.findClosestByPath(hostileCreeps);
      if (target) {
        if (CreepActionGuard.allow(creep, 'attack')) {
          const result = creep.attack(target);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#ff0000', opacity: 0.3 }
            });
            creep.say('🚶➡️⚔️');
          }
        }
        return;
      }
    }
    
    // Otherwise, search for a new room to attack
    if (!creep.memory.targetRoom) {
      this.findNewTarget(creep);
    }
    
    // If still no target, idle at a central location
    if (creep.room.controller) {
      MovementOptimizer.moveToTarget(creep, creep.room.controller, { range: 3 });
    } else {
      const centerPos = new RoomPosition(25, 25, creep.room.name);
      MovementOptimizer.moveToTarget(creep, centerPos);
    }
  }
  
  /**
   * Find a new target room to attack
   */
  private findNewTarget(creep: Creep): void {
    // Check colony memory for enemy rooms
    if (Memory.roomData) {
      const enemyRooms = [];
      
      for (const roomName in Memory.roomData) {
        const data = Memory.roomData[roomName];
        
        // Find rooms that are owned by others and have been seen recently
        if (data.ownedRoom && 
            data.owner && 
            data.owner !== (Game.spawns[Object.keys(Game.spawns)[0]] ? Game.spawns[Object.keys(Game.spawns)[0]].owner.username : '') &&
            data.lastSeen && 
            Game.time - data.lastSeen < 10000) {
          
          enemyRooms.push(roomName);
        }
      }
      
      if (enemyRooms.length > 0) {
        // Pick a random enemy room to attack
        const targetRoom = enemyRooms[Math.floor(Math.random() * enemyRooms.length)];
        creep.memory.targetRoom = targetRoom;
        creep.say(`🎯 ${targetRoom.substring(0, 4)}`);
        Logger.info(`${creep.name} assigned to attack room ${targetRoom}`);
        return;
      }
    }
    
    // If no enemy rooms found, check adjacent rooms
    const exits = Game.map.describeExits(creep.room.name);
    if (exits) {
      const exitDirections = Object.keys(exits);
      if (exitDirections.length > 0) {
        const randomDir = exitDirections[Math.floor(Math.random() * exitDirections.length)];
        const randomRoom = exits[randomDir as unknown as keyof typeof exits];
        
        // Only pick normal rooms (not highways or keeper rooms)
        if (randomRoom && this.isNormalRoom(randomRoom)) {
          creep.memory.targetRoom = randomRoom;
          creep.say(`🔎 ${randomRoom.substring(0, 4)}`);
          Logger.info(`${creep.name} assigned to scout room ${randomRoom}`);
          return;
        }
      }
    }
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
}