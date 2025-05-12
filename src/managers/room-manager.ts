/**
 * Room Manager
 * Handles room operations, building, and defense
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import { Helpers } from '../utils/helpers';
import { MemoryManager } from './memory-manager';
import { CreepManager, CreepRole } from './creep-manager';
import * as _ from 'lodash';
import { CONFIG } from '../config/constants';

export enum RoomStage {
  Initial = 0,
  Basic = 1,
  Intermediate = 2,
  Advanced = 3
}

interface RoomData {
  ownedRoom: boolean;
  reservedRoom: boolean;
  lastSeen: number;
  rcl?: number;
  sources?: { id: Id<Source>, pos: RoomPosition }[];
  minerals?: { id: Id<Mineral>, pos: RoomPosition, mineralType: MineralConstant }[];
}

export class RoomManager {
  // Track all rooms we own or have visibility of
  private static roomCache: Record<string, RoomData> = {};

  /**
   * Initialize room manager
   */
  public static init(): void {
    // Initialize roomCache from Memory if needed
    if (!Memory.roomData) {
      Memory.roomData = {};
    }

    // Load room data from memory
    for (const roomName in Memory.roomData) {
      this.roomCache[roomName] = Memory.roomData[roomName];
    }
  }

  /**
   * Run room operations for all owned rooms
   */
  @Profiler.wrap('RoomManager.runRooms')
  public static runRooms(): void {
    // Update our room cache
    this.updateRoomCache();

    // Process owned rooms
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];

      // Skip rooms we don't own
      if (!room.controller || !room.controller.my) {
        // For rooms we have visibility but don't own, do minimal processing
        this.runNonOwnedRoom(room);
        continue;
      }

      try {
        // Run room controller logic
        this.runRoomLogic(room);

        // Run tower logic
        this.runTowers(room);

        // Request creeps if needed
        this.requestCreeps(room);

        // Run inter-room resource balancing every 20 ticks
        if (Game.time % 20 === 0) {
          this.balanceRoomResources(room);
        }

        // Run construction planning every 50 ticks
        if (Game.time % 50 === 0) {
          this.planRoomConstruction(room);
        }
      } catch (e) {
        Logger.error(`Error running room ${roomName}: ${(e as Error).message}`);
      }
    }
    
    // Save room cache to memory
    this.saveRoomCache();
  }

  /**
   * Update our knowledge of all rooms
   */
  private static updateRoomCache(): void {
    // Update rooms we can currently see
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      const username = Object.keys(Game.spawns).length > 0 ?
        Game.spawns[Object.keys(Game.spawns)[0]].owner.username :
        undefined;

      if (!this.roomCache[roomName]) {
        this.roomCache[roomName] = {
          ownedRoom: false,
          reservedRoom: false,
          lastSeen: Game.time
        };
      }
      
      // Always update lastSeen
      this.roomCache[roomName].lastSeen = Game.time;
      
      // Update owned status
      if (room.controller) {
        this.roomCache[roomName].ownedRoom = room.controller.my;
        this.roomCache[roomName].rcl = room.controller.level;
        
        // Check if we have reserved this room
        if (!room.controller.my && room.controller.reservation && 
            username && room.controller.reservation.username === username) {
          this.roomCache[roomName].reservedRoom = true;
        } else {
          this.roomCache[roomName].reservedRoom = false;
        }
      }
      
      // Update sources
      if (!this.roomCache[roomName].sources) {
        const sources = room.find(FIND_SOURCES);
        this.roomCache[roomName].sources = sources.map(source => ({
          id: source.id,
          pos: source.pos
        }));
      }
      
      // Update minerals
      if (!this.roomCache[roomName].minerals) {
        const minerals = room.find(FIND_MINERALS);
        this.roomCache[roomName].minerals = minerals.map(mineral => ({
          id: mineral.id,
          pos: mineral.pos,
          mineralType: mineral.mineralType
        }));
      }
    }

    // Clean up stale entries after 10000 ticks
    if (Game.time % 1000 === 0) {
      for (const roomName in this.roomCache) {
        if (Game.time - this.roomCache[roomName].lastSeen > 10000) {
          delete this.roomCache[roomName];
        }
      }
    }
  }

  /**
   * Run non-owned room logic (scouting, resource harvesting in neutral rooms, etc.)
   */
  private static runNonOwnedRoom(room: Room): void {
    // Skip if the room has no controller or we can't see it
    if (!room.controller) return;

    // Check if it's a reserved room
    const username = Object.keys(Game.spawns).length > 0 ?
      Game.spawns[Object.keys(Game.spawns)[0]].owner.username :
      undefined;

    if (username && room.controller.reservation &&
        room.controller.reservation.username === username) {
      // This is a room we've reserved
      this.runReservedRoom(room);
    } else {
      // This is a room we're just scouting or potentially targeting
      this.runScoutedRoom(room);
    }
  }

  /**
   * Run reserved room logic
   */
  private static runReservedRoom(room: Room): void {
    // Store room data
    const roomData = this.roomCache[room.name];
    roomData.reservedRoom = true;
    
    // Find and record hostile presence
    try {
      const hostiles = room.find(FIND_HOSTILE_CREEPS);
      if (hostiles.length > 0) {
        // Update room memory with hostile presence
        if (!Memory.roomData[room.name]) Memory.roomData[room.name] = {} as any;
        Memory.roomData[room.name].hostileTime = Game.time;
        Memory.roomData[room.name].hostileCount = hostiles.length;
        
        // Send alert if we have creeps in this room
        const myCreeps = room.find(FIND_MY_CREEPS);
        if (myCreeps.length > 0) {
          Logger.warn(`Hostiles detected in reserved room ${room.name}: ${hostiles.length} enemies vs ${myCreeps.length} friendlies`);
        }
      }
    } catch (e) {
      Logger.error(`Error checking hostiles in reserved room ${room.name}: ${e}`);
    }
    
    // Check container status for remote harvesting
    try {
      const sources = room.find(FIND_SOURCES);
      for (const source of sources) {
        // Find containers near this source
        const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
          filter: { structureType: STRUCTURE_CONTAINER }
        });
        
        // If no container exists, check for construction sites
        if (containers.length === 0) {
          const sites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
            filter: { structureType: STRUCTURE_CONTAINER }
          });
          
          // If no construction site exists, we should create one
          if (sites.length === 0 && Game.time % 500 === 0) {
            // Get best position for container
            const path = room.findPath(room.controller.pos, source.pos, { ignoreCreeps: true });
            if (path.length > 2) {
              const containerPos = new RoomPosition(path[path.length - 2].x, path[path.length - 2].y, room.name);
              room.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
              Logger.info(`Created container construction site in ${room.name} for remote harvesting`);
            }
          }
        }
      }
    } catch (e) {
      Logger.error(`Error checking containers in reserved room ${room.name}: ${e}`);
    }
  }

  /**
   * Run scouted room logic
   */
  private static runScoutedRoom(room: Room): void {
    // Store room data
    this.roomCache[room.name].lastSeen = Game.time;
    
    // If this is a potential expansion target (in our expansion list), analyze it more closely
    if (Memory.colony && Memory.colony.expansionTargets && Memory.colony.expansionTargets.includes(room.name)) {
      try {
        // Analyze room for expansion suitability
        const sources = room.find(FIND_SOURCES);
        const minerals = room.find(FIND_MINERALS);
        const terrain = new Room.Terrain(room.name);
        
        // Score the room based on various factors
        let score = 0;
        
        // Source count (2 sources = good)
        score += sources.length * 10;
        
        // Mineral types (some are more valuable)
        for (const mineral of minerals) {
          switch (mineral.mineralType) {
            case RESOURCE_HYDROGEN:
            case RESOURCE_OXYGEN:
            case RESOURCE_UTRIUM:
            case RESOURCE_LEMERGIUM:
            case RESOURCE_KEANIUM:
            case RESOURCE_ZYNTHIUM:
            case RESOURCE_CATALYST:
              score += 5;
              break;
            default:
              score += 2;
          }
        }
        
        // Open space analysis (more open terrain = better)
        let openCount = 0;
        let wallCount = 0;
        for (let x = 0; x < 50; x += 10) {
          for (let y = 0; y < 50; y += 10) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
              wallCount++;
            } else {
              openCount++;
            }
          }
        }
        
        // Prefer rooms with more open space
        score += Math.floor(openCount / 5);
        
        // Store the score
        if (!Memory.roomData[room.name]) {
          Memory.roomData[room.name] = {} as any;
        }
        Memory.roomData[room.name].expansionScore = score;
        
        Logger.info(`Scouted expansion target ${room.name}: score ${score}, sources: ${sources.length}, minerals: ${minerals.length}`);
      } catch (e) {
        Logger.error(`Error analyzing scouted room ${room.name}: ${e}`);
      }
    }
  }

  /**
   * Balance resources between rooms when we have multiple
   */
  private static balanceRoomResources(room: Room): void {
    // Skip if we only have one room
    const myRooms = Object.keys(Game.rooms).filter(name => {
      const r = Game.rooms[name];
      return r && r.controller && r.controller.my;
    });

    if (myRooms.length <= 1) return;

    // Only run this for rooms with storage
    if (!room.storage) return;
    
    // Get all containers
    const containers = room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER
    }) as StructureContainer[];
    
    // If storage has plenty of energy, distribute to extensions/spawns/towers
    const storageEnergy = room.storage.store[RESOURCE_ENERGY] || 0;
    
    if (storageEnergy > 5000 && room.energyAvailable < room.energyCapacityAvailable) {
      // We have energy to spare - make sure spawns/extensions are filled
      const targets = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => {
          return (s.structureType === STRUCTURE_EXTENSION ||
                 s.structureType === STRUCTURE_SPAWN) &&
                 s.energy < s.energyCapacity;
        }
      });
      
      // If we found targets that need energy, record this in room memory
      if (targets.length > 0) {
        room.memory.fillTargets = targets.map(t => t.id);
      } else {
        delete room.memory.fillTargets;
      }
    }
    
    // If containers are getting full, move to storage
    for (const container of containers) {
      const containerEnergy = container.store[RESOURCE_ENERGY] || 0;
      
      // If container is more than 75% full, mark for collection
      if (containerEnergy / container.storeCapacity > 0.75) {
        if (!room.memory.collectTargets) {
          room.memory.collectTargets = [];
        }
        
        if (!room.memory.collectTargets.includes(container.id)) {
          room.memory.collectTargets.push(container.id);
        }
      } else if (containerEnergy / container.storeCapacity < 0.25) {
        // Remove from collection targets if it's now relatively empty
        if (room.memory.collectTargets) {
          room.memory.collectTargets = room.memory.collectTargets.filter(id => id !== container.id);
        }
      }
    }
  }

  /**
   * Try to place the next construction site from the build queue
   */
  private static processBuildQueue(room: Room): void {
    if (!room.memory.constructionQueue) return;
    const constructionSites = _.filter(Game.constructionSites, site => site.room && site.room.name === room.name);
    if (constructionSites.length >= 10) return;
    while (room.memory.constructionQueue.length > 0 && constructionSites.length < 10) {
      const next = room.memory.constructionQueue[0];
      const result = room.createConstructionSite(next.x, next.y, next.structureType);
      if (result === OK) {
        Logger.info(`Placed construction site for ${next.structureType} at (${next.x},${next.y}) in ${room.name}`);
        room.memory.constructionQueue.shift();
      } else if (result === ERR_INVALID_TARGET || result === ERR_FULL || result === ERR_INVALID_ARGS) {
        // Remove invalid/blocked positions
        Logger.warn(`Failed to place construction site at (${next.x},${next.y}) in ${room.name}: ${result}`);
        room.memory.constructionQueue.shift();
      } else {
        // Wait and try again next tick
        break;
      }
    }
  }

  /**
   * Find the largest open area for extension placement
   * Returns an array of positions sorted by best cluster
   */
  private static findBestExtensionCluster(room: Room, count: number): {x: number, y: number}[] {
    const terrain = new Room.Terrain(room.name);
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return [];
    const spawn = spawns[0];
    const range = 10;
    const openTiles: {x: number, y: number}[] = [];
    // Scan a square around the spawn
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        const x = spawn.pos.x + dx;
        const y = spawn.pos.y + dy;
        if (x < 2 || x > 47 || y < 2 || y > 47) continue;
        if (terrain.get(x, y) !== 0) continue;
        // Check for existing structures/sites
        const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
        const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
        if (structures.length === 0 && sites.length === 0) {
          openTiles.push({x, y});
        }
      }
    }
    // Cluster open tiles by proximity
    const clusters: {tiles: {x: number, y: number}[], center: {x: number, y: number}}[] = [];
    for (const tile of openTiles) {
      let added = false;
      for (const cluster of clusters) {
        for (const cTile of cluster.tiles) {
          if (Math.abs(cTile.x - tile.x) <= 1 && Math.abs(cTile.y - tile.y) <= 1) {
            cluster.tiles.push(tile);
            added = true;
            break;
          }
        }
        if (added) break;
      }
      if (!added) {
        clusters.push({tiles: [tile], center: tile});
      }
    }
    // Score clusters by size and proximity to spawn
    clusters.sort((a, b) => {
      if (b.tiles.length !== a.tiles.length) return b.tiles.length - a.tiles.length;
      const aDist = Math.abs(a.center.x - spawn.pos.x) + Math.abs(a.center.y - spawn.pos.y);
      const bDist = Math.abs(b.center.x - spawn.pos.x) + Math.abs(b.center.y - spawn.pos.y);
      return aDist - bDist;
    });
    if (clusters.length === 0) return [];
    // Return up to 'count' best positions from the best cluster
    return clusters[0].tiles.slice(0, count);
  }

  /**
   * Plan construction projects for this room using a persistent build queue and scoring
   */
  private static planRoomConstruction(room: Room): void {
    // Ensure build queue exists
    if (!room.memory.constructionQueue) room.memory.constructionQueue = [];
    // Always try to process the build queue first
    this.processBuildQueue(room);
    // If queue is not empty, don't plan new projects
    if (room.memory.constructionQueue.length > 0) return;
    const constructionSites = _.filter(Game.constructionSites, site => site.room && site.room.name === room.name);
    if (constructionSites.length >= 10) return;
    // Plan extensions
    if (room.controller.level >= 2) {
      const extensions = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
      const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
      const needed = maxExtensions - extensions.length;
      if (needed > 0) {
        const best = this.findBestExtensionCluster(room, needed);
        for (const pos of best) {
          room.memory.constructionQueue.push({x: pos.x, y: pos.y, structureType: STRUCTURE_EXTENSION});
        }
        if (best.length > 0) {
          Logger.info(`Planned ${best.length} extensions in ${room.name} (build queue)`);
        }
      }
    }
    // Plan towers
    if (room.controller.level >= 3) {
      const towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
      const towerSites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_TOWER });
      const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level];
      const neededTowers = maxTowers - towers.length - towerSites.length;
      if (neededTowers > 0) {
        // Find best open cluster, but avoid overlap with planned extensions
        const plannedExts = new Set(room.memory.constructionQueue.filter(q => q.structureType === STRUCTURE_EXTENSION).map(q => `${q.x},${q.y}`));
        const best = this.findBestExtensionCluster(room, neededTowers * 2); // Get more candidates
        let planned = 0;
        for (const pos of best) {
          if (planned >= neededTowers) break;
          if (!plannedExts.has(`${pos.x},${pos.y}`)) {
            room.memory.constructionQueue.push({x: pos.x, y: pos.y, structureType: STRUCTURE_TOWER});
            planned++;
          }
        }
        if (planned > 0) {
          Logger.info(`Planned ${planned} towers in ${room.name} (build queue)`);
        }
      }
    }
    // Plan storage
    if (room.controller.level >= 4 && !room.storage) {
      const storageSites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_STORAGE });
      if (storageSites.length === 0) {
        // Place storage in the largest open cluster near spawn
        const best = this.findBestExtensionCluster(room, 1);
        if (best.length > 0) {
          room.memory.constructionQueue.push({x: best[0].x, y: best[0].y, structureType: STRUCTURE_STORAGE});
          Logger.info(`Planned storage at (${best[0].x},${best[0].y}) in ${room.name} (build queue)`);
        }
      }
    }
  }

  /**
   * Run logic for a specific room
   */
  public static runRoomLogic(room: Room): void {
    // --- DEBUG LOGGING ---
    const controller = room.controller;
    const spawns = room.find(FIND_MY_SPAWNS);
    const extensions = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
    const extensionSites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
    Logger.info(`[${room.name}] Controller: level=${controller?.level}, progress=${controller?.progress}/${controller?.progressTotal}, owned=${controller?.my}`);
    Logger.info(`[${room.name}] Spawns: built=${spawns.length}`);
    Logger.info(`[${room.name}] Extensions: built=${extensions.length}, constructionSites=${extensionSites.length}`);

    // --- AUTODESTROY EXTENSIONS IF AT RCL 1 ---
    if (controller && controller.level === 1 && extensions.length > 0) {
      for (const ext of extensions) {
        ext.destroy();
        Logger.warn(`[${room.name}] Destroyed extension at (${ext.pos.x},${ext.pos.y}) because controller is RCL 1.`);
      }
    }

    // Make sure the room has a template
    if (!room.memory.template) {
      room.memory.template = 'default';
    }
    
    // Determine the current stage if not set
    if (room.memory.stage === undefined) {
      room.memory.stage = 0;
    }
    
    // Run appropriate stage logic
    const stage = room.memory.stage as RoomStage;
    
    switch (stage) {
      case RoomStage.Initial:
        this.runStage0(room);
        break;
      case RoomStage.Basic:
        this.runStage1(room);
        break;
      case RoomStage.Intermediate:
        // Stage 2 logic would go here
        break;
      case RoomStage.Advanced:
        // Stage 3 logic would go here
        break;
    }
    
    // Check if we should advance to the next stage
    this.checkStageProgress(room);
  }
  
  /**
   * Run stage 0 logic (initial bootstrap)
   */
  private static runStage0(room: Room): void {
    // In stage 0, we focus on creating initial harvesters and upgraders
    // This matches the original logic from controller.room.default.js
    
    // Check if we can advance to the next stage
    if (room.energyCapacityAvailable >= 550) {
      room.memory.stage = RoomStage.Basic;
      this.runStage1(room);
      return;
    }
  }
  
  /**
   * Run stage 1 logic (basic infrastructure)
   */
  private static runStage1(room: Room): void {
    // In stage 1, we build more infrastructure and larger creeps
  }
  
  /**
   * Check if the room should advance to the next stage
   */
  private static checkStageProgress(room: Room): void {
    const stage = room.memory.stage as RoomStage;
    
    switch (stage) {
      case RoomStage.Initial:
        // Advance to Basic stage when energy capacity reaches 550
        if (room.energyCapacityAvailable >= 550) {
          room.memory.stage = RoomStage.Basic;
          Logger.info(`${room.name} advanced to stage 1 (Basic)`);
        }
        break;
      case RoomStage.Basic:
        // Advance to Intermediate stage when we have a storage
        const storage = room.storage;
        if (storage && storage.my) {
          room.memory.stage = RoomStage.Intermediate;
          Logger.info(`${room.name} advanced to stage 2 (Intermediate)`);
        }
        break;
      // Add more stage advancement logic as needed
    }
  }
  
  /**
   * Request creeps based on room needs (expert, dynamic, config-driven)
   */
  private static requestCreeps(room: Room): void {
    // Get counts from memory (updated by MemoryManager)
    const harvesterCount = room.memory.harvesters || 0;
    const upgraderCount = room.memory.upgraders || 0;
    const builderCount = _.filter(Game.creeps, c =>
      c.memory.role === CreepRole.Builder &&
      c.memory.homeRoom === room.name
    ).length;

    // Get RCL (controller level), fallback to 1 if missing
    const rcl = room.controller ? room.controller.level : 1;
    // Get desired numbers from config, fallback to safe defaults
    const maxHarvesters = CONFIG.ROOM.DESIRED_HARVESTERS[rcl] ?? 1;
    const maxUpgraders = CONFIG.ROOM.DESIRED_UPGRADERS[rcl] ?? 1;
    const maxBuilders = CONFIG.ROOM.DESIRED_BUILDERS[rcl] ?? 0;

    // Emergency: If controller is at risk of downgrading, always spawn at least 1 upgrader
    const controller = room.controller;
    const controllerAtRisk = controller && controller.my && controller.ticksToDowngrade < 2000;
    const needEmergencyUpgrader = controllerAtRisk && upgraderCount === 0;

    // 1. Always prioritize at least 1 harvester if there are none
    if (harvesterCount === 0) {
      const energy = room.energyCapacityAvailable;
      const body = CreepManager.getOptimalBody(CreepRole.Harvester, energy);
      CreepManager.requestCreep({
        role: CreepRole.Harvester,
        body: body,
        priority: 100, // Highest priority
        roomName: room.name,
        memory: {
          role: CreepRole.Harvester
        }
      });
      // Don't spawn anything else until we have a harvester
      return;
    }

    // 2. Emergency upgrader if controller is at risk
    if (needEmergencyUpgrader) {
      const energy = room.energyCapacityAvailable;
      const body = CreepManager.getOptimalBody(CreepRole.Upgrader, energy);
      CreepManager.requestCreep({
        role: CreepRole.Upgrader,
        body: body,
        priority: 99, // Just below emergency harvester
        roomName: room.name,
        memory: {
          role: CreepRole.Upgrader
        }
      });
    }

    // 3. Spawn harvesters up to config max
    if (harvesterCount < maxHarvesters) {
      const energy = room.energyCapacityAvailable;
      const body = CreepManager.getOptimalBody(CreepRole.Harvester, energy);
      CreepManager.requestCreep({
        role: CreepRole.Harvester,
        body: body,
        priority: 90, // High priority
        roomName: room.name,
        memory: {
          role: CreepRole.Harvester
        }
      });
    }

    // 4. Spawn upgraders up to config max (if at least 1 harvester exists)
    //    (or more if emergency)
    if ((upgraderCount < maxUpgraders && harvesterCount > 0) || needEmergencyUpgrader) {
      const energy = room.energyCapacityAvailable;
      const body = CreepManager.getOptimalBody(CreepRole.Upgrader, energy);
      CreepManager.requestCreep({
        role: CreepRole.Upgrader,
        body: body,
        priority: 70, // Medium priority
        roomName: room.name,
        memory: {
          role: CreepRole.Upgrader
        }
      });
    }

    // 5. Spawn builders up to config max (if at least 1 harvester exists)
    //    Only if there is work to do
    if (builderCount < maxBuilders && harvesterCount > 0) {
      const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
      const damagedStructures = room.find(FIND_STRUCTURES, {
        filter: structure => structure.hits < structure.hitsMax * 0.75
      });
      if (constructionSites.length > 0 || damagedStructures.length > 0) {
        const energy = room.energyCapacityAvailable;
        const body = CreepManager.getOptimalBody(CreepRole.Builder, energy);
        CreepManager.requestCreep({
          role: CreepRole.Builder,
          body: body,
          priority: 60, // Medium-low priority
          roomName: room.name,
          memory: {
            role: CreepRole.Builder,
            homeRoom: room.name
          }
        });
      }
    }

    Logger.info(`[${room.name}] RCL: ${rcl}, Harvesters: ${harvesterCount}/${maxHarvesters}, Upgraders: ${upgraderCount}/${maxUpgraders}, Builders: ${builderCount}/${maxBuilders}`);

    const myCreeps = _.filter(Game.creeps, c => c.memory.role === 'harvester' && c.memory.homeRoom === room.name);
    Logger.info(`[${room.name}] Harvester names: ${myCreeps.map(c => c.name).join(', ')}`);
  }
  
  /**
   * Run tower logic for a room
   */
  private static runTowers(room: Room): void {
    // Find all towers
    const towers = room.find<StructureTower>(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_TOWER
    });
    
    // Skip if no towers
    if (towers.length === 0) return;
    
    // Run tower logic for each tower
    for (const tower of towers) {
      if (global.ai.tower && global.ai.tower.routine) {
        global.ai.tower.routine(tower);
      }
    }
  }
  
  /**
   * Save room cache to memory
   */
  private static saveRoomCache(): void {
    // Don't save the entire cache every tick
    if (Game.time % 20 !== 0) return;
    
    // Save room data
    Memory.roomData = {};
    
    for (const roomName in this.roomCache) {
      Memory.roomData[roomName] = this.roomCache[roomName];
    }
  }
  
  /**
   * Get the room cache (for colony manager use)
   */
  public static getRoomCache(): Record<string, RoomData> {
    return this.roomCache;
  }
  
  /**
   * Get data for a specific room
   */
  public static getRoomData(roomName: string): RoomData {
    return this.roomCache[roomName] || {
      ownedRoom: false,
      reservedRoom: false,
      lastSeen: 0
    };
  }
}