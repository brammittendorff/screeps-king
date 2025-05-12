/**
 * Harvester AI
 * Handles harvesting and energy delivery
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import * as _ from 'lodash';

enum HarvesterState {
  Harvesting = 'harvesting',
  Unloading = 'unloading',
  Building = 'building'
}

export class HarvesterAI {
  /**
   * Main task method for harvester creeps
   */
  @Profiler.wrap('HarvesterAI.task')
  public static task(creep: Creep): void {
    // Get or initialize creep memory
    const memory = creep.memory;
    
    // Always define mineral for all states
    const mineral = creep.room.find(FIND_MINERALS)[0];
    
    // Initialize if needed
    if (!memory.initiated) {
      memory.activity = HarvesterState.Harvesting;

      // Safely get target source ID
      try {
        if (global.go && global.go.resource && global.go.resource.selectClosestTo) {
          memory.targetSourceId = global.go.resource.selectClosestTo(creep);
        } else {
          // Fallback - find source directly
          const sources = creep.room.find(FIND_SOURCES);
          if (sources.length > 0) {
            const source = creep.pos.findClosestByRange(sources);
            memory.targetSourceId = source ? source.id : null;
          }
        }
      } catch (e) {
        console.log(`Error finding source for ${creep.name}: ${e}`);
        // Find any source as a fallback
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length > 0) {
          memory.targetSourceId = sources[0].id;
        }
      }

      memory.initiated = true;
      creep.say('🌾 Work!');
    }
    
    // State machine for harvester behavior
    switch (memory.activity as HarvesterState) {
      case HarvesterState.Harvesting:
        // Advanced: Prefer energy, but if full or no energy available, mine minerals if possible
        const extractor = creep.room.find(FIND_STRUCTURES, {
          filter: s => s.structureType === STRUCTURE_EXTRACTOR
        })[0];
        // @ts-ignore
        const mineralAvailable = extractor && mineral && mineral.amount > 0 && (!mineral.ticksToRegeneration || mineral.ticksToRegeneration === 0);
        // If not full of energy, prefer energy sources
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
          this.doHarvesting(creep);
        } else if (mineralAvailable && creep.store.getFreeCapacity(mineral.mineralType) > 0) {
          // If full of energy but can carry minerals, mine minerals
          if (creep.harvest(mineral) === ERR_NOT_IN_RANGE) {
            creep.moveTo(mineral, { visualizePathStyle: { stroke: '#00ff00' } });
          }
        } else {
          // If can't mine minerals, unload
          memory.activity = HarvesterState.Unloading;
          creep.say('🔄 Unload');
        }
        break;
      case HarvesterState.Unloading:
        // Advanced: If carrying minerals, deliver to storage/terminal
        const mineralType = mineral ? mineral.mineralType : null;
        if (mineralType && creep.store[mineralType] > 0) {
          // Prefer storage, then terminal
          const storage = creep.room.storage;
          const terminal = creep.room.terminal;
          let target = null;
          if (storage && storage.store.getFreeCapacity(mineralType) > 0) {
            target = storage;
          } else if (terminal && terminal.store.getFreeCapacity(mineralType) > 0) {
            target = terminal;
          }
          if (target) {
            if (creep.transfer(target, mineralType) === ERR_NOT_IN_RANGE) {
              creep.moveTo(target, { visualizePathStyle: { stroke: '#00ff00' } });
            }
            return;
          }
        }
        // Otherwise, do normal unloading
        this.doUnloading(creep);
        break;
      case HarvesterState.Building:
        this.doBuilding(creep);
        break;
      default:
        // Reset to harvesting
        memory.activity = HarvesterState.Harvesting;
        creep.say('🔄 Reset');
    }
    
    // Save state
    this.saveState(creep, memory);
  }
  
  /**
   * Handle harvesting state
   */
  private static doHarvesting(creep: Creep): void {
    const memory = creep.memory;
    
    // Switch to unloading if full
    if (creep.store.getFreeCapacity() === 0) {
      memory.activity = HarvesterState.Unloading;
      creep.say('📦 Unload');
      return;
    }
    
    // Get target source
    const targetSource = Game.getObjectById(memory.targetSourceId as Id<Source>);
    
    // Check if source exists
    if (!targetSource) {
      Logger.debug(`${creep.name}: Invalid source, getting new source`);

      // Safely get a new target source
      try {
        if (global.go && global.go.resource && global.go.resource.selectClosestTo) {
          memory.targetSourceId = global.go.resource.selectClosestTo(creep);
        } else {
          // Fallback - find source directly
          const sources = creep.room.find(FIND_SOURCES);
          if (sources.length > 0) {
            const source = creep.pos.findClosestByRange(sources);
            memory.targetSourceId = source ? source.id : null;
          }
        }
      } catch (e) {
        console.log(`Error finding source for ${creep.name}: ${e}`);
        // Find any source as a fallback
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length > 0) {
          memory.targetSourceId = sources[0].id;
        }
      }

      // If still no valid source, move randomly
      if (!memory.targetSourceId) {
        creep.say('⚠️ No src!');
        creep.moveTo(25, 25);
        return;
      }
      
      return;
    }
    
    // Harvest the source
    const result = creep.harvest(targetSource);
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(targetSource, {
        visualizePathStyle: { stroke: '#ffaa00' }
      });
    }
  }
  
  /**
   * Handle unloading state
   */
  private static doUnloading(creep: Creep): void {
    const memory = creep.memory;
    
    // Switch back to harvesting if empty
    if (creep.store.getUsedCapacity() === 0) {
      memory.activity = HarvesterState.Harvesting;
      creep.say('🔄 Harvest');
      return;
    }
    
    // Find structures that need energy
    const structuresPriority = [
      STRUCTURE_EXTENSION,
      STRUCTURE_SPAWN,
      STRUCTURE_TOWER
    ];
    
    let targets: Structure[] = [];
    
    // Check each structure type in priority order
    for (const structureType of structuresPriority) {
      const structures = creep.room.find(FIND_MY_STRUCTURES, {
        filter: (s) => {
          // Use helper function if available
          if (global.helpers && global.helpers.getEnergy && global.helpers.getEnergyCapacity) {
            return s.structureType === structureType && 
                  global.helpers.getEnergy(s) < global.helpers.getEnergyCapacity(s);
          }
          
          // Fallback for extensions, spawns, towers
          if (structureType === STRUCTURE_EXTENSION || 
              structureType === STRUCTURE_SPAWN || 
              structureType === STRUCTURE_TOWER) {
            const energyStructure = s as StructureExtension | StructureSpawn | StructureTower;
            return s.structureType === structureType && 
                  energyStructure.energy < energyStructure.energyCapacity;
          }
          
          // Fallback for storage structures
          if (structureType === STRUCTURE_STORAGE || 
              structureType === STRUCTURE_CONTAINER) {
            const storeStructure = s as StructureStorage | StructureContainer;
            return s.structureType === structureType && 
                  storeStructure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
          }
          
          return false;
        }
      });
      
      targets = targets.concat(structures);
    }
    
    // Transfer energy if targets found
    if (targets.length > 0) {
      if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(targets[0], {
          visualizePathStyle: { stroke: '#ffffff' }
        });
      }
    } else {
      // No energy need, switch to building
      memory.activity = HarvesterState.Building;
      memory.buildMode = undefined;
      creep.say('🚧 Build');
    }
  }
  
  /**
   * Handle building state
   */
  private static doBuilding(creep: Creep): void {
    const memory = creep.memory;
    
    // Switch back to harvesting if empty
    if (creep.store.getUsedCapacity() === 0) {
      memory.activity = HarvesterState.Harvesting;
      memory.buildMode = undefined;
      creep.say('🔄 Harvest');
      return;
    }
    
    // Initialize build mode if needed
    if (memory.buildMode === undefined) {
      memory.buildMode = _.random(1, 2); // 1 = build, 2 = repair
      
      switch (memory.buildMode) {
        case 1:
          creep.say('🏗️ Build');
          break;
        case 2:
          creep.say('🔧 Repair');
          break;
      }
    }
    
    // Handle build mode
    if (memory.buildMode === 1) {
      // Find construction sites
      const targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
      
      if (targets.length > 0) {
        if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], {
            visualizePathStyle: { stroke: '#ffffff' }
          });
        }
      } else {
        // Try to create construction sites if possible
        if (global.patterns && 
            global.patterns.buildings && 
            creep.room.memory.template && 
            global.patterns.buildings[creep.room.memory.template]) {
          global.patterns.buildings[creep.room.memory.template].build(creep.room);
        }
        
        // No construction sites, go back to harvesting
        memory.activity = HarvesterState.Harvesting;
        memory.buildMode = undefined;
      }
    }
    // Handle repair mode
    else if (memory.buildMode === 2) {
      // Find damaged structures
      const targets = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
      });
      
      if (targets.length > 0) {
        // Sort by damage percentage
        targets.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
        
        if (creep.repair(targets[0]) === ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], {
            visualizePathStyle: { stroke: '#ffffff' }
          });
        }
      } else {
        // No repairs needed, switch to build mode
        memory.buildMode = 1;
        creep.say('🏗️ Build');
      }
    }
  }
  
  /**
   * Save state to memory
   */
  public static saveState(creep: Creep, memory: CreepMemory): void {
    creep.memory = memory;
  }
}