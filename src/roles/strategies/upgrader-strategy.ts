/**
 * Upgrader Strategy
 * Implements the specific logic for the upgrader role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import { Logger } from '../../utils/logger';
import * as _ from 'lodash';

export class UpgraderStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Early game (RCL 1-2): Simple upgraders
    if (rcl <= 2) {
      if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // Medium game (RCL 3-4): More WORK parts
    if (rcl <= 4) {
      if (energy >= 800) return [WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
      if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, WORK, CARRY, MOVE];
    }
    
    // Late game (RCL 5+): Optimized for controller upgrading
    if (rcl >= 5) {
      // RCL 8 upgraders need less parts since it's capped
      if (rcl === 8) {
        if (energy >= 1600) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
        if (energy >= 800) return [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
        return [WORK, WORK, WORK, CARRY, MOVE]; 
      }
      
      // For RCL 5-7, build larger upgraders
      if (energy >= 2000) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
      if (energy >= 1500) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
      if (energy >= 800) return [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, WORK, WORK, CARRY, MOVE];
    }
    
    // Fallback
    return [WORK, CARRY, MOVE];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'upgrader',
      state: CreepState.Harvesting,
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Handle harvesting state - collect energy
   */
  public runStateHarvesting(creep: Creep): void {
    // If parked, we've lost energy - clear the parked flag to find more
    if (creep.memory.parked) {
      creep.memory.parked = false;
    }
    
    const mapping = creep.room.memory.mapping;
    const controller = creep.room.controller;
    const rcl = creep.room.controller ? creep.room.controller.level : 0;
    
    // For RCL 5+: Use link network if available
    if (rcl >= 5) {
      // Try to find controller link
      const controllerLinks = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_LINK && 
                      s.pos.getRangeTo(creep.room.controller) <= 3 &&
                      'store' in s && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      }) as StructureLink[];
      
      if (controllerLinks.length > 0) {
        const controllerLink = controllerLinks[0];
        if (CreepActionGuard.allow(creep, 'withdraw')) {
          if (creep.withdraw(controllerLink, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            // Use movement optimizer for controller link
            MovementOptimizer.moveToTarget(creep, controllerLink, { 
              visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
            });
          }
        }
        return;
      }
    }
    
    // For RCL 4+: Prefer storage if available
    if (rcl >= 4 && creep.room.storage && 'store' in creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
      if (CreepActionGuard.allow(creep, 'withdraw')) {
        if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          // Use movement optimizer for storage
          MovementOptimizer.moveToTarget(creep, creep.room.storage, { 
            visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // For RCL 3+: Look for containers, especially ones near controller
    if (rcl >= 3) {
      // Try to find controller container first
      const controllerContainers = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER && 
                      s.pos.getRangeTo(creep.room.controller) <= 3 &&
                      'store' in s && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      }) as StructureContainer[];
      
      if (controllerContainers.length > 0) {
        const controllerContainer = controllerContainers[0];
        if (CreepActionGuard.allow(creep, 'withdraw')) {
          if (creep.withdraw(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            // Use movement optimizer for controller container
            MovementOptimizer.moveToTarget(creep, controllerContainer, { 
              visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
            });
          }
        }
        return;
      }
    }
    
    // Fall back to regular logic for other RCL levels or if specialized structures aren't found
    // Prefer containers/storage closest to the controller using mapping
    if (mapping && mapping.controller && (mapping.sources || mapping.storage)) {
      let containers: (StructureContainer | StructureStorage)[] = [];
      // Find containers at all mapped sources
      if (mapping.sources) {
        for (const source of mapping.sources) {
          const found = creep.room.lookForAt(LOOK_STRUCTURES, source.x, source.y)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && (s as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 0);
          containers = containers.concat(found as (StructureContainer | StructureStorage)[]);
        }
      }
      // Add storage if present
      if (mapping.storage) {
        const storageObj = Game.getObjectById(mapping.storage.id as Id<StructureStorage>);
        if (storageObj && storageObj.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
          containers.push(storageObj as StructureStorage);
        }
      }
      // Sort by distance to controller
      if (controller && containers.length > 0) {
        containers = containers.slice().sort((a, b) =>
          controller.pos.getRangeTo(a.pos) - controller.pos.getRangeTo(b.pos)
        );
        const bestContainer = containers[0];
        if (CreepActionGuard.allow(creep, 'withdraw')) {
          if (creep.withdraw(bestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            // Use movement optimizer for container
            MovementOptimizer.moveToTarget(creep, bestContainer, { 
              visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 } 
            });
          }
        }
        return;
      }
    }
    
    // For RCL 1-2: Focus on mining directly from source closest to controller
    if (controller) {
      const sources = creep.room.find(FIND_SOURCES_ACTIVE);
      if (sources.length > 0) {
        // Sort by distance to controller
        const sortedSources = sources.slice().sort((a, b) =>
          controller.pos.getRangeTo(a.pos) - controller.pos.getRangeTo(b.pos)
        );
        
        const bestSource = sortedSources[0];
        // Only one pipeline action per tick (Screeps rule)
        if (CreepActionGuard.allow(creep, 'harvest')) {
          if (creep.harvest(bestSource) === ERR_NOT_IN_RANGE) {
            // Use movement optimizer for source
            MovementOptimizer.moveToTarget(creep, bestSource, { 
              visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 } 
            });
          }
        }
        return;
      }
    }
    
    // Fallback: closest-by-path to creep (old logic)
    const fallbackSource = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (fallbackSource) {
      // Only one pipeline action per tick (Screeps rule)
      if (CreepActionGuard.allow(creep, 'harvest')) {
        if (creep.harvest(fallbackSource) === ERR_NOT_IN_RANGE) {
          // Use movement optimizer for fallback source
          MovementOptimizer.moveToTarget(creep, fallbackSource, { 
            visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 } 
          });
        }
      }
    } else {
      // No source found
      creep.say('❓ no src');
    }
  }
  
  /**
   * Handle working state - upgrade controller
   */
  public runStateWorking(creep: Creep): void {
    // Working state - upgrade controller
    if (!creep.room.controller || !creep.room.controller.my) {
      // No controller to upgrade in this room
      creep.say('❓ no ctrl');
      return;
    }
    
    // Get the room's RCL level for optimized behavior
    const rcl = creep.room.controller ? creep.room.controller.level : 0;
    
    // Only one pipeline action per tick (Screeps rule)
    if (CreepActionGuard.allow(creep, 'upgradeController')) {
      const result = creep.upgradeController(creep.room.controller);
      if (result === ERR_NOT_IN_RANGE) {
        // For RCL 8, we want to be right next to the controller
        // For RCL 5-7, closer if there's a link nearby
        let range = 3; // Default range
        
        // RCL 8 always stays close
        if (rcl === 8) {
          range = 1;
        } 
        // Otherwise check for links
        else {
          // If we have a link near controller, stay closer
          const nearbyLinks = creep.room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
            filter: s => s.structureType === STRUCTURE_LINK
          });
          if (nearbyLinks.length > 0) {
            range = 1;
          }
          
          // If upgrading is prioritized, stay closer
          if (creep.memory.prioritizeUpgrade) {
            range = Math.min(range, 2);
          }
        }
        
        // Use movement optimizer with room-specific pathing
        MovementOptimizer.moveToTarget(creep, creep.room.controller, { 
          visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 },
          range // Use calculated optimal range
        });
      } else if (result === OK) {
        // When at RCL 8 or with nearby link, once we're next to the controller, 
        // we want to park there. This saves CPU by not recalculating paths on each tick
        const shouldPark = rcl === 8 || creep.memory.prioritizeUpgrade;
        
        if (shouldPark && creep.pos.getRangeTo(creep.room.controller) <= 1) {
          creep.memory.parked = true;
          
          // Visual indication of dedicated upgraders
          if (creep.memory.prioritizeUpgrade) {
            creep.say('⚡ RCL');
          }
        }
      }
    }
  }
}