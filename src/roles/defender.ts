/**
 * Defender AI
 * Handles defense of rooms and creeps
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { DefenderStrategy } from './strategies/defender-strategy';

// Create a singleton instance of the strategy
const strategy = new DefenderStrategy();

export class DefenderAI {
  /**
   * Main task method for defender creeps
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