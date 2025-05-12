/**
 * Builder AI
 * Handles construction and repair tasks
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import * as _ from 'lodash';

enum BuilderState {
  Harvesting = 'harvesting',
  Building = 'building',
  Repairing = 'repairing',
  Upgrading = 'upgrading'
}

export class BuilderAI {
  /**
   * Main task method for builder creeps
   */
  @Profiler.wrap('BuilderAI.task')
  public static task(creep: Creep): void {
    // Get or initialize creep memory
    const memory = creep.memory;
    
    // Initialize if needed
    if (!memory.initiated) {
      memory.activity = BuilderState.Harvesting;
      
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
      creep.say('🚧 Build!');
    }
    
    // Handle multi-room operation
    if (memory.targetRoom && memory.targetRoom !== creep.room.name) {
      // We're not in the target room, move there
      const exitDir = Game.map.findExit(creep.room, memory.targetRoom);
      if (exitDir !== ERR_NO_PATH) {
        const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
        if (exit) {
          creep.moveTo(exit, {
            visualizePathStyle: { stroke: '#ffaa00' }
          });
          return;
        }
      }
    }
    
    // State machine for builder behavior
    switch (memory.activity as BuilderState) {
      case BuilderState.Harvesting:
        Profiler.start('BuilderAI.harvesting');
        this.doHarvesting(creep);
        Profiler.end('BuilderAI.harvesting');
        break;
      case BuilderState.Building:
        Profiler.start('BuilderAI.building');
        this.doBuilding(creep);
        Profiler.end('BuilderAI.building');
        break;
      case BuilderState.Repairing:
        Profiler.start('BuilderAI.repairing');
        this.doRepairing(creep);
        Profiler.end('BuilderAI.repairing');
        break;
      case BuilderState.Upgrading:
        Profiler.start('BuilderAI.upgrading');
        this.doUpgrading(creep);
        Profiler.end('BuilderAI.upgrading');
        break;
      default:
        // Reset to harvesting
        memory.activity = BuilderState.Harvesting;
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
    
    // Switch to building if full
    if (creep.store.getFreeCapacity() === 0) {
      memory.activity = BuilderState.Building;
      creep.say('🚧 Build');
      return;
    }
    
    // Check for dropped resources or containers first
    const droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY
    });
    
    // If there are dropped resources, pick them up
    if (droppedResources.length > 0) {
      const closestResource = creep.pos.findClosestByRange(droppedResources);
      if (closestResource) {
        if (creep.pickup(closestResource) === ERR_NOT_IN_RANGE) {
          creep.moveTo(closestResource, {
            visualizePathStyle: { stroke: '#ffaa00' },
            reusePath: 10
          });
        }
        return;
      }
    }
    
    // Look for containers with energy
    const containers = creep.room.find(FIND_STRUCTURES, {
      filter: structure => 
        structure.structureType === STRUCTURE_CONTAINER && 
        structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    }) as StructureContainer[];
    
    if (containers.length > 0) {
      const closestContainer = creep.pos.findClosestByRange(containers);
      if (closestContainer) {
        if (creep.withdraw(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(closestContainer, {
            visualizePathStyle: { stroke: '#ffaa00' },
            reusePath: 10
          });
        }
        return;
      }
    }
    
    // Check for storage if we have it
    if (creep.room.storage && creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 1000) {
      if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.storage, {
          visualizePathStyle: { stroke: '#ffaa00' },
          reusePath: 10
        });
      }
      return;
    }
    
    // Fallback to sources
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
        visualizePathStyle: { stroke: '#ffaa00' },
        reusePath: 10
      });
    }
  }
  
  /**
   * Handle building state
   */
  private static doBuilding(creep: Creep): void {
    const memory = creep.memory;
    
    // Switch back to harvesting if empty
    if (creep.store.getUsedCapacity() === 0) {
      memory.activity = BuilderState.Harvesting;
      creep.say('🔄 Harvest');
      return;
    }
    
    // Find construction sites
    const constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    
    if (constructionSites.length > 0) {
      // Sort by progress percentage
      const target = _.sortBy(constructionSites, site => 
        site.progress / site.progressTotal
      )[0];
      
      if (creep.build(target) === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, {
          visualizePathStyle: { stroke: '#ffffff' },
          reusePath: 10
        });
      }
    } else {
      // No construction sites, switch to repairing
      memory.activity = BuilderState.Repairing;
      creep.say('🔧 Repair');
    }
  }
  
  /**
   * Handle repairing state
   */
  private static doRepairing(creep: Creep): void {
    const memory = creep.memory;
    
    // Switch back to harvesting if empty
    if (creep.store.getUsedCapacity() === 0) {
      memory.activity = BuilderState.Harvesting;
      creep.say('🔄 Harvest');
      return;
    }
    
    // Find structures that need repair
    const damagedStructures = creep.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        // Don't repair walls/ramparts above certain level
        if (structure.structureType === STRUCTURE_WALL || 
            structure.structureType === STRUCTURE_RAMPART) {
          return structure.hits < 10000;
        }
        
        // Repair everything else if below 75% health
        return structure.hits < structure.hitsMax * 0.75;
      }
    });
    
    if (damagedStructures.length > 0) {
      // Sort by health percentage, repair most damaged first
      damagedStructures.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
      
      if (creep.repair(damagedStructures[0]) === ERR_NOT_IN_RANGE) {
        creep.moveTo(damagedStructures[0], {
          visualizePathStyle: { stroke: '#ffffff' },
          reusePath: 10
        });
      }
    } else {
      // No repairs needed, help with upgrading
      memory.activity = BuilderState.Upgrading;
      creep.say('⚡ Upgrade');
    }
  }
  
  /**
   * Handle upgrading state
   */
  private static doUpgrading(creep: Creep): void {
    const memory = creep.memory;
    
    // Switch back to harvesting if empty
    if (creep.store.getUsedCapacity() === 0) {
      memory.activity = BuilderState.Harvesting;
      creep.say('🔄 Harvest');
      return;
    }
    
    // Check for construction sites first
    const constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (constructionSites.length > 0) {
      // Switch back to building
      memory.activity = BuilderState.Building;
      creep.say('🚧 Build');
      return;
    }
    
    // Upgrade controller if no construction sites
    if (creep.room.controller) {
      if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.controller, {
          visualizePathStyle: { stroke: '#ffffff' },
          reusePath: 10
        });
      }
    } else {
      // No controller? Strange, but switch to harvesting
      memory.activity = BuilderState.Harvesting;
      creep.say('🔄 Harvest');
    }
  }
  
  /**
   * Save state to memory
   */
  public static saveState(creep: Creep, memory: CreepMemory): void {
    creep.memory = memory;
  }
}