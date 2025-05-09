/**
 * Upgrader AI
 * Handles controller upgrading
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';

export class UpgraderAI {
  /**
   * Main task method for upgrader creeps
   */
  @Profiler.wrap('UpgraderAI.task')
  public static task(creep: Creep): void {
    // Toggle working state when energy capacity changes
    if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      creep.memory.working = false;
      creep.say('🔄 harvest');
    }
    
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
      creep.say('⚡ upgrade');
    }
    
    // Working state - upgrade controller
    if (creep.memory.working) {
      // Verify controller exists and is owned
      if (creep.room.controller && creep.room.controller.my) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
          creep.moveTo(creep.room.controller, {
            visualizePathStyle: { stroke: '#ffffff' }
          });
        }
      } else {
        // No controller to upgrade in this room
        creep.say('❓ no ctrl');
      }
    } 
    // Harvesting state - collect energy
    else {
      // Try to find dropped energy first
      let target = null;
      
      // Use helper for dropped energy if available
      if (global.helpers && global.helpers.findDroppedEnergy) {
        const droppedEnergy = global.helpers.findDroppedEnergy(creep.room);
        
        if (droppedEnergy.length > 0) {
          // Find closest dropped energy
          target = creep.pos.findClosestByPath(droppedEnergy);
          
          if (target) {
            if (creep.pickup(target) === ERR_NOT_IN_RANGE) {
              creep.moveTo(target, {
                visualizePathStyle: { stroke: '#ffaa00' }
              });
            }
            return;
          }
        }
      }
      
      // Check for containers with energy
      const containers = creep.room.find(FIND_STRUCTURES, {
        filter: s => {
          return (s.structureType === STRUCTURE_CONTAINER || 
                 s.structureType === STRUCTURE_STORAGE) && 
                 s.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        }
      });
      
      if (containers.length > 0) {
        // Find closest container
        const closestContainer = creep.pos.findClosestByPath(containers);
        
        if (closestContainer) {
          if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestContainer, {
              visualizePathStyle: { stroke: '#ffaa00' }
            });
          }
          return;
        }
      }
      
      // Fall back to harvesting from source
      const source = creep.pos.findClosestByPath(FIND_SOURCES);
      if (source) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
          creep.moveTo(source, {
            visualizePathStyle: { stroke: '#ffaa00' }
          });
        }
      } else {
        // No source found
        creep.say('❓ no src');
      }
    }
  }
}