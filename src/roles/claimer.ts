/**
 * Claimer AI
 * Used to claim new rooms for expansion
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { ClaimerStrategy } from './strategies/claimer-strategy';

// Create a singleton instance of the strategy
const strategy = new ClaimerStrategy();

export class ClaimerAI {
  /**
   * Main task method for claimer creeps
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