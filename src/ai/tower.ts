/**
 * Tower AI
 * Handles tower defense, healing and repair
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';

export class TowerAI {
  /**
   * Main task method for tower structures
   */
  @Profiler.wrap('TowerAI.task')
  public static task(tower: StructureTower): void {
    // The task method is an alias for routine
    this.routine(tower);
  }
  
  /**
   * Tower routine - prioritize defense, healing, then repair
   */
  @Profiler.wrap('TowerAI.routine')
  public static routine(tower: StructureTower): void {
    // Skip if tower has no energy
    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      return;
    }
    
    // Find and attack hostile creeps
    const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile) {
      tower.attack(closestHostile);
      return;
    }
    
    // Find and heal damaged friendly creeps
    const closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: (creep) => creep.hits < creep.hitsMax
    });
    
    if (closestDamagedCreep) {
      tower.heal(closestDamagedCreep);
      return;
    }
    
    // Only repair if we have at least 50% energy
    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.5) {
      // Find critical structures to repair first (not including walls/ramparts)
      const criticalRepairs = tower.room.find(FIND_STRUCTURES, {
        filter: (structure) => {
          return structure.hits < structure.hitsMax * 0.3 && // Less than 30% health
                structure.structureType !== STRUCTURE_WALL &&
                structure.structureType !== STRUCTURE_RAMPART;
        }
      });
      
      if (criticalRepairs.length > 0) {
        // Sort by damage percentage
        criticalRepairs.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
        tower.repair(criticalRepairs[0]);
        return;
      }
      
      // If no critical repairs and energy is abundant (>80%), do regular repairs
      if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.8) {
        const repairs = tower.room.find(FIND_STRUCTURES, {
          filter: (structure) => {
            return structure.hits < structure.hitsMax &&
                  // Don't fully repair walls/ramparts, just keep them at reasonable levels
                  (structure.structureType !== STRUCTURE_WALL && 
                   structure.structureType !== STRUCTURE_RAMPART || 
                   structure.hits < 10000);
          }
        });
        
        if (repairs.length > 0) {
          // Sort by damage percentage
          repairs.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
          tower.repair(repairs[0]);
        }
      }
    }
  }
}