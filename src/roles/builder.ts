/**
 * Builder AI
 * Handles construction and repair tasks
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { BuilderStrategy } from './strategies/builder-strategy';

// Create a singleton instance of the strategy
const strategy = new BuilderStrategy();

export class BuilderAI {
  /**
   * Main task method for builder creeps
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