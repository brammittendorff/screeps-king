/**
 * Builder AI
 * Handles construction and repair tasks
 * Now task-driven: will use TaskManager for all build/repair tasks, falling back to legacy state machine if no task is available.
 */

import { Logger } from '../utils/logger';
import * as _ from 'lodash';
import { getDynamicReusePath } from '../utils/helpers';
import { TaskManager } from '../managers/task-manager';
import { CreepActionGuard } from '../utils/helpers';

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
  public static task(creep: Creep): void {
    // --- Action pipeline guard: only one pipeline action per tick (Screeps rule) ---
    CreepActionGuard.reset(creep);
    // --- TaskManager integration ---
    const task = TaskManager.findTaskForCreep(creep);
    if (task) {
      TaskManager.executeTask(creep, task);
      return;
    } else {
      TaskManager.markIdle();
    }
    // --- Fallback to legacy state machine if no task found ---
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
            visualizePathStyle: { stroke: '#ffaa00' },
            reusePath: getDynamicReusePath(creep, exit)
          });
          return;
        }
      }
    }
    
    // State machine for builder behavior
    switch (memory.activity as BuilderState) {
      case BuilderState.Harvesting:
        this.doHarvesting(creep);
        break;
      case BuilderState.Building:
        this.doBuildingWithPriority(creep);
        break;
      case BuilderState.Repairing:
        this.doRepairing(creep);
        break;
      case BuilderState.Upgrading:
        this.doUpgrading(creep);
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
            reusePath: getDynamicReusePath(creep, closestResource)
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
            reusePath: getDynamicReusePath(creep, closestContainer)
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
          reusePath: getDynamicReusePath(creep, creep.room.storage)
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
        creep.moveTo(25, 25, { reusePath: getDynamicReusePath(creep, new RoomPosition(25, 25, creep.room.name)) });
        return;
      }
      
      return;
    }
    
    // Only one pipeline action per tick (Screeps rule)
    if (CreepActionGuard.allow(creep, 'harvest')) {
      // Harvest the source
      const result = creep.harvest(targetSource);
      
      if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(targetSource, {
          visualizePathStyle: { stroke: '#ffaa00' },
          reusePath: getDynamicReusePath(creep, targetSource)
        });
      }
    }
  }
  
  /**
   * Build with advanced priority: considers structure type, roads on swamp, heatmap, proximity, and progress
   */
  private static doBuildingWithPriority(creep: Creep): void {
    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (sites.length === 0) {
      // No sites, switch to upgrading
      creep.memory.activity = BuilderState.Upgrading;
      creep.say('⚡ Upgrade');
      return;
    }
    // Sort sites by advanced priority
    sites.sort((a, b) => this.getSitePriority(a, creep) - this.getSitePriority(b, creep));
    const target = sites[0];
    if (CreepActionGuard.allow(creep, 'build')) {
      if (creep.build(target) === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 10 });
      }
    }
  }
  
  /**
   * Assign a numeric priority to a construction site. Lower is better.
   * Considers structure type, roads on swamp, road heatmap, proximity, ramparts/walls under threat, resource accessibility, progress, site age, RCL, energy, and expansion context.
   */
  private static getSitePriority(site: ConstructionSite, creep: Creep): number {
    // 1. Structure type base priority
    const typePriority: Partial<Record<StructureConstant, number>> = {
      [STRUCTURE_SPAWN]: 1,
      [STRUCTURE_EXTENSION]: 2,
      [STRUCTURE_TOWER]: 3,
      [STRUCTURE_STORAGE]: 4,
      [STRUCTURE_LINK]: 5,
      [STRUCTURE_TERMINAL]: 6,
      [STRUCTURE_LAB]: 7,
      [STRUCTURE_FACTORY]: 8,
      [STRUCTURE_CONTAINER]: 9,
      [STRUCTURE_RAMPART]: 10,
      [STRUCTURE_WALL]: 11,
      [STRUCTURE_ROAD]: 20
    };
    let priority = typePriority[site.structureType] ?? 50;

    // 2. Roads on swamp get a boost
    if (site.structureType === STRUCTURE_ROAD) {
      const terrain = creep.room.getTerrain().get(site.pos.x, site.pos.y);
      if (terrain === TERRAIN_MASK_SWAMP) priority -= 5;
      // 3. Road heatmap: higher heat = higher priority
      const heat = (creep.room.memory.roadHeatmap?.[site.pos.x]?.[site.pos.y]) || 0;
      priority -= Math.min(heat, 10);
      // 4. Critical pathway: (not implemented, but could be added)
    }

    // 5. Ramparts/walls under threat
    if ((site.structureType === STRUCTURE_RAMPART || site.structureType === STRUCTURE_WALL)) {
      // If near hostile or low hits, boost
      const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
      if (hostiles.some(h => h.pos.getRangeTo(site.pos) <= 3)) priority -= 10;
      // If adjacent to spawn/storage/tower, boost
      const important = [
        ...creep.room.find(FIND_MY_SPAWNS),
        ...(creep.room.storage ? [creep.room.storage] : []),
        ...creep.room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER })
      ];
      if (important.some(s => s.pos.getRangeTo(site.pos) <= 1)) priority -= 5;
    }

    // 6. Proximity to spawn/storage/controller for critical structures
    const proximityTypes: StructureConstant[] = [
      STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_LINK
    ];
    if (proximityTypes.includes(site.structureType as StructureConstant)) {
      let minDist = 50;
      const spawns = creep.room.find(FIND_MY_SPAWNS);
      if (spawns.length > 0) minDist = Math.min(minDist, ...spawns.map(s => s.pos.getRangeTo(site.pos)));
      if (creep.room.storage) minDist = Math.min(minDist, creep.room.storage.pos.getRangeTo(site.pos));
      if (creep.room.controller) minDist = Math.min(minDist, creep.room.controller.pos.getRangeTo(site.pos));
      priority += Math.floor(minDist / 5);
    }

    // 7. Resource accessibility: containers near sources/controller
    if (site.structureType === STRUCTURE_CONTAINER) {
      const sources = creep.room.find(FIND_SOURCES);
      if (sources.some(s => s.pos.getRangeTo(site.pos) <= 2)) priority -= 3;
      if (creep.room.controller && creep.room.controller.pos.getRangeTo(site.pos) <= 2) priority -= 2;
    }

    // 8. Progress: sites closer to completion get a small boost
    if (site.progressTotal > 0) {
      const progressRatio = site.progress / site.progressTotal;
      priority -= Math.floor(progressRatio * 3);
    }

    // 9. Construction site age (older = higher priority)
    if ((site as any).creationTime) {
      const age = Game.time - (site as any).creationTime;
      priority -= Math.min(Math.floor(age / 100), 5);
    }

    // 10. Room RCL requirements (deprioritize if not allowed yet)
    if (creep.room.controller && site.structureType in CONTROLLER_STRUCTURES) {
      const allowed = CONTROLLER_STRUCTURES[site.structureType as StructureConstant][creep.room.controller.level] || 0;
      const existing = creep.room.find(FIND_STRUCTURES, { filter: s => s.structureType === site.structureType }).length;
      if (existing >= allowed) priority += 20;
    }

    // 11. Energy availability (if low, deprioritize non-critical)
    const criticalTypes: StructureConstant[] = [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER];
    if (creep.room.energyAvailable < 300 && !criticalTypes.includes(site.structureType as StructureConstant)) {
      priority += 10;
    }

    // 12. Expansion/remote room: prioritize infrastructure
    if (creep.room.controller && !creep.room.controller.my) {
      const infraTypes: StructureConstant[] = [STRUCTURE_CONTAINER, STRUCTURE_ROAD];
      if (infraTypes.includes(site.structureType as StructureConstant)) priority -= 5;
    }

    return priority;
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
      
      if (CreepActionGuard.allow(creep, 'repair')) {
        if (creep.repair(damagedStructures[0]) === ERR_NOT_IN_RANGE) {
          creep.moveTo(damagedStructures[0], {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: getDynamicReusePath(creep, damagedStructures[0])
          });
        }
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
      if (CreepActionGuard.allow(creep, 'upgrade')) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
          creep.moveTo(creep.room.controller, {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: getDynamicReusePath(creep, creep.room.controller)
          });
        }
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