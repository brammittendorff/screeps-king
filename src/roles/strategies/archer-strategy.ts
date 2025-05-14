/**
 * Archer Strategy
 * Implements the specific logic for the archer role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import * as _ from 'lodash';

export class ArcherStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Early game (RCL 1-3): Basic archer
    if (rcl <= 3) {
      if (energy >= 400) return [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE];
      return [RANGED_ATTACK, MOVE];
    }
    
    // Mid game (RCL 4-5): Stronger archer with healing
    if (rcl <= 5) {
      if (energy >= 800) return [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE, MOVE, HEAL, TOUGH];
      if (energy >= 550) return [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE, HEAL];
      return [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE];
    }
    
    // Late game (RCL 6+): Powerful archer with boosted movement and healing
    if (rcl >= 6) {
      if (energy >= 1300) {
        return [
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          HEAL, HEAL,
          TOUGH, TOUGH
        ];
      }
      if (energy >= 900) {
        return [
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          MOVE, MOVE, MOVE, MOVE,
          HEAL,
          TOUGH
        ];
      }
      return [RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE, HEAL];
    }
    
    // Fallback
    return [RANGED_ATTACK, MOVE];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'archer',
      state: CreepState.Working, // Archers are always in working state
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Handle harvesting state - archers don't harvest
   */
  public runStateHarvesting(creep: Creep): void {
    // Archers don't harvest, change to working state
    creep.memory.state = CreepState.Working;
    creep.say('🏹 Attack');
  }
  
  /**
   * Handle working state - attack, heal, and patrol
   */
  public runStateWorking(creep: Creep): void {
    // Priority 1: Check if this is our home room, if not, return there
    if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
      BaseCreepAI.moveToRoom(creep, creep.memory.homeRoom);
      return;
    }
    
    // Priority 2: Attack nearest hostile with ranged attack
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
      const hostile = creep.pos.findClosestByPath(hostiles);
      if (hostile) {
        if (CreepActionGuard.allow(creep, 'rangedAttack')) {
          // If in range, use ranged attack
          if (creep.pos.getRangeTo(hostile) <= 3) {
            creep.rangedAttack(hostile);
            
            // Pick the right range attack mode based on distance
            const range = creep.pos.getRangeTo(hostile);
            if (range === 1) {
              creep.rangedMassAttack(); // More efficient at point-blank range
            } else {
              creep.rangedAttack(hostile);
            }
            
            creep.say('🏹 Fire!');
          }
        }
        
        // Movement strategy: kite at range 3 (ideal range for ranged attackers)
        if (creep.pos.getRangeTo(hostile) > 3) {
          // Too far, move closer
          MovementOptimizer.moveToTarget(creep, hostile, {
            range: 3,
            visualizePathStyle: { stroke: '#00bfff', opacity: 0.3 }
          });
          creep.say('🏹 Approach');
        } else if (creep.pos.getRangeTo(hostile) < 2) {
          // Too close, back up (kite)
          const direction = creep.pos.getDirectionTo(hostile);
          // Move in the opposite direction (add 3, wrap around 1-8)
          const oppositeDirection = ((direction + 3) % 8) + 1 as DirectionConstant;
          creep.move(oppositeDirection);
          creep.say('🏹 Kite');
        }
        
        return;
      }
    }
    
    // Priority 3: Heal nearest wounded ally (if has HEAL parts)
    if (creep.getActiveBodyparts(HEAL) > 0) {
      const wounded = creep.room.find(FIND_MY_CREEPS, {
        filter: c => c.hits < c.hitsMax
      });
      
      if (wounded.length > 0) {
        // Sort by damage percentage (lowest health % first)
        wounded.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
        
        const target = wounded[0];
        
        if (CreepActionGuard.allow(creep, 'heal')) {
          if (creep.pos.getRangeTo(target) <= 1) {
            creep.heal(target);
            creep.say('💉 Heal');
          } else if (creep.pos.getRangeTo(target) <= 3) {
            creep.rangedHeal(target);
            creep.say('💉 RHeal');
            
            // Move toward target for more efficient healing
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#00ff00', opacity: 0.3 }
            });
          } else {
            // Move toward target for healing
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#00ff00', opacity: 0.3 }
            });
            creep.say('🩹 ToWound');
          }
        }
        return;
      }
    }
    
    // Priority 4: Self-heal if damaged
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
        visualizePathStyle: { stroke: '#00bfff', opacity: 0.1 },
        range: 0 // Exact position
      });
      
      // Visualize patrol
      creep.room.visual.circle(targetPos, {
        fill: 'transparent',
        radius: 0.5,
        stroke: '#00bfff',
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
    
    // Strategy: patrol room entrances or key structures
    const targetType = Math.random() < 0.7 ? 'entrance' : 'structure';
    
    if (targetType === 'entrance') {
      // Find and patrol near room entrances
      const roomSize = 50;
      const entrancePoints = [];
      
      // Check all possible entrances (edges of the room)
      for (let i = 1; i < roomSize - 1; i++) {
        // Top edge
        entrancePoints.push(new RoomPosition(i, 0, room.name));
        // Right edge
        entrancePoints.push(new RoomPosition(roomSize - 1, i, room.name));
        // Bottom edge
        entrancePoints.push(new RoomPosition(i, roomSize - 1, room.name));
        // Left edge
        entrancePoints.push(new RoomPosition(0, i, room.name));
      }
      
      // Filter to only keep valid entrances (walkable terrain)
      const terrain = room.getTerrain();
      const validEntrances = entrancePoints.filter(pos => {
        const x = pos.x === 0 ? 1 : (pos.x === 49 ? 48 : pos.x);
        const y = pos.y === 0 ? 1 : (pos.y === 49 ? 48 : pos.y);
        return terrain.get(x, y) !== TERRAIN_MASK_WALL;
      });
      
      if (validEntrances.length > 0) {
        // Choose a random entrance to patrol
        const targetPos = validEntrances[Math.floor(Math.random() * validEntrances.length)];
        
        // Set patrol target just inside the room from the entrance
        const x = targetPos.x === 0 ? 2 : (targetPos.x === 49 ? 47 : targetPos.x);
        const y = targetPos.y === 0 ? 2 : (targetPos.y === 49 ? 47 : targetPos.y);
        
        creep.memory.patrolTarget = {
          x,
          y,
          roomName: room.name
        };
        return;
      }
    } else {
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