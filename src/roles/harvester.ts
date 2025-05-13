/**
 * Harvester AI
 * Handles harvesting and energy delivery
 */

import { Logger } from '../utils/logger';
import * as _ from 'lodash';
import { RoomCache } from '../utils/room-cache';
import { CreepActionGuard, getDynamicReusePath } from '../utils/helpers';

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
    // --- Action pipeline guard: only one pipeline action per tick (Screeps rule) ---
    CreepActionGuard.reset(creep);
    // Get or initialize creep memory
    const memory = creep.memory;
    const mapping = creep.room.memory.mapping;
    // --- Improved source assignment using mapping ---
    if (!memory.initiated) {
      if (mapping && mapping.sources && mapping.sources.length > 0) {
        // Assign source by creep name hash (round-robin)
        const idx = Math.abs(hashCode(creep.name)) % mapping.sources.length;
        memory.targetSourceId = mapping.sources[idx].id;
      } else {
        // Fallback to old logic
        if (global.go && global.go.resource && global.go.resource.selectClosestTo) {
          memory.targetSourceId = global.go.resource.selectClosestTo(creep);
        } else {
          const localSources = RoomCache.get(creep.room, FIND_SOURCES);
          if (localSources.length > 0) {
            const source = creep.pos.findClosestByRange(localSources);
            memory.targetSourceId = source ? source.id : null;
          }
        }
      }
      memory.activity = HarvesterState.Harvesting;
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
    // Only one pipeline action per tick (Screeps rule)
    if (CreepActionGuard.allow(creep, 'harvest')) {
      const result = creep.harvest(targetSource);
      if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(targetSource, {
          reusePath: getDynamicReusePath(creep, targetSource)
        });
      }
    }
  }
  
  /**
   * Handle unloading state
   */
  private static doUnloading(creep: Creep): void {
    const memory = creep.memory;
    if (creep.store[RESOURCE_ENERGY] > 0) {
      const mapping = creep.room.memory.mapping;
      // 1. Try to deliver to container at source if present
      if (mapping && mapping.sources && memory.targetSourceId) {
        const sourceInfo = mapping.sources.find(s => s.id === memory.targetSourceId);
        if (sourceInfo) {
          // Find container at source position
          const containers = creep.room.lookForAt(LOOK_STRUCTURES, sourceInfo.x, sourceInfo.y)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && (s as StructureContainer).store.getFreeCapacity(RESOURCE_ENERGY) > 0);
          if (containers.length > 0) {
            if (CreepActionGuard.allow(creep, 'transfer')) {
              if (creep.transfer(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(containers[0], { reusePath: getDynamicReusePath(creep, containers[0]) });
              }
            }
            return;
          }
        }
      }
      // 2. Fallback to spawn/extensions/storage (old logic)
      // 1. Spawns first, then extensions
      const spawns = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter(
        (s) => s.structureType === STRUCTURE_SPAWN && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      );
      if (spawns.length > 0) {
        if (CreepActionGuard.allow(creep, 'transfer')) {
          if (creep.transfer(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(spawns[0], { reusePath: getDynamicReusePath(creep, spawns[0]) });
          }
        }
        return;
      } else {
        // No available spawns, log why
        const allSpawns = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_SPAWN);
        if (allSpawns.length === 0) {
          Logger.info(`${creep.name}: No spawns in room ${creep.room.name} to deliver energy to.`, 'Harvester');
        } else if (allSpawns.every(s => s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) === 0)) {
          Logger.info(`${creep.name}: All spawns in room ${creep.room.name} are full.`, 'Harvester');
        } else {
          Logger.info(`${creep.name}: Could not deliver to spawn for unknown reason.`, 'Harvester');
        }
      }
      const extensions = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter(
        (s) => s.structureType === STRUCTURE_EXTENSION && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      );
      if (extensions.length > 0) {
        if (CreepActionGuard.allow(creep, 'transfer')) {
          if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(extensions[0], { reusePath: getDynamicReusePath(creep, extensions[0]) });
          }
        }
        return;
      }
      // 3. Storage (if exists and not full)
      if (creep.room.storage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (CreepActionGuard.allow(creep, 'transfer')) {
          if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(creep.room.storage, { reusePath: getDynamicReusePath(creep, creep.room.storage) });
          }
        }
        return;
      }
      // 4. Towers (if not full)
      const towers = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_TOWER && (s as StructureTower).energy < (s as StructureTower).energyCapacity);
      if (towers.length > 0) {
        if (CreepActionGuard.allow(creep, 'transfer')) {
          if (creep.transfer(towers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(towers[0], { reusePath: getDynamicReusePath(creep, towers[0]) });
          }
        }
        return;
      }
      // 3. If no valid target, drop energy
      if (CreepActionGuard.allow(creep, 'drop')) {
        creep.drop(RESOURCE_ENERGY);
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
    // Only one pipeline action per tick (Screeps rule)
    if (CreepActionGuard.allow(creep, 'build')) {
      // Find construction sites
      const targets = RoomCache.get(creep.room, FIND_MY_CONSTRUCTION_SITES);
      
      if (targets.length > 0) {
        if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
          creep.moveTo(targets[0], {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: getDynamicReusePath(creep, targets[0])
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
            reusePath: getDynamicReusePath(creep, targets[0])
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

// Helper for round-robin assignment
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}