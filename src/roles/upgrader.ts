/**
 * Upgrader AI
 * Handles controller upgrading
 */

import { Logger } from '../utils/logger';
import { CreepActionGuard } from '../utils/helpers';

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
  public static task(creep: Creep): void {
    // --- Action pipeline guard: only one pipeline action per tick (Screeps rule) ---
    CreepActionGuard.reset(creep);
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
      // Working state - upgrade controller
      if (creep.room.controller && creep.room.controller.my) {
        // Only one pipeline action per tick (Screeps rule)
        if (CreepActionGuard.allow(creep, 'upgrade')) {
          if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            const target = creep.room.controller;
            const reusePath = getDynamicReusePath(creep, target);
            creep.moveTo(target, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
          }
        }
      } else {
        // No controller to upgrade in this room
        creep.say('❓ no ctrl');
      }
    } 
    // Harvesting state - collect energy
    else {
      const mapping = creep.room.memory.mapping;
      const controller = creep.room.controller;
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
              const reusePath = getDynamicReusePath(creep, bestContainer);
              creep.moveTo(bestContainer, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
            }
          }
          return;
        }
      }
      // Prefer source closest to the controller
      if (controller && creep.room._sources && creep.room._sources.length > 0) {
        const sources = creep.room._sources.slice().sort((a, b) =>
          controller.pos.getRangeTo(a.pos) - controller.pos.getRangeTo(b.pos)
        );
        const bestSource = sources[0];
        // Only one pipeline action per tick (Screeps rule)
        if (CreepActionGuard.allow(creep, 'harvest')) {
          if (creep.harvest(bestSource) === ERR_NOT_IN_RANGE) {
            const reusePath = getDynamicReusePath(creep, bestSource);
            creep.moveTo(bestSource, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
          }
        }
        return;
      }
      // Fallback: closest-by-path to creep (old logic)
      if (creep.room._sources && creep.room._sources.length > 0) {
        const fallbackSource = creep.pos.findClosestByPath(creep.room._sources);
        if (fallbackSource) {
          // Only one pipeline action per tick (Screeps rule)
          if (CreepActionGuard.allow(creep, 'harvest')) {
            if (creep.harvest(fallbackSource) === ERR_NOT_IN_RANGE) {
              const reusePath = getDynamicReusePath(creep, fallbackSource);
              creep.moveTo(fallbackSource, { reusePath, visualizePathStyle: { stroke: '#ffaa00' } });
            }
          }
        }
      } else {
        // No source found
        creep.say('❓ no src');
      }
    }
  }
}

export function getDynamicReusePath(creep: Creep, target: RoomPosition | { pos: RoomPosition }): number {
  const pos = (target instanceof RoomPosition) ? target : target.pos;
  const distance = creep.pos.getRangeTo(pos);
  if (distance < 8) return 3;
  if (distance < 20) return 10;
  return Math.min(50, Math.floor(distance * 1.5));
}