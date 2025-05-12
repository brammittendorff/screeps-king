/**
 * Harvester AI
 * Handles harvesting and energy delivery
 */

import { Logger } from '../utils/logger';
import * as _ from 'lodash';
import { RoomCache } from '../utils/room-cache';

declare global {
  interface Room {
    _sources?: Source[];
    _structures?: AnyStructure[];
    _sourcesTick?: number;
  }
}

enum HarvesterState {
  Harvesting = 'harvesting',
  Unloading = 'unloading',
  Building = 'building'
}

export class HarvesterAI {
  /**
   * Main task method for harvester creeps
   */
  public static task(creep: Creep): void {
    // Batch actions: only run every 3 ticks, staggered by creep name
    if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) return;
    // Get or initialize creep memory
    const memory = creep.memory;
    // Use RoomCache for sources and structures
    const sources = RoomCache.get(creep.room, FIND_SOURCES);
    const structures = RoomCache.get(creep.room, FIND_MY_STRUCTURES);
    // Always define mineral for all states
    const minerals = RoomCache.get(creep.room, FIND_MINERALS);
    const mineral = minerals[0];
    
    // Initialize if needed
    if (!memory.initiated) {
      memory.activity = HarvesterState.Harvesting;

      // Safely get target source ID
      try {
        if (global.go && global.go.resource && global.go.resource.selectClosestTo) {
          memory.targetSourceId = global.go.resource.selectClosestTo(creep);
        } else {
          // Fallback - find source directly
          const localSources = RoomCache.get(creep.room, FIND_SOURCES);
          if (localSources.length > 0) {
            const source = creep.pos.findClosestByRange(localSources);
            memory.targetSourceId = source ? source.id : null;
          }
        }
      } catch (e) {
        console.log(`Error finding source for ${creep.name}: ${e}`);
        // Find any source as a fallback
        const localSources = RoomCache.get(creep.room, FIND_SOURCES);
        if (localSources.length > 0) {
          memory.targetSourceId = localSources[0].id;
        }
      }

      memory.initiated = true;
      creep.say('🌾 Work!');
    }
    
    // State machine for harvester behavior
    switch (memory.activity as HarvesterState) {
      case HarvesterState.Harvesting:
        this.doHarvesting(creep);
        break;
      case HarvesterState.Unloading:
        this.doUnloading(creep);
        break;
      case HarvesterState.Building:
        this.doBuilding(creep);
        break;
      default:
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
    let targetSource = Game.getObjectById(memory.targetSourceId as Id<Source>);
    const localSources = RoomCache.get(creep.room, FIND_SOURCES);
    if (!targetSource && localSources.length > 0) {
      targetSource = creep.pos.findClosestByRange(localSources);
      memory.targetSourceId = targetSource ? targetSource.id : null;
    }
    
    // Check if source exists
    if (!targetSource) {
      Logger.debug(`${creep.name}: Invalid source, getting new source`);
      const fallbackSources = RoomCache.get(creep.room, FIND_SOURCES);
      if (fallbackSources.length > 0) {
        const source = creep.pos.findClosestByRange(fallbackSources);
        memory.targetSourceId = source ? source.id : null;
      }
      // If still no valid source, move randomly
      if (!memory.targetSourceId) {
        creep.say('⚠️ No src!');
        creep.moveTo(25, 25, { reusePath: 20 });
        return;
      }
      
      return;
    }
    
    // Harvest the source
    const result = creep.harvest(targetSource);
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(targetSource, {
        reusePath: 20
      });
    }
  }
  
  /**
   * Handle unloading state
   */
  private static doUnloading(creep: Creep): void {
    const memory = creep.memory;
    // If carrying energy, deliver to highest priority target
    if (creep.store[RESOURCE_ENERGY] > 0) {
      // 1. Spawns first, then extensions
      let spawns = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_SPAWN && (s as any).energy < (s as any).energyCapacity);
      if (spawns.length > 0) {
        if (creep.transfer(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(spawns[0], { reusePath: 10 });
        }
        return;
      }
      let extensions = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_EXTENSION && (s as any).energy < (s as any).energyCapacity);
      if (extensions.length > 0) {
        if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(extensions[0], { reusePath: 10 });
        }
        return;
      }
      // 2. Controller container (if exists)
      const controllerContainer = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_CONTAINER && creep.room.controller && s.pos.getRangeTo(creep.room.controller) <= 3 && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
      if (controllerContainer.length > 0) {
        if (creep.transfer(controllerContainer[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(controllerContainer[0], { reusePath: 10 });
        }
        return;
      }
      // 3. Storage (if exists and not full)
      if (creep.room.storage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(creep.room.storage, { reusePath: 10 });
        }
        return;
      }
      // 4. Towers (if not full)
      const towers = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_TOWER && (s as StructureTower).energy < (s as StructureTower).energyCapacity);
      if (towers.length > 0) {
        if (creep.transfer(towers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.moveTo(towers[0], { reusePath: 10 });
        }
        return;
      }
    }
    // Switch back to harvesting if empty
    if (creep.store.getUsedCapacity() === 0) {
      memory.activity = HarvesterState.Harvesting;
      creep.say('🔄 Harvest');
      return;
    }
    // If nothing to do, fallback to building/repairing/upgrading
    memory.activity = HarvesterState.Building;
    memory.buildMode = undefined;
    creep.say('🚧 Build');
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
      const targets = RoomCache.get(creep.room, FIND_MY_CONSTRUCTION_SITES);
      
      if (targets.length > 0) {
        if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: 10
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
      const targets = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter((s) => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL);
      
      if (targets.length > 0) {
        // Sort by damage percentage
        targets.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
        
        if (creep.repair(targets[0]) === ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: 10
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