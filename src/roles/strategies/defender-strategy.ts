/**
 * Defender Strategy
 * Implements the specific logic for the defender role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import { RoomCache } from '../../utils/room-cache';
import * as _ from 'lodash';

export class DefenderStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Early game (RCL 1-3): Basic defender
    if (rcl <= 3) {
      if (energy >= 390) return [ATTACK, ATTACK, MOVE, MOVE, TOUGH, TOUGH];
      return [ATTACK, MOVE, TOUGH];
    }
    
    // Mid game (RCL 4-5): Stronger defender with healing
    if (rcl <= 5) {
      if (energy >= 710) return [ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, HEAL, MOVE, TOUGH, TOUGH];
      if (energy >= 520) return [ATTACK, ATTACK, MOVE, MOVE, MOVE, HEAL, TOUGH];
      return [ATTACK, ATTACK, MOVE, MOVE, TOUGH];
    }
    
    // Late game (RCL 6+): Powerful defender with ranged attack and healing
    if (rcl >= 6) {
      if (energy >= 1300) return [ATTACK, ATTACK, ATTACK, RANGED_ATTACK, RANGED_ATTACK, 
                                  MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, 
                                  HEAL, HEAL, TOUGH, TOUGH, TOUGH, TOUGH];
      if (energy >= 910) return [ATTACK, ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, TOUGH, TOUGH];
      return [ATTACK, ATTACK, MOVE, MOVE, MOVE, HEAL, TOUGH];
    }
    
    // Fallback
    return [ATTACK, MOVE, TOUGH];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'defender',
      state: CreepState.Working, // Defenders are always in working state
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Handle harvesting state - defenders don't harvest, switch to working
   */
  public runStateHarvesting(creep: Creep): void {
    // Defenders don't harvest, always in working state
    creep.memory.state = CreepState.Working;
    creep.say('🛡️ Defend');
  }
  
  /**
   * Handle working state - defend, heal, and patrol
   */
  public runStateWorking(creep: Creep): void {
    // Batch actions: only run every 3 ticks, staggered by creep name
    if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) return;
    
    // Priority 1: Check if this is our home room, if not, return there
    if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
      BaseCreepAI.moveToRoom(creep, creep.memory.homeRoom);
      return;
    }
    
    // Priority 2: Attack nearest hostile
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
      // Target selection: prioritize creeps with ATTACK/RANGED_ATTACK parts
      const dangerous = hostiles.filter(h => 
        h.getActiveBodyparts(ATTACK) > 0 || 
        h.getActiveBodyparts(RANGED_ATTACK) > 0 || 
        h.getActiveBodyparts(HEAL) > 0
      );
      
      const target = creep.pos.findClosestByPath(dangerous.length > 0 ? dangerous : hostiles);
      if (target) {
        // Check if we have ranged attack parts and if we're not in melee range
        const hasRangedAttack = creep.getActiveBodyparts(RANGED_ATTACK) > 0;
        
        if (hasRangedAttack && creep.pos.getRangeTo(target) > 1) {
          if (CreepActionGuard.allow(creep, 'rangedAttack')) {
            const result = creep.rangedAttack(target);
            if (result === ERR_NOT_IN_RANGE) {
              MovementOptimizer.moveToTarget(creep, target, {
                visualizePathStyle: { stroke: '#ff0000', opacity: 0.3 }
              });
            }
            creep.say('🏹 Attack');
          }
        } else {
          if (CreepActionGuard.allow(creep, 'attack')) {
            const result = creep.attack(target);
            if (result === ERR_NOT_IN_RANGE) {
              MovementOptimizer.moveToTarget(creep, target, {
                visualizePathStyle: { stroke: '#ff0000', opacity: 0.3 }
              });
            }
            creep.say('⚔️ Attack');
          }
        }
        return;
      }
    }
    
    // Priority 3: Heal nearest wounded ally
    const wounded = creep.room.find(FIND_MY_CREEPS).filter(c => c.hits < c.hitsMax);
    if (wounded.length > 0) {
      // Target selection: prioritize creeps with the least hitpoints
      wounded.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
      
      if (CreepActionGuard.allow(creep, 'heal')) {
        const result = creep.heal(wounded[0]);
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, wounded[0], {
            visualizePathStyle: { stroke: '#00ff00', opacity: 0.3 }
          });
          
          // If we have ranged heal, use it while moving
          if (creep.getActiveBodyparts(HEAL) > 0 && creep.pos.getRangeTo(wounded[0]) <= 3) {
            if (CreepActionGuard.allow(creep, 'rangedHeal')) {
              creep.rangedHeal(wounded[0]);
            }
          }
        }
        creep.say('💉 Heal');
        return;
      }
    }
    
    // Priority 4: Heal self if damaged
    if (creep.hits < creep.hitsMax && creep.getActiveBodyparts(HEAL) > 0) {
      if (CreepActionGuard.allow(creep, 'heal')) {
        creep.heal(creep);
        creep.say('🩹 Self');
        return;
      }
    }
    
    // Priority 5: Patrol near important structures
    this.patrolRoom(creep);
  }
  
  /**
   * Patrol the room to protect key structures
   */
  private patrolRoom(creep: Creep): void {
    // If we don't have a patrol target, find a new one
    if (!creep.memory.patrolTarget) {
      this.findPatrolTarget(creep);
    }
    
    // Move to patrol target
    if (creep.memory.patrolTarget) {
      const targetPos = new RoomPosition(
        creep.memory.patrolTarget.x, 
        creep.memory.patrolTarget.y, 
        creep.memory.patrolTarget.roomName
      );
      
      // If we're at the target, get a new one
      if (creep.pos.isEqualTo(targetPos) || creep.pos.getRangeTo(targetPos) <= 1) {
        delete creep.memory.patrolTarget;
        this.findPatrolTarget(creep);
        return;
      }
      
      // Move to target
      MovementOptimizer.moveToTarget(creep, targetPos, {
        visualizePathStyle: { stroke: '#ffffff', opacity: 0.1 },
        range: 0 // Exact position
      });
      
      // Visualize patrol
      creep.room.visual.circle(targetPos, {
        fill: 'transparent',
        radius: 0.5,
        stroke: '#0000ff',
        strokeWidth: 0.1,
        opacity: 0.3
      });
    } else {
      // Fallback: patrol near spawn or controller
      const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
      if (spawn) {
        MovementOptimizer.moveToTarget(creep, spawn, { range: 3 });
      } else if (creep.room.controller) {
        MovementOptimizer.moveToTarget(creep, creep.room.controller, { range: 3 });
      }
    }
  }
  
  /**
   * Find a new patrol target
   */
  private findPatrolTarget(creep: Creep): void {
    const room = creep.room;
    
    // Strategy: patrol key structures or room exits
    const targetType = Math.random() < 0.7 ? 'structure' : 'exit';
    
    if (targetType === 'structure') {
      // Find important structures to patrol
      const structures = [
        ...room.find(FIND_MY_SPAWNS),
        room.controller,
        room.storage,
        room.terminal
      ].filter(s => s !== undefined);
      
      if (structures.length > 0) {
        // Get a random structure
        const structure = structures[Math.floor(Math.random() * structures.length)];
        
        // Get a position near the structure
        const pos = structure!.pos;
        
        // Random offset (within 3 tiles)
        const xOffset = _.random(-3, 3);
        const yOffset = _.random(-3, 3);
        
        // Make sure position is within room bounds and walkable
        const x = Math.max(2, Math.min(47, pos.x + xOffset));
        const y = Math.max(2, Math.min(47, pos.y + yOffset));
        
        // Check if position is walkable
        const terrain = room.getTerrain();
        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          creep.memory.patrolTarget = {
            x,
            y,
            roomName: room.name
          };
        }
      }
    } else {
      // Patrol near room exits
      const x = Math.random() < 0.5 ? _.random(2, 5) : _.random(44, 47);
      const y = Math.random() < 0.5 ? _.random(2, 5) : _.random(44, 47);
      
      // Check if position is walkable
      const terrain = room.getTerrain();
      if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
        creep.memory.patrolTarget = {
          x,
          y,
          roomName: room.name
        };
      }
    }
    
    // If we still don't have a patrol target, use center of room
    if (!creep.memory.patrolTarget) {
      creep.memory.patrolTarget = {
        x: 25,
        y: 25,
        roomName: room.name
      };
    }
  }
}