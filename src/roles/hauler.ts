/**
 * Hauler AI
 * Handles energy collection and delivery
 * Refactored to use BaseCreep architecture
 */

import { BaseCreepAI } from './base-creep';
import { HaulerStrategy } from './strategies/hauler-strategy';

// Create a singleton instance of the strategy
const strategy = new HaulerStrategy();

export class HaulerAI {
  /**
   * Main task method for hauler creeps
   */
  public static task(creep: Creep): void {
    // Map old working memory to new state if needed
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