import { Logger } from '../utils/logger';
import { RoomCache } from '../utils/room-cache';

export class DefenderAI {
  /**
   * Main task method for defender creeps
   */
  public static task(creep: Creep): void {
    // Batch actions: only run every 3 ticks, staggered by creep name
    if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) return;
    // Attack nearest hostile
    const hostile = creep.pos.findClosestByRange(RoomCache.get(creep.room, FIND_HOSTILE_CREEPS));
    if (hostile) {
      if (creep.attack(hostile) === ERR_NOT_IN_RANGE) {
        creep.moveTo(hostile, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 5 });
      }
      return;
    }
    // Heal nearest wounded ally
    const wounded = creep.pos.findClosestByRange(RoomCache.get(creep.room, FIND_MY_CREEPS).filter(c => c.hits < c.hitsMax));
    if (wounded) {
      if (creep.heal(wounded) === ERR_NOT_IN_RANGE) {
        creep.moveTo(wounded, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
      }
      return;
    }
    // Patrol near spawn or controller
    const spawn = RoomCache.get(creep.room, FIND_MY_SPAWNS)[0];
    if (spawn) {
      creep.moveTo(spawn, { range: 3, reusePath: 10 });
    } else if (creep.room.controller) {
      creep.moveTo(creep.room.controller, { range: 3, reusePath: 10 });
    }
  }
} 