/**
 * Harvester AI
 * Handles energy collection and distribution
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { HarvesterStrategy } from './strategies/harvester-strategy';

// Create a singleton instance of the strategy
const strategy = new HarvesterStrategy();

export class HarvesterAI {
  /**
   * Main task method for harvester creeps
   */
  public static task(creep: Creep): void {
    // Batch actions: only run every 3 ticks, staggered by creep name
    if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) return;
    
    BaseCreepAI.task(creep, strategy);
  }
  
  /**
   * Get optimal body for this role
   */
  public static getOptimalBody(energy: number, rcl: number): BodyPartConstant[] {
    return strategy.getBodyParts(energy, rcl);
  }
}