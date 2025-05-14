/**
 * Upgrade Strategy Manager
 * Dynamically manages controller upgrade resources based on RCL
 */

import { Logger } from '../utils/logger';
import { CreepRole } from './creep-manager';
import * as _ from 'lodash';

interface UpgradeStrategy {
  desiredUpgraders: number;      // Base number of upgraders
  energyThreshold: number;       // Energy threshold for spawning extra upgraders
  storageReserve: number;        // Energy to keep in reserve (not for upgrading)
  controllerPriority: number;    // 0-10, higher = more focus on upgrading
  upgradeUntilStorage: boolean;  // Whether to prioritize upgrading before building storage
}

/**
 * Manages room upgrade strategies based on RCL
 */
export class UpgradeStrategyManager {
  // Strategies for each RCL level
  private static strategies: Record<number, UpgradeStrategy> = {
    1: {
      desiredUpgraders: 2,      // More upgraders to get to RCL 2 fast
      energyThreshold: 200,     // Low threshold, keep spawning
      storageReserve: 0,        // No reserve needed
      controllerPriority: 9,    // Very high priority - get to RCL 2 asap
      upgradeUntilStorage: true // Upgrade first priority until container
    },
    2: {
      desiredUpgraders: 3,      // Still need fast progress to RCL 3
      energyThreshold: 400,     // Still low threshold
      storageReserve: 500,      // Minimal reserve
      controllerPriority: 8,    // High priority - extensions are valuable
      upgradeUntilStorage: true // Upgrade priority until container
    },
    3: {
      desiredUpgraders: 4,      // More upgraders for RCL 4
      energyThreshold: 800,     // Higher threshold
      storageReserve: 1000,     // Some reserve for towers
      controllerPriority: 7,    // High priority - towers and storage next
      upgradeUntilStorage: true // Upgrade priority until container
    },
    4: {
      desiredUpgraders: 5,      // Many upgraders to get to RCL 5
      energyThreshold: 10000,   // Use storage energy
      storageReserve: 5000,     // Moderate reserve
      controllerPriority: 6,    // High-medium priority - storage is key
      upgradeUntilStorage: false // Balance with construction
    },
    5: {
      desiredUpgraders: 2,      // Fewer upgraders, more efficient now
      energyThreshold: 50000,   // Higher threshold with links
      storageReserve: 20000,    // Larger reserve
      controllerPriority: 5,    // Medium priority - links make it faster
      upgradeUntilStorage: false // Focus on infrastructure
    },
    6: {
      desiredUpgraders: 2,      // Fewer upgraders, even more efficient
      energyThreshold: 100000,  // Significant energy before scaling up
      storageReserve: 50000,    // Large reserve
      controllerPriority: 4,    // Medium-low priority - terminal is key
      upgradeUntilStorage: false // Focus on terminal, labs
    },
    7: {
      desiredUpgraders: 1,      // Minimal upgraders normally
      energyThreshold: 200000,  // Very high threshold
      storageReserve: 100000,   // Very large reserve
      controllerPriority: 3,    // Low priority - long upgrade time
      upgradeUntilStorage: false // Focus on economy
    },
    8: {
      desiredUpgraders: 1,      // Just one at RCL 8
      energyThreshold: 400000,  // Extremely high threshold
      storageReserve: 200000,   // Massive reserve
      controllerPriority: 1,    // Lowest priority - maintain only
      upgradeUntilStorage: false // Focus on other aspects
    }
  };

  /**
   * Get the upgrade strategy for a specific room
   */
  public static getStrategy(room: Room): UpgradeStrategy {
    const rcl = room.controller ? room.controller.level : 1;
    
    // Get the base strategy for this RCL
    const baseStrategy = this.strategies[rcl] || this.strategies[1];
    
    // Create a custom strategy based on room conditions
    const strategy = { ...baseStrategy };
    
    // Adjust for controller downgrade risk
    if (room.controller && room.controller.ticksToDowngrade < 5000) {
      strategy.desiredUpgraders = Math.max(strategy.desiredUpgraders, 2);
      strategy.controllerPriority = 10; // Emergency - highest priority
      Logger.warning(`Controller in ${room.name} at risk of downgrade (${room.controller.ticksToDowngrade} ticks). Prioritizing upgraders.`);
    }
    
    // Adjust for excess stored energy
    const storageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
    if (storageEnergy > strategy.energyThreshold * 2) {
      // Abundant energy - increase upgraders
      strategy.desiredUpgraders += Math.min(3, Math.floor((storageEnergy - strategy.energyThreshold) / 100000));
      Logger.info(`High energy in ${room.name} (${storageEnergy}). Increasing upgraders to ${strategy.desiredUpgraders}.`);
    }
    
    // Special case for RCL 7->8 transition
    if (rcl === 7 && room.controller && room.controller.progress > room.controller.progressTotal * 0.75) {
      // In final stretch to RCL 8, increase priority
      strategy.desiredUpgraders += 1;
      strategy.controllerPriority += 2;
      Logger.info(`${room.name} in final stretch to RCL 8 (${Math.floor(room.controller.progress / room.controller.progressTotal * 100)}%). Boosting upgraders.`);
    }
    
    return strategy;
  }
  
  /**
   * Calculate the number of upgraders needed for a room
   */
  public static getDesiredUpgraders(room: Room): number {
    const strategy = this.getStrategy(room);
    
    // Base number from strategy
    let count = strategy.desiredUpgraders;
    
    // Check if we're below energy threshold
    const storageEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
    if (storageEnergy < strategy.storageReserve) {
      // Reduce upgraders if low on energy
      count = Math.max(1, count - 1);
    }
    
    // Early game case - no storage yet
    if (!room.storage && room.controller && room.controller.level < 4) {
      // Ensure we have enough upgraders to progress quickly
      if (strategy.upgradeUntilStorage) {
        count = Math.max(count, Math.min(room.controller.level + 1, 5));
      }
    }
    
    return count;
  }
  
  /**
   * Calculate the priority for upgrader creeps
   * Higher number = higher priority (0-100)
   */
  public static getUpgraderPriority(room: Room): number {
    const strategy = this.getStrategy(room);
    
    // Base priority from strategy (scale from 0-10 to 50-100)
    let priority = 50 + (strategy.controllerPriority * 5);
    
    // Emergency case - controller about to downgrade
    if (room.controller && room.controller.ticksToDowngrade < 3000) {
      priority = 95; // Just below harvester priority
    }
    
    // If no upgraders, increase priority
    const upgraders = _.filter(Game.creeps, 
      c => c.memory.role === CreepRole.Upgrader && c.memory.homeRoom === room.name
    );
    
    if (upgraders.length === 0) {
      priority += 5; // Bump priority if none exists
    }
    
    return priority;
  }
  
  /**
   * Determine if construction or upgrading should be prioritized
   * Returns true if upgrading should take priority over building
   */
  public static shouldPrioritizeUpgrade(room: Room): boolean {
    const strategy = this.getStrategy(room);
    
    // Emergency case - controller about to downgrade
    if (room.controller && room.controller.ticksToDowngrade < 5000) {
      return true;
    }
    
    // Early game case - no storage yet
    if (!room.storage && strategy.upgradeUntilStorage) {
      return true;
    }
    
    // Check strategic priority
    return strategy.controllerPriority > 5;
  }
}