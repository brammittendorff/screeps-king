/**
 * Repairer AI
 * Handles repair tasks in a fully task-driven way. Falls back to building/upgrading if no repair tasks are available.
 */

import { TaskManager } from '../managers/task-manager';
import { RoomTaskManager } from '../managers/room-task-manager';

export class RepairerAI {
  /**
   * Main task method for repairer creeps
   */
  public static task(creep: Creep): void {
    // Use TaskManager only for special/remote tasks
    const task = TaskManager.findTaskForCreep(creep);
    if (task) {
      TaskManager.executeTask(creep, task);
      return;
    }
    // --- Batched, on-demand room repair tasks ---
    const roomTasks = RoomTaskManager.getTasks(creep.room);
    const repairTargets = roomTasks.repair
      .map(id => Game.getObjectById(id))
      .filter((s): s is Structure => !!s);
    if (repairTargets.length > 0) {
      const target = creep.pos.findClosestByPath(repairTargets);
      if (target) {
        if (creep.repair(target) === ERR_NOT_IN_RANGE) {
          creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 10 });
        }
        return;
      }
    }
    // Fallback: help with building or upgrading
    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (sites.length > 0) {
      if (creep.build(sites[0]) === ERR_NOT_IN_RANGE) {
        creep.moveTo(sites[0], { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 10 });
      }
      return;
    }
    if (creep.room.controller) {
      if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 10 });
      }
    }
  }
} 