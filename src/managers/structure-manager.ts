/**
 * Structure Manager
 * Handles structure operations, maintenance, and monitoring
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import { Helpers } from '../utils/helpers';

export class StructureManager {
  /**
   * Run structure operations for all structures
   */
  @Profiler.wrap('StructureManager.runStructures')
  public static runStructures(): void {
    // Process structures by type for efficiency
    this.runSpawns();
    this.runTowers();
    this.runExtensions();
    this.runContainers();
    this.runLinks();
    this.runLabs();
    this.runObserver();
    
    // Run global structure controller if available
    if (global.controller && global.controller.structure && global.controller.structure.routine) {
      for (const id in Game.structures) {
        const structure = Game.structures[id];
        
        try {
          global.controller.structure.routine(structure);
        } catch (e) {
          Logger.error(`Error in structure routine for ${structure.id}: ${(e as Error).message}`);
        }
      }
    }
  }
  
  /**
   * Run spawns logic
   */
  private static runSpawns(): void {
    for (const name in Game.spawns) {
      const spawn = Game.spawns[name];
      
      try {
        // Visual indicator of spawning progress
        if (spawn.spawning) {
          const spawningCreep = Game.creeps[spawn.spawning.name];
          spawn.room.visual.text(
            '🛠️ ' + spawningCreep.memory.role,
            spawn.pos.x + 1,
            spawn.pos.y,
            { align: 'left', opacity: 0.8 }
          );
        }
        
        // Other spawn logic as needed
      } catch (e) {
        Logger.error(`Error running spawn ${name}: ${(e as Error).message}`);
      }
    }
  }
  
  /**
   * Run towers logic
   */
  private static runTowers(): void {
    // Find all towers
    for (const id in Game.structures) {
      const structure = Game.structures[id];
      
      if (structure.structureType === STRUCTURE_TOWER) {
        const tower = structure as StructureTower;
        
        try {
          // Run tower AI if available
          if (global.ai.tower && global.ai.tower.task) {
            global.ai.tower.task(tower);
          } else {
            // Fallback tower logic
            this.defaultTowerLogic(tower);
          }
        } catch (e) {
          Logger.error(`Error running tower ${id}: ${(e as Error).message}`);
        }
      }
    }
  }
  
  /**
   * Default tower logic if the AI module is not available
   */
  private static defaultTowerLogic(tower: StructureTower): void {
    // Prioritize healing, then attack, then repair
    const closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: (creep) => creep.hits < creep.hitsMax
    });
    
    if (closestDamagedCreep) {
      tower.heal(closestDamagedCreep);
      return;
    }
    
    const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile) {
      tower.attack(closestHostile);
      return;
    }
    
    // Only repair if tower has > 50% energy
    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.5) {
      const closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (s) => s.hits < s.hitsMax && 
                      s.hits < 10000 && // Don't fully repair walls/ramparts
                      s.structureType !== STRUCTURE_WALL && 
                      s.structureType !== STRUCTURE_RAMPART
      });
      
      if (closestDamagedStructure) {
        tower.repair(closestDamagedStructure);
      }
    }
  }
  
  /**
   * Run extensions logic
   */
  private static runExtensions(): void {
    // Extensions don't generally need active logic
    // This is mostly a placeholder for future functionality
  }
  
  /**
   * Run containers logic
   */
  private static runContainers(): void {
    // Monitor container levels, etc.
  }
  
  /**
   * Run links logic
   */
  private static runLinks(): void {
    // For now, this is a placeholder for future link management
  }
  
  /**
   * Run labs logic
   */
  private static runLabs(): void {
    // For now, this is a placeholder for future lab management
  }
  
  /**
   * Run observer logic
   */
  private static runObserver(): void {
    // For now, this is a placeholder for future observer management
  }
  
  /**
   * Check if a structure needs repair
   */
  public static needsRepair(structure: Structure, urgentOnly: boolean = false): boolean {
    // Different thresholds for different structure types
    let threshold = 0;
    
    switch (structure.structureType) {
      case STRUCTURE_WALL:
        threshold = urgentOnly ? 0.001 : 0.0001;
        break;
      case STRUCTURE_RAMPART:
        threshold = urgentOnly ? 0.1 : 0.01;
        break;
      case STRUCTURE_CONTAINER:
        threshold = urgentOnly ? 0.3 : 0.7;
        break;
      case STRUCTURE_ROAD:
        threshold = urgentOnly ? 0.3 : 0.7;
        break;
      default:
        threshold = urgentOnly ? 0.5 : 0.8;
    }
    
    return structure.hits < structure.hitsMax * threshold;
  }
}