/**
 * Builder Strategy
 * Implements the specific logic for the builder role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';

export class BuilderStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Early game (RCL 1-2): Simple builders
    if (rcl <= 2) {
      if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // More advanced builders with balanced WORK/CARRY/MOVE
    let body: BodyPartConstant[] = [];
    let partCost = 0;
    
    // Maximum parts scales with RCL
    const maxParts = Math.min(50, rcl * 5);
    
    // Add parts in balanced ratio (WORK:CARRY:MOVE)
    while (energy - partCost >= 200 && body.length < maxParts) {
      body.push(WORK);
      body.push(CARRY);
      body.push(MOVE);
      partCost += 200;
    }
    
    return body.length > 0 ? body : [WORK, CARRY, MOVE];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'builder',
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
   * Handle working state - build, repair, or upgrade
   */
  public runStateWorking(creep: Creep): void {
    // If we're in the wrong room, go to the home room
    if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
      BaseCreepAI.moveToRoom(creep, creep.memory.homeRoom);
      return;
    }
    
    // Priority 1: Build construction sites
    const targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (targets.length > 0) {
      if (CreepActionGuard.allow(creep, 'build')) {
        const target = creep.pos.findClosestByPath(targets);
        if (target) {
          const result = creep.build(target);
          if (result === ERR_NOT_IN_RANGE) {
            // Use movement optimizer for construction
            MovementOptimizer.moveToTarget(creep, target, { 
              visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 } 
            });
          }
        }
      }
      return;
    }
    
    // Priority 2: Repair damaged structures
    const damagedStructures = creep.room.find(FIND_STRUCTURES, {
      filter: (s) => s.hits < s.hitsMax * 0.75 && 
                     s.hits < 10000 && // Only repair up to 10k hits
                     s.structureType !== STRUCTURE_WALL && 
                     s.structureType !== STRUCTURE_RAMPART
    });
    
    if (damagedStructures.length > 0) {
      // Sort by damage percentage
      damagedStructures.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
      
      if (CreepActionGuard.allow(creep, 'repair')) {
        const result = creep.repair(damagedStructures[0]);
        if (result === ERR_NOT_IN_RANGE) {
          // Use movement optimizer for repairs
          MovementOptimizer.moveToTarget(creep, damagedStructures[0], {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // Priority 3: Upgrade controller when nothing to build/repair
    if (creep.room.controller) {
      if (CreepActionGuard.allow(creep, 'upgradeController')) {
        const result = creep.upgradeController(creep.room.controller);
        if (result === ERR_NOT_IN_RANGE) {
          // Use movement optimizer for controller
          MovementOptimizer.moveToTarget(creep, creep.room.controller, {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // Fallback: If nothing to do, become idle
    creep.memory.state = CreepState.Idle;
    creep.say('😴 Idle');
  }
  
  /**
   * Handle idle state - find something useful to do or park
   */
  public runStateIdle(creep: Creep): void {
    // Use default idle behavior from base class
    // But check every 5 ticks if there are new construction sites
    if (Game.time % 5 === 0) {
      const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
      if (sites.length > 0) {
        creep.memory.state = CreepState.Working;
        creep.say('🔨 Build');
        return;
      }
    }
    
    // Otherwise park at room center or near storage
    const target = creep.room.storage || new RoomPosition(25, 25, creep.room.name);
    MovementOptimizer.moveToTarget(creep, target, { range: 3, visualizePathStyle: { opacity: 0.1 } });
  }
}