/**
 * Hauler AI
 * Handles energy collection and delivery for maximum speed and synergy
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import * as _ from 'lodash';

export class HaulerAI {
  /**
   * Main task method for hauler creeps
   */
  @Profiler.wrap('HaulerAI.task')
  public static task(creep: Creep): void {
    // State: working = delivering, !working = collecting
    if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      creep.memory.working = false;
      creep.say('🔄 collect');
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
      creep.memory.working = true;
      creep.say('⚡ deliver');
    }
    if (creep.memory.working === undefined) {
      creep.memory.working = creep.store.getUsedCapacity() > 0;
    }

    if (creep.memory.working) {
      // DELIVERING
      // 1. Spawn/extensions
      let targets = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && (s as any).energy < (s as any).energyCapacity
      });
      if (targets.length > 0) {
        if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], { reusePath: 10 });
        }
        return;
      }
      // 2. Controller container (if present)
      const controllerContainer = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER && creep.room.controller && s.pos.getRangeTo(creep.room.controller) <= 3 && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      });
      if (controllerContainer.length > 0) {
        if (creep.transfer(controllerContainer[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(controllerContainer[0], { reusePath: 10 });
        }
        return;
      }
      // 3. Construction sites (if builder needs energy)
      const builder = _.find(Game.creeps, c => c.memory.role === 'builder' && c.room.name === creep.room.name && c.store.getFreeCapacity() > 0);
      if (builder) {
        if (creep.transfer(builder, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(builder, { reusePath: 10 });
        }
        return;
      }
      // 4. Storage (if exists and not full)
      if (creep.room.storage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(creep.room.storage, { reusePath: 10 });
        }
        return;
      }
      // 5. Towers (if not full)
      const towers = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER && (s as StructureTower).energy < (s as StructureTower).energyCapacity
      });
      if (towers.length > 0) {
        if (creep.transfer(towers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(towers[0], { reusePath: 10 });
        }
        return;
      }
      // Idle at storage or spawn
      const idlePos = (creep.room.storage && creep.room.storage.pos) || (creep.room.find(FIND_MY_SPAWNS)[0]?.pos) || new RoomPosition(25, 25, creep.room.name);
      creep.moveTo(idlePos, { reusePath: 20 });
      creep.say('❓ idle');
      return;
    } else {
      // COLLECTING
      // 1. Dropped energy
      const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: (r: Resource) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
      });
      if (dropped) {
        if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
          creep.moveTo(dropped, { reusePath: 10 });
        }
        return;
      }
      // 2. Containers/storage with energy
      let sources = creep.room.find(FIND_STRUCTURES, {
        filter: (s: AnyStructure) =>
          (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
          s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      }) as (StructureContainer | StructureStorage)[];
      sources = _.sortBy(sources, s => -s.store[RESOURCE_ENERGY]);
      if (sources.length > 0) {
        if (creep.withdraw(sources[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(sources[0], { reusePath: 10 });
        }
        return;
      }
      // 3. Fallback: harvest from source (if no containers/storage)
      const sourcesRaw = creep.room.find(FIND_SOURCES_ACTIVE);
      if (sourcesRaw.length > 0) {
        if (creep.harvest(sourcesRaw[0]) === ERR_NOT_IN_RANGE) {
          creep.moveTo(sourcesRaw[0], { reusePath: 10 });
        }
        return;
      }
      // Idle at storage or spawn
      const idlePos = (creep.room.storage && creep.room.storage.pos) || (creep.room.find(FIND_MY_SPAWNS)[0]?.pos) || new RoomPosition(25, 25, creep.room.name);
      creep.moveTo(idlePos, { reusePath: 20 });
      creep.say('❓ idle');
    }
  }
} 