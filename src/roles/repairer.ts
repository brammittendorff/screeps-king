/**
 * Repairer AI
 * Handles repair tasks
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { RepairerStrategy } from './strategies/repairer-strategy';

// Create a singleton instance of the strategy
const strategy = new RepairerStrategy();

export class RepairerAI {
  /**
   * Main task method for repairer creeps
   */
  public static task(creep: Creep): void {
    BaseCreepAI.task(creep, strategy);
  }
  
  /**
   * Get optimal body for this role
   */
  public static getOptimalBody(energy: number, rcl: number): BodyPartConstant[] {
    return strategy.getBodyParts(energy, rcl);
  }
}