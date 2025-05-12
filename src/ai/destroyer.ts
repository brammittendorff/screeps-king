import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';

export class DestroyerAI {
  /**
   * Main task method for destroyer creeps
   * Prioritizes destroying non-owned spawns, then other hostile structures
   */
  @Profiler.wrap('DestroyerAI.task')
  public static task(creep: Creep): void {
    // If creep is dying or has no attack parts, fallback to idle
    if (creep.ticksToLive && creep.ticksToLive < 10) {
      creep.say('💀');
      return;
    }
    if (!creep.body.some(part => part.type === ATTACK)) {
      creep.say('❌ No ATTACK');
      return;
    }

    // Find all hostile or neutral spawns in the room
    const targets = creep.room.find(FIND_STRUCTURES, {
      filter: (s: Structure) =>
        s.structureType === STRUCTURE_SPAWN &&
        !(s as StructureSpawn).my
    });

    // If there are spawns, target the closest one
    if (targets.length > 0) {
      const target = creep.pos.findClosestByRange(targets);
      if (target) {
        if (creep.pos.isNearTo(target)) {
          const result = creep.attack(target);
          if (result === OK) {
            creep.say('⚔️ Spawn');
            Logger.info(`${creep.name} attacking spawn at ${target.pos.x},${target.pos.y} in ${creep.room.name}`);
          } else {
            creep.say('❌');
            Logger.warn(`${creep.name} failed to attack spawn: ${result}`);
          }
        } else {
          creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' } });
          creep.say('🚶‍♂️➡️⚔️');
        }
        return;
      }
    }

    // If no spawns, target other hostile structures (except walls/ramparts)
    const hostileStructures = creep.room.find(FIND_STRUCTURES, {
      filter: (s: Structure) =>
        (s.structureType !== STRUCTURE_WALL &&
         s.structureType !== STRUCTURE_RAMPART &&
         (s.structureType !== STRUCTURE_SPAWN || !(s as StructureSpawn).my))
    });
    if (hostileStructures.length > 0) {
      const target = creep.pos.findClosestByRange(hostileStructures);
      if (target) {
        if (creep.pos.isNearTo(target)) {
          const result = creep.attack(target);
          if (result === OK) {
            creep.say('⚔️ Struct');
            Logger.info(`${creep.name} attacking structure at ${target.pos.x},${target.pos.y} in ${creep.room.name}`);
          } else {
            creep.say('❌');
            Logger.warn(`${creep.name} failed to attack structure: ${result}`);
          }
        } else {
          creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
          creep.say('🚶‍♂️➡️⚔️');
        }
        return;
      }
    }

    // If nothing to attack, idle in a safe spot
    creep.say('😴 Idle');
    if (creep.room.controller) {
      creep.moveTo(creep.room.controller, { range: 3 });
    } else {
      creep.moveTo(25, 25);
    }
  }
} 