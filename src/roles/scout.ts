/**
 * Scout AI
 * Handles exploration of new rooms
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { ScoutStrategy } from './strategies/scout-strategy';

// Create a singleton instance of the strategy
const strategy = new ScoutStrategy();

export class ScoutAI {
  /**
   * Main task method for scout creeps
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