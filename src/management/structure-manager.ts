/**
 * Structure Manager
 * Handles structure operations, maintenance, and monitoring
 */

import { Logger } from '../utils/logger';
import { Helpers } from '../utils/helpers';

declare global {
  interface RoomMemory {
    containerFlags?: { [id: string]: 'pickup' | 'refill' | undefined };
  }
}

export class StructureManager {
  // Track last action for each tower (analytics)
  private static towerActions: WeakMap<StructureTower, string> = new WeakMap();

  /**
   * Run the structure manager for the current tick
   */
  public static run(): void {
    this.runStructures();
    
    // Every 100 ticks, clean up memory for removed structures
    if (Game.time % 100 === 0) {
      this.cleanup();
    }
  }

  /**
   * Run structure operations for all structures
   */
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
          // Logger.error(`Error in structure routine for ${structure.id}: ${(e as Error).message}`);
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
        // Logger.error(`Error running spawn ${name}: ${(e as Error).message}`);
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
          // Always use modular AI if available
          if (global.ai.tower && typeof global.ai.tower.task === 'function') {
            // Provide a callback to record the action
            global.ai.tower.task(tower, (action: string) => {
              StructureManager.towerActions.set(tower, action);
            });
            // Add analytics/logging for tower actions
            const lastAction = StructureManager.towerActions.get(tower);
            if (lastAction) {
              // Logger.info(`[Tower][${tower.room.name}] Tower ${tower.id} action: ${lastAction}`);
            }
          } else {
            // Log if no AI is available
            // Logger.warn(`No modular AI for tower ${tower.id}`);
          }
        } catch (e) {
          // Logger.error(`Error running tower ${id}: ${(e as Error).message}`);
        }
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
   * Run containers logic (advanced)
   */
  private static runContainers(): void {
    // Track containers by role and fill status
    if (!Memory.containers) Memory.containers = {};
    for (const id in Game.structures) {
      const structure = Game.structures[id];
      if (structure.structureType === STRUCTURE_CONTAINER) {
        const container = structure as StructureContainer;
        // Detect role: harvest (near source), upgrade (near controller), buffer (near storage), or other
        let role = 'other';
        if (container.pos.findInRange(FIND_SOURCES, 1).length > 0) role = 'harvest';
        else if (container.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType === STRUCTURE_CONTROLLER }).length > 0) role = 'upgrade';
        else if (container.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType === STRUCTURE_STORAGE }).length > 0) role = 'buffer';
        // Store in memory
        Memory.containers[id] = {
          id,
          room: container.room.name,
          role,
          lastTick: Game.time,
          fill: 'store' in container ? container.store[RESOURCE_ENERGY] || 0 : 0,
          capacity: 'store' in container ? container.store.getCapacity(RESOURCE_ENERGY) : 0
        };
        // Flag for pickup/refill
        if (!container.room.memory.containerFlags) container.room.memory.containerFlags = {};
        if (role === 'harvest' && 'store' in container && container.store.getFreeCapacity(RESOURCE_ENERGY) < 100) {
          container.room.memory.containerFlags[id] = 'pickup';
        } else if (role === 'upgrade' && 'store' in container && container.store[RESOURCE_ENERGY] < 200) {
          container.room.memory.containerFlags[id] = 'refill';
        } else {
          container.room.memory.containerFlags[id] = undefined;
        }
      }
    }
  }
  
  /**
   * Run links logic (advanced)
   */
  private static runLinks(): void {
    if (!Memory.links) Memory.links = {};
    // First, classify links by role
    const links: StructureLink[] = [];
    for (const id in Game.structures) {
      const structure = Game.structures[id];
      if (structure.structureType === STRUCTURE_LINK) {
        const link = structure as StructureLink;
        links.push(link);
        // Detect role: source (near source), storage (near storage), controller (near controller), relay (other)
        let role = 'relay';
        if (link.pos.findInRange(FIND_SOURCES, 2).length > 0) role = 'source';
        else if (link.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType === STRUCTURE_STORAGE }).length > 0) role = 'storage';
        else if (link.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType === STRUCTURE_CONTROLLER }).length > 0) role = 'controller';
        Memory.links[id] = {
          id,
          room: link.room.name,
          role,
          lastTick: Game.time,
          energy: 'store' in link ? link.store[RESOURCE_ENERGY] || 0 : 0,
          cooldown: link.cooldown
        };
      }
    }
    // Now, transfer logic: source → storage/controller/relay, relay → storage/controller
    const sources = links.filter(l => Memory.links[l.id].role === 'source');
    const storages = links.filter(l => Memory.links[l.id].role === 'storage');
    const controllers = links.filter(l => Memory.links[l.id].role === 'controller');
    const relays = links.filter(l => Memory.links[l.id].role === 'relay');
    for (const source of sources) {
      if (source.cooldown === 0 && 'store' in source && source.store[RESOURCE_ENERGY] > 0) {
        // Prefer storage, then controller, then relay
        let target: StructureLink | undefined = storages.find(l => l.room.name === source.room.name && l.id !== source.id && l.cooldown === 0);
        if (!target) target = controllers.find(l => l.room.name === source.room.name && l.id !== source.id && l.cooldown === 0);
        if (!target) target = relays.find(l => l.room.name === source.room.name && l.id !== source.id && l.cooldown === 0);
        if (target) {
          source.transferEnergy(target);
          Memory.links[source.id].lastTransfer = Game.time;
          Memory.links[target.id].lastReceive = Game.time;
        }
      }
    }
    // Relay links: transfer to storage/controller if full
    for (const relay of relays) {
      if (relay.cooldown === 0 && 'store' in relay && relay.store[RESOURCE_ENERGY] > 0) {
        let target: StructureLink | undefined = storages.find(l => l.room.name === relay.room.name && l.id !== relay.id && l.cooldown === 0);
        if (!target) target = controllers.find(l => l.room.name === relay.room.name && l.id !== relay.id && l.cooldown === 0);
        if (target) {
          relay.transferEnergy(target);
          Memory.links[relay.id].lastTransfer = Game.time;
          Memory.links[target.id].lastReceive = Game.time;
        }
      }
    }
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

  /**
   * Clean up containers and links memory for non-existing structures
   */
  public static cleanup(): void {
    // Clean up containers
    if (Memory.containers) {
      for (const id in Memory.containers) {
        if (!Game.getObjectById(id as Id<StructureContainer>)) {
          delete Memory.containers[id];
        }
      }
    }
    // Clean up links
    if (Memory.links) {
      for (const id in Memory.links) {
        if (!Game.getObjectById(id as Id<StructureLink>)) {
          delete Memory.links[id];
        }
      }
    }
  }
}