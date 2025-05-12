import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';

export class ArcherAI {
  /**
   * Main task method for archer creeps
   */
  @Profiler.wrap('ArcherAI.task')
  public static task(creep: Creep): void {
    // 1. Attack nearest hostile with ranged attack
    const hostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostile) {
      if (creep.pos.getRangeTo(hostile) <= 3) {
        creep.rangedAttack(hostile);
      }
      if (creep.pos.getRangeTo(hostile) > 1) {
        creep.moveTo(hostile, { visualizePathStyle: { stroke: '#00bfff' }, reusePath: 5 });
      } else {
        // Kite: move away if too close
        const direction = creep.pos.getDirectionTo(hostile);
        // Move in the opposite direction (add 3, wrap around 1-8)
        const oppositeDirection = ((direction + 3) % 8) + 1 as DirectionConstant;
        creep.move(oppositeDirection);
      }
      return;
    }
    // 2. Heal nearest wounded ally (if has HEAL parts)
    if (creep.getActiveBodyparts(HEAL) > 0) {
      const wounded = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: c => c.hits < c.hitsMax
      });
      if (wounded) {
        if (creep.pos.getRangeTo(wounded) <= 1) {
          creep.heal(wounded);
        } else {
          creep.moveTo(wounded, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
        }
        return;
      }
    }
    // 3. Patrol near spawn or controller
    const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn) {
      creep.moveTo(spawn, { range: 3, reusePath: 10 });
    } else if (creep.room.controller) {
      creep.moveTo(creep.room.controller, { range: 3, reusePath: 10 });
    }
  }
} 