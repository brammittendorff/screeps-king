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
    
    if (creep.memory.working) {
      Profiler.start('UpgraderAI.upgrade');
      // Working state - upgrade controller
      if (creep.room.controller && creep.room.controller.my) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
          creep.moveTo(creep.room.controller, {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: 10
          });
        }
      } else {
        // No controller to upgrade in this room
        creep.say('❓ no ctrl');
      }
      Profiler.end('UpgraderAI.upgrade');
    } 
    // Harvesting state - collect energy
    else {
      Profiler.start('UpgraderAI.harvest');
      const controller = creep.room.controller;
      // Try to find dropped energy first (closest by path to creep)
      let target = null;
      if (global.helpers && global.helpers.findDroppedEnergy) {
        const droppedEnergy = global.helpers.findDroppedEnergy(creep.room);
        if (droppedEnergy.length > 0) {
          target = creep.pos.findClosestByPath(droppedEnergy);
          if (target) {
            if (creep.pickup(target) === ERR_NOT_IN_RANGE) {
              creep.moveTo(target, {
                visualizePathStyle: { stroke: '#ffaa00' },
                reusePath: 10
              });
            }
            return;
          }
        }
      }

      // Prefer containers/storage closest to the controller
      if (controller) {
        const containers = creep.room.find(FIND_STRUCTURES, {
          filter: s =>
            (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
            s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });
        if (containers.length > 0) {
          // Sort containers by distance to controller
          containers.sort((a, b) =>
            controller.pos.getRangeTo(a.pos) - controller.pos.getRangeTo(b.pos)
          );
          const bestContainer = containers[0];
          if (creep.withdraw(bestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(bestContainer, {
              visualizePathStyle: { stroke: '#ffaa00' },
              reusePath: 10
            });
          }
          return;
        }
      }

      // Prefer source closest to the controller
      if (controller) {
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length > 0) {
          sources.sort((a, b) =>
            controller.pos.getRangeTo(a.pos) - controller.pos.getRangeTo(b.pos)
          );
          const bestSource = sources[0];
          if (creep.harvest(bestSource) === ERR_NOT_IN_RANGE) {
            creep.moveTo(bestSource, {
              visualizePathStyle: { stroke: '#ffaa00' },
              reusePath: 10
            });
          }
          return;
        }
      }

      // Fallback: closest-by-path to creep (old logic)
      const fallbackSource = creep.pos.findClosestByPath(FIND_SOURCES);
      if (fallbackSource) {
        if (creep.harvest(fallbackSource) === ERR_NOT_IN_RANGE) {
          creep.moveTo(fallbackSource, {
            visualizePathStyle: { stroke: '#ffaa00' },
            reusePath: 10
          });
        }
      } else {
        // No source found
        creep.say('❓ no src');
      }
      Profiler.end('UpgraderAI.harvest');
    }
  }
}