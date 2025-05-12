/**
 * Hauler AI
 * Handles energy collection and delivery for maximum speed and synergy
 * Now task-driven: will use TaskManager for all transfer/withdraw/pickup tasks, falling back to legacy logic if no task is available.
 */

import { Logger } from '../utils/logger';
import * as _ from 'lodash';
import { TaskManager } from '../managers/task-manager';
import { RoomCache } from '../utils/room-cache';
import { RoomTaskManager } from '../managers/room-task-manager';

export class HaulerAI {
  /**
   * Main task method for hauler creeps
   */
  public static task(creep: Creep): void {
    // Use TaskManager only for special/remote tasks
    const task = TaskManager.findTaskForCreep(creep);
    if (task) {
      TaskManager.executeTask(creep, task);
      return;
    }
    // --- Batched, on-demand room tasks ---
    const roomTasks = RoomTaskManager.getTasks(creep.room);
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
      // Use batched refill targets
      const refillTargets = roomTasks.refill
        .map(id => Game.getObjectById(id))
        .filter((s): s is Structure => !!s)
        .sort((a, b) => {
          // Priority: spawn < extension < tower
          const priority = (s: Structure) =>
            s.structureType === STRUCTURE_SPAWN ? 0 :
            s.structureType === STRUCTURE_EXTENSION ? 1 :
            s.structureType === STRUCTURE_TOWER ? 2 : 3;
          return priority(a) - priority(b);
        });
      if (refillTargets.length > 0) {
        const target = creep.pos.findClosestByPath(refillTargets);
        if (target) {
          if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { reusePath: 10 });
          }
          return;
        }
      }
      // Idle at storage or spawn
      const idlePos = (creep.room.storage && creep.room.storage.pos) || (creep.room.find(FIND_MY_SPAWNS)[0]?.pos) || new RoomPosition(25, 25, creep.room.name);
      creep.moveTo(idlePos, { reusePath: 20 });
      creep.say('❓ idle');
      return;
    } else {
      // COLLECTING
      // Use batched pickup targets
      const pickupTargets = roomTasks.pickup
        .map(id => Game.getObjectById(id))
        .filter((r): r is Resource => !!r);
      if (pickupTargets.length > 0) {
        const target = creep.pos.findClosestByPath(pickupTargets);
        if (target) {
          if (creep.pickup(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { reusePath: 10 });
          }
          return;
        }
      }
      // 2. Containers/storage with energy
      let sources = RoomCache.get(creep.room, FIND_STRUCTURES, {
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
      const sourcesRaw = RoomCache.get(creep.room, FIND_SOURCES_ACTIVE);
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