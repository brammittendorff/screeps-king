/**
 * Repairer Strategy
 * Implements the specific logic for the repairer role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import { TaskManager } from '../../management/task-manager';
import { RoomTaskManager } from '../../management/room-task-manager';
import * as _ from 'lodash';

export class RepairerStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Early game (RCL 1-2): Simple repairers
    if (rcl <= 2) {
      if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // Medium game (RCL 3-4): More balanced repairers
    if (rcl <= 4) {
      if (energy >= 700) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
      if (energy >= 500) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, WORK, CARRY, MOVE];
    }
    
    // Late game (RCL 5+): Specialized repairers
    if (rcl >= 5) {
      if (energy >= 1000) return [WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
      if (energy >= 800) return [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
      return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    }
    
    // Fallback
    return [WORK, CARRY, MOVE];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'repairer',
      state: CreepState.Harvesting,
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Handle harvesting state - collect energy
   */
  public runStateHarvesting(creep: Creep): void {
    // Use the common harvesting behavior
    BaseCreepAI.harvestEnergy(creep);
  }
  
  /**
   * Handle working state - repair structures, fallback to build/upgrade
   */
  public runStateWorking(creep: Creep): void {
    // If we're in the wrong room, go to the home room
    if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
      BaseCreepAI.moveToRoom(creep, creep.memory.homeRoom);
      return;
    }
    
    // Priority 1: Use TaskManager for special/remote tasks
    const task = TaskManager.findTaskForCreep(creep);
    if (task) {
      TaskManager.executeTask(creep, task);
      return;
    }
    
    // Priority 2: Room repair tasks from RoomTaskManager
    const roomTasks = RoomTaskManager.getTasks(creep.room);
    const repairTargets = roomTasks.repair
      .map(id => Game.getObjectById(id))
      .filter((s): s is Structure => !!s);
      
    if (repairTargets.length > 0) {
      const target = creep.pos.findClosestByPath(repairTargets);
      if (target) {
        if (CreepActionGuard.allow(creep, 'repair')) {
          const result = creep.repair(target);
          if (result === ERR_NOT_IN_RANGE) {
            // Use movement optimizer for repair targets
            MovementOptimizer.moveToTarget(creep, target, { 
              visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 } 
            });
          }
        }
        return;
      }
    }
    
    // Priority 3: Find structures under 75% health to repair
    const damagedStructures = creep.room.find(FIND_STRUCTURES, {
      filter: (s) => s.hits < s.hitsMax * 0.75 && 
                    s.hits < 250000 && // Cap to prevent excessive repair
                    s.structureType !== STRUCTURE_WALL
    });
    
    if (damagedStructures.length > 0) {
      // Sort by damage percentage
      const sorted = _.sortBy(damagedStructures, s => s.hits / s.hitsMax);
      
      if (CreepActionGuard.allow(creep, 'repair')) {
        const result = creep.repair(sorted[0]);
        if (result === ERR_NOT_IN_RANGE) {
          // Use movement optimizer for repair targets
          MovementOptimizer.moveToTarget(creep, sorted[0], { 
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 } 
          });
        }
        return;
      }
    }
    
    // Priority 4: Maintain walls and ramparts to minimum levels
    const defensiveStructures = creep.room.find(FIND_STRUCTURES, {
      filter: (s) => (s.structureType === STRUCTURE_WALL || 
                     s.structureType === STRUCTURE_RAMPART) && 
                     s.hits < 10000 // Basic minimum level
    });
    
    if (defensiveStructures.length > 0) {
      // Sort by lowest hits first
      const sorted = _.sortBy(defensiveStructures, s => s.hits);
      
      if (CreepActionGuard.allow(creep, 'repair')) {
        const result = creep.repair(sorted[0]);
        if (result === ERR_NOT_IN_RANGE) {
          // Use movement optimizer for repair targets
          MovementOptimizer.moveToTarget(creep, sorted[0], { 
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 } 
          });
        }
        return;
      }
    }
    
    // Fallback 1: Help with building if nothing to repair
    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (sites.length > 0) {
      if (CreepActionGuard.allow(creep, 'build')) {
        const target = creep.pos.findClosestByPath(sites);
        if (target) {
          const result = creep.build(target);
          if (result === ERR_NOT_IN_RANGE) {
            // Use movement optimizer for construction sites
            MovementOptimizer.moveToTarget(creep, target, { 
              visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 } 
            });
          }
        }
      }
      return;
    }
    
    // Fallback 2: Help with upgrading if nothing to repair or build
    if (creep.room.controller) {
      if (CreepActionGuard.allow(creep, 'upgradeController')) {
        const result = creep.upgradeController(creep.room.controller);
        if (result === ERR_NOT_IN_RANGE) {
          // Use movement optimizer for controller
          MovementOptimizer.moveToTarget(creep, creep.room.controller, { 
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 },
            range: 3 // Stay a bit back from the controller
          });
        }
      }
      return;
    }
    
    // Nothing to do - go idle
    creep.memory.state = CreepState.Idle;
    creep.say('😴 Idle');
  }
  
  /**
   * Handle idle state - find something useful to do or park
   */
  public runStateIdle(creep: Creep): void {
    // Check every 10 ticks for new repair targets
    if (Game.time % 10 === 0) {
      const roomTasks = RoomTaskManager.getTasks(creep.room);
      if (roomTasks.repair.length > 0) {
        creep.memory.state = CreepState.Working;
        creep.say('🔧 Repair');
        return;
      }
      
      // Check for any damaged structures
      const damagedStructures = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < s.hitsMax * 0.5
      });
      
      if (damagedStructures.length > 0) {
        creep.memory.state = CreepState.Working;
        creep.say('🔧 Repair');
        return;
      }
    }
    
    // Park at room center or near storage
    const target = creep.room.storage || new RoomPosition(25, 25, creep.room.name);
    MovementOptimizer.moveToTarget(creep, target, { 
      range: 3, 
      visualizePathStyle: { opacity: 0.1 } 
    });
  }
}