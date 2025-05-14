/**
 * Tower AI
 * Handles tower defense, healing and repair
 */

import { Logger } from '../utils/logger';

export class TowerAI {
  /**
   * Main task method for tower structures
   * @param tower The tower to control
   * @param logAction Optional callback for analytics/logging, called with the action taken
   */
  public static task(tower: StructureTower, logAction?: (action: string) => void): void {
    // The task method is an alias for routine
    this.routine(tower, logAction);
  }
  
  /**
   * Tower routine - prioritize defense, healing, then repair
   * @param tower The tower to control
   * @param logAction Optional callback for analytics/logging, called with the action taken
   */
  public static routine(tower: StructureTower, logAction?: (action: string) => void): void {
    // 1. Heal wounded allies
    const wounded = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: c => c.hits < c.hitsMax
    });
    if (wounded) {
      tower.heal(wounded);
      if (logAction) logAction('heal');
      return;
    }
    // 2. Attack the most dangerous hostile
    const hostiles = tower.room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
      // Prioritize those with attack parts, then closest to spawn/controller
      const dangerous = hostiles.filter(h => h.getActiveBodyparts(ATTACK) > 0 || h.getActiveBodyparts(RANGED_ATTACK) > 0);
      let target: Creep | null = null;
      if (dangerous.length > 0) {
        target = tower.pos.findClosestByRange(dangerous);
      } else {
        // Fallback: closest hostile
        target = tower.pos.findClosestByRange(hostiles);
      }
      if (target) {
        tower.attack(target);
        if (logAction) logAction('attack');
        return;
      }
    }
    // 3. Repair ramparts/walls if no hostiles
    const ramparts = tower.room.find(FIND_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 10000
    });
    if (ramparts.length > 0) {
      const weakest = ramparts.reduce((a, b) => (a.hits < b.hits ? a : b));
      tower.repair(weakest);
      if (logAction) logAction('repair');
    }
  }
}