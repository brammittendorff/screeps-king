/**
 * Upgrader AI
 * Handles controller upgrading
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { UpgraderStrategy } from './strategies/upgrader-strategy';

// Create a singleton instance of the strategy
const strategy = new UpgraderStrategy();

export class UpgraderAI {
  /**
   * Main task method for upgrader creeps
   */
  public static task(creep: Creep): void {
    // Batch actions: only run every 3 ticks, staggered by creep name
    if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) return;
    
    // Map old working memory to new state
    if (creep.memory.working !== undefined && creep.memory.state === undefined) {
      creep.memory.state = creep.memory.working ? 'working' : 'harvesting';
    }
    
    BaseCreepAI.task(creep, strategy);
  }
  
  /**
   * Get optimal body for this role
   */
  public static getOptimalBody(energy: number, rcl: number): BodyPartConstant[] {
    return strategy.getBodyParts(energy, rcl);
  }
}