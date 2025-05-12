/**
 * Upgrader AI
 * Handles controller upgrading
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';

declare global {
  interface Room {
    _sources?: Source[];
    _containers?: AnyStructure[];
    _sourcesTick?: number;
  }
}

export class UpgraderAI {
  /**
   * Main task method for upgrader creeps
   */
  @Profiler.wrap('UpgraderAI.task')
  public static task(creep: Creep): void {
    // Batch actions: only run every 3 ticks, staggered by creep name
    if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) return;
    // Per-tick cache for sources, containers, and structures
    if (!creep.room._sourcesTick || creep.room._sourcesTick !== Game.time) {
      creep.room._sources = creep.room.find(FIND_SOURCES);
      creep.room._containers = creep.room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE });
      creep.room._sourcesTick = Game.time;
    }

    // Toggle working state when energy capacity changes
    if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      creep.memory.working = false;
      creep.say('🔄 harvest');
    }
    
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
      creep.say('⚡ upgrade');
    }
    
    if (creep.memory.working === undefined) {
      creep.memory.working = creep.store.getUsedCapacity() > 0;
    }
    
    if (creep.memory.working) {
      Profiler.start('UpgraderAI.upgrade');
      // Working state - upgrade controller
      if (creep.room.controller && creep.room.controller.my) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
          const target = creep.room.controller;
          const reusePath = getDynamicReusePath(creep, target);
          creep.moveTo(target, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
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
              const reusePath = getDynamicReusePath(creep, target);
              creep.moveTo(target, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
          }
        }
      }
      // Prefer containers/storage closest to the controller
      if (controller && creep.room._containers && creep.room._containers.length > 0) {
        // Sort containers by distance to controller
        const containers = creep.room._containers.slice().sort((a, b) =>
          controller.pos.getRangeTo(a.pos) - controller.pos.getRangeTo(b.pos)
        );
        const bestContainer = containers[0];
        if (creep.withdraw(bestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          const reusePath = getDynamicReusePath(creep, bestContainer);
          creep.moveTo(bestContainer, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return;
      }
      // Prefer source closest to the controller
      if (controller && creep.room._sources && creep.room._sources.length > 0) {
        const sources = creep.room._sources.slice().sort((a, b) =>
          controller.pos.getRangeTo(a.pos) - controller.pos.getRangeTo(b.pos)
        );
        const bestSource = sources[0];
        if (creep.harvest(bestSource) === ERR_NOT_IN_RANGE) {
          const reusePath = getDynamicReusePath(creep, bestSource);
          creep.moveTo(bestSource, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
        }
        return;
      }
      // Fallback: closest-by-path to creep (old logic)
      if (creep.room._sources && creep.room._sources.length > 0) {
        const fallbackSource = creep.pos.findClosestByPath(creep.room._sources);
        if (fallbackSource) {
          if (creep.harvest(fallbackSource) === ERR_NOT_IN_RANGE) {
            const reusePath = getDynamicReusePath(creep, fallbackSource);
            creep.moveTo(fallbackSource, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
          }
        }
      } else {
        // No source found
        creep.say('❓ no src');
      }
      Profiler.end('UpgraderAI.harvest');
    }
  }

  private static runHauler(creep: Creep): void {
    const targetRoom = creep.memory.targetRoom;
    const homeRoom = creep.memory.homeRoom;

    // Initialize working state if undefined
    if (creep.memory.working === undefined) {
      creep.memory.working = creep.store.getUsedCapacity() > 0;
    }

    // Fallback for missing targetRoom
    if (!targetRoom) {
      console.log(`[Hauler] ${creep.name} has no targetRoom set! Idling.`);
      creep.say('❓ no tgt');
      return;
    }

    // ... rest of your hauler logic ...
  }
}

export function getDynamicReusePath(creep: Creep, target: RoomPosition | { pos: RoomPosition }): number {
  const pos = (target instanceof RoomPosition) ? target : target.pos;
  const distance = creep.pos.getRangeTo(pos);
  if (distance < 8) return 3;
  if (distance < 20) return 10;
  return Math.min(50, Math.floor(distance * 1.5));
}