/**
 * Destroyer AI
 * Handles attacking and dismantling hostile structures
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { DestroyerStrategy } from './strategies/destroyer-strategy';

// Create a singleton instance of the strategy
const strategy = new DestroyerStrategy();

export class DestroyerAI {
  /**
   * Main task method for destroyer creeps
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