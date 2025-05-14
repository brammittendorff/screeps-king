/**
 * Archer AI
 * Handles ranged attack for defense and offense
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { ArcherStrategy } from './strategies/archer-strategy';

// Create a singleton instance of the strategy
const strategy = new ArcherStrategy();

export class ArcherAI {
  /**
   * Main task method for archer creeps
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