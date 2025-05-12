/**
 * Room Manager
 * Handles room operations, building, and defense
 */

import { Logger } from '../utils/logger';
import { Helpers } from '../utils/helpers';
import { MemoryManager } from './memory-manager';
import { CreepManager, CreepRole } from './creep-manager';
import * as _ from 'lodash';
import { CONFIG, EXPANSION_CONFIG } from '../config/constants';
import { MarketTrends } from '../utils/market-trends';
import { TaskManager, TaskType } from './task-manager';
import { RoomCache } from '../utils/room-cache';

declare global {
  interface RoomMemory {
    lastEmergencyNotify?: number;
    nukeEmergency?: boolean;
    nukeInfo?: { x: number; y: number; timeToLand: number }[];
    hostileStats?: { avg: number; count: number };
    damageStats?: { dealt: number; received: number; count: number };
  }
}

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
  hostileTime?: number;
  hostileCount?: number;
  hostileStructures?: number;
  expansionScore?: number;
  owner?: string;
}

interface RoomMemory {
  // ... existing code ...
  lastEmergencyNotify?: number;
}

export class RoomManager {
  // Track all rooms we own or have visibility of
  private static roomCache: Record<string, RoomData> = {};

  private static readonly MINERAL_SCORES: Record<MineralConstant, number> = {
    [RESOURCE_CATALYST]: 30,   // X - most valuable
    [RESOURCE_ZYNTHIUM]: 20,   // Z
    [RESOURCE_KEANIUM]: 20,    // K
    [RESOURCE_UTRIUM]: 15,     // U
    [RESOURCE_LEMERGIUM]: 15,  // L
    [RESOURCE_HYDROGEN]: 5,    // H - common
    [RESOURCE_OXYGEN]: 5       // O - common
  };

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
  public static runRooms(): void {
    // Update our room cache
    this.updateRoomCache();

    // Process owned rooms
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller) continue;
      // Emergency mode: if under heavy attack, set emergency flag
      const hostiles = RoomCache.get(room, FIND_HOSTILE_CREEPS);
      const criticalRampart = RoomCache.get(room, FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_RAMPART && s.hits < CONFIG.DEFENSE.RAMPART_CRITICAL_HITS
      });
      // --- Advanced: Boosted hostile detection ---
      let boostedHostiles = [];
      let hasBoosted = false;
      if (CONFIG.DEFENSE.BOOSTED_DETECTION) {
        boostedHostiles = hostiles.filter(c => c.body.some(part => part.boost));
        hasBoosted = boostedHostiles.length > 0;
      }
      // --- Advanced: Auto safe mode ---
      if (CONFIG.DEFENSE.AUTO_SAFE_MODE && room.controller && room.controller.my && room.controller.safeModeAvailable) {
        const criticalTypes = CONFIG.DEFENSE.SAFE_MODE_CRITICAL_STRUCTURES;
        const criticalStructures = RoomCache.get(room, FIND_MY_STRUCTURES, {
          filter: s => criticalTypes.includes(s.structureType)
        });
        const underAttack = criticalStructures.some(s => hostiles.some(c => c.pos.inRangeTo(s, 1)));
        if (underAttack && !room.controller.safeMode) {
          room.controller.activateSafeMode();
          Game.notify(`[${room.name}] SAFE MODE ACTIVATED: Critical structure under attack!`);
        }
      }
      // ---
      const emergency = hostiles.length >= CONFIG.DEFENSE.HOSTILES_THRESHOLD || criticalRampart.length > 0 || hasBoosted;
      const prevEmergency = room.memory.emergency;
      room.memory.emergency = emergency;
      // Throttle notifications
      if (emergency && (!prevEmergency || !room.memory.lastEmergencyNotify || Game.time - room.memory.lastEmergencyNotify > CONFIG.DEFENSE.NOTIFY_INTERVAL)) {
        Game.notify(`[${room.name}] EMERGENCY: Under heavy attack, rampart critical, or boosted enemy detected!`);
        room.memory.lastEmergencyNotify = Game.time;
      }
      // If we just claimed a new room, initialize its memory and build queue
      if (room.controller.my && (!room.memory.constructionQueue || !room.memory.initialized)) {
        room.memory.constructionQueue = [];
        room.memory.initialized = true;
        this.planRoomConstruction(room);
      }
      if (!room.controller.my) {
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

        // --- After requesting creeps, check for non-owned hostile/neutral structures to destroy ---
        const forbiddenTypes: (StructureConstant | string)[] = [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_CONTROLLER];
        const foreignStructures = RoomCache.get(room, FIND_STRUCTURES, {
          filter: s => !forbiddenTypes.includes(s.structureType) && !(s as any).my
        });
        if (foreignStructures.length > 0) {
          const destroyerCount = _.filter(Game.creeps, c => c.memory.role === 'destroyer' && c.memory.homeRoom === room.name).length;
          if (destroyerCount < 1) {
            const energy = room.energyCapacityAvailable;
            const body = CreepManager.getOptimalBody(CreepRole.Destroyer, energy, room);
            CreepManager.requestCreep({
              role: CreepRole.Destroyer,
              body: body,
              priority: 80,
              roomName: room.name,
              memory: {
                role: CreepRole.Destroyer,
                homeRoom: room.name,
                targetRoom: room.name
              }
            });
          }
        }

        // Run inter-room resource balancing every 20 ticks
        if (Game.time % 20 === 0) {
          this.balanceRoomResources(room);
        }

        // Run construction planning every 50 ticks
        if (Game.time % 50 === 0) {
          this.planRoomConstruction(room);
        }

        // Scan adjacent rooms
        RoomExplorer.scanAdjacentRooms(room);

        // Expansion: Check for adjacent scouted rooms to claim
        if (room.memory.adjacentRooms) {
          for (const adjRoom in room.memory.adjacentRooms) {
            const adjStatus = room.memory.adjacentRooms[adjRoom].status;
            // Only claim if scouted, not owned, not reserved, not highway/source keeper, and GCL allows
            if (adjStatus === 'scouted' &&
                (!Memory.roomData[adjRoom] || (!Memory.roomData[adjRoom].ownedRoom && !Memory.roomData[adjRoom].reservedRoom)) &&
                Game.gcl.level > Object.keys(Memory.colony.rooms.owned).length &&
                !/^.*[0|5]$/.test(adjRoom) && // Avoid highways
                !/^.*[3|6]$/.test(adjRoom)) {
              // Request a claimer for this room
              CreepManager.requestCreep({
                role: CreepRole.Claimer,
                body: [CLAIM, MOVE, MOVE, MOVE],
                priority: 80,
                roomName: room.name,
                memory: {
                  role: CreepRole.Claimer,
                  homeRoom: room.name,
                  targetRoom: adjRoom
                }
              });
              // Only request one at a time
              break;
            }
          }
        }

        // --- Nuke Detection ---
        const nukes = RoomCache.get(room, FIND_NUKES);
        if (nukes.length > 0) {
          if (!room.memory.nukeEmergency || room.memory.nukeEmergency !== true) {
            Game.notify(`[${room.name}] NUKE INCOMING! Impact(s) in ${nukes.map(n => n.timeToLand).join(', ')} ticks at positions: ${nukes.map(n => `${n.pos.x},${n.pos.y}`).join(' | ')}`);
          }
          room.memory.nukeEmergency = true;
          room.memory.nukeInfo = nukes.map(n => ({ x: n.pos.x, y: n.pos.y, timeToLand: n.timeToLand }));
        } else {
          room.memory.nukeEmergency = false;
          room.memory.nukeInfo = undefined;
        }
        // --- Analytics: Track recent hostile activity ---
        if (Game.time % 10 === 0) { // Only update every 10 ticks for CPU
          if (!room.memory.hostileStats) room.memory.hostileStats = { avg: 0, count: 0 };
          room.memory.hostileStats.avg = (room.memory.hostileStats.avg * room.memory.hostileStats.count + hostiles.length) / (room.memory.hostileStats.count + 1);
          room.memory.hostileStats.count++;
        }
        // --- Per-Tick Damage Stats ---
        if (Game.time % 10 === 0) { // Only update every 10 ticks for CPU
          if (!room.memory.damageStats) room.memory.damageStats = { dealt: 0, received: 0, count: 0 };
          let damageDealt = 0;
          let damageReceived = 0;
          // Damage dealt: sum of tower attacks
          const towers = RoomCache.get(room, FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
          for (const tower of towers) {
            if (tower.store && tower.store.energy > 0) {
              // Estimate: if a hostile is in range, assume attack
              const target = tower.pos.findClosestByRange(hostiles);
              if (target && target.pos.getRangeTo(tower) <= 20) {
                // Screeps tower damage formula: 600 at range 5, 300 at range 20
                const range = tower.pos.getRangeTo(target);
                let dmg = 0;
                if (range <= 5) dmg = 600;
                else if (range >= 20) dmg = 150;
                else dmg = 600 - 30 * (range - 5);
                damageDealt += dmg;
              }
            }
          }
          // Damage received: (not tracked for memory optimization)
          damageReceived = 0;
          // Log for analytics (keep last 100 entries)
          room.memory.damageStats.dealt = (room.memory.damageStats.dealt * room.memory.damageStats.count + damageDealt) / (room.memory.damageStats.count + 1);
          room.memory.damageStats.received = (room.memory.damageStats.received * room.memory.damageStats.count + damageReceived) / (room.memory.damageStats.count + 1);
          room.memory.damageStats.count++;
        }

        // --- Road Planning: Track planned road positions ---
        const plannedRoads = new Set<string>();
        // Only build roads if there are no critical structure construction sites (extensions, towers, storage, etc.)
        const criticalTypes: (BuildableStructureConstant | string)[] = [STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_SPAWN, STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_LAB, STRUCTURE_LINK];
        const criticalSites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES, { filter: s => (criticalTypes as string[]).includes(s.structureType) });
        if (criticalSites.length === 0) {
          // Limit road construction sites to 2 at a time
          const roadSites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_ROAD });
          if (roadSites.length < 2) {
            // 1. Essential roads: spawn↔sources, storage↔controller, storage↔sources
            const spawns = room.find(FIND_MY_SPAWNS);
            for (const spawn of spawns) {
              for (const source of RoomCache.get(room, FIND_SOURCES)) {
                this.ensureRoadBetween(room, spawn.pos, source.pos, plannedRoads);
                if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
              }
            }
            if (room.storage && room.controller) {
              this.ensureRoadBetween(room, room.storage.pos, room.controller.pos, plannedRoads);
              if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
            }
            if (room.storage) {
              for (const source of RoomCache.get(room, FIND_SOURCES)) {
                this.ensureRoadBetween(room, room.storage.pos, source.pos, plannedRoads);
                if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
              }
            }
            // 2. Heatmap-based roads (only if no essential roads to build)
            if (room.memory.roadHeatmap && Game.time % 200 === 0) {
              const thresholdPlain = 10;
              const thresholdSwamp = 2;
              for (const xStr in room.memory.roadHeatmap) {
                const x = Number(xStr);
                for (const yStr in room.memory.roadHeatmap[x]) {
                  const y = Number(yStr);
                  const value = room.memory.roadHeatmap[x][y];
                  const terrain = room.getTerrain().get(x, y);
                  let shouldBuild = false;
                  if (terrain === TERRAIN_MASK_SWAMP && value >= thresholdSwamp) {
                    shouldBuild = true;
                  } else if (terrain !== TERRAIN_MASK_WALL && value >= thresholdPlain) {
                    shouldBuild = true;
                  }
                  if (shouldBuild) {
                    const pos = new RoomPosition(x, y, room.name);
                    plannedRoads.add(`${x},${y}`);
                    const structures = pos.lookFor(LOOK_STRUCTURES);
                    const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
                    const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_ROAD);
                    if (!hasRoad && !hasSite) {
                      room.createConstructionSite(x, y, STRUCTURE_ROAD);
                      if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
                    }
                  }
                }
              }
            }
          }
        }
        // --- Build plan aware road cleanup: only remove roads not in plannedRoads and with low heatmap ---
        if (Game.time % 5000 === 0 && !room.memory.emergency && room.energyAvailable > room.energyCapacityAvailable * 0.5) {
          if (room.memory.roadHeatmap) {
            const roads = RoomCache.get(room, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD });
            for (const road of roads) {
              const x = road.pos.x;
              const y = road.pos.y;
              const heat = room.memory.roadHeatmap[x]?.[y] || 0;
              if (heat < 2 && !plannedRoads.has(`${x},${y}`)) {
                road.destroy();
              }
            }
          }
        }
      } catch (e) {
        // ... existing code ...
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
        const sources = RoomCache.get(room, FIND_SOURCES);
        this.roomCache[roomName].sources = sources.map(source => ({
          id: source.id,
          pos: source.pos
        }));
      }
      
      // Update minerals
      if (!this.roomCache[roomName].minerals) {
        const minerals = RoomCache.get(room, FIND_MINERALS);
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
      const hostiles = RoomCache.get(room, FIND_HOSTILE_CREEPS);
      if (hostiles.length > 0) {
        // Update room memory with hostile presence
        if (!Memory.roomData[room.name]) Memory.roomData[room.name] = {} as any;
        Memory.roomData[room.name].hostileTime = Game.time;
        Memory.roomData[room.name].hostileCount = hostiles.length;
        
        // Send alert if we have creeps in this room
        const myCreeps = RoomCache.get(room, FIND_MY_CREEPS);
        if (myCreeps.length > 0) {
          // ... existing code ...
        }
      }
    } catch (e) {
      // ... existing code ...
    }
    
    // Check container status for remote harvesting
    try {
      const sources = RoomCache.get(room, FIND_SOURCES);
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
            }
          }
        }
      }
    } catch (e) {
      // ... existing code ...
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
        const sources = RoomCache.get(room, FIND_SOURCES);
        const minerals = RoomCache.get(room, FIND_MINERALS);
        const terrain = new Room.Terrain(room.name);
        let score = 0;
        // --- Advanced scoring ---
        // Source count
        if (sources.length === 2) {
          score += 20;
        } else if (sources.length === 1) {
          score += 5;
        }
        // --- Mineral logic ---
        // Gather all minerals already owned (only if extractor is present and working)
        const ownedMinerals = new Set<string>();
        for (const ownedRoomName of [...Memory.colony.rooms.owned, ...Memory.colony.rooms.reserved]) {
          const ownedRoom = Game.rooms[ownedRoomName];
          if (!ownedRoom) continue;
          const extractors = RoomCache.get(ownedRoom, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTRACTOR });
          if (extractors.length === 0) continue; // No extractor, can't mine
          const extractor = extractors[0] as StructureExtractor;
          if (extractor && (!extractor.cooldown || extractor.cooldown === 0)) { // Only if extractor is working
            const ownedMineralsInRoom = RoomCache.get(ownedRoom, FIND_MINERALS);
            for (const m of ownedMineralsInRoom) {
              ownedMinerals.add(m.mineralType);
            }
          }
        }
        for (const mineral of minerals) {
          // Base score for any mineral
          let mineralScore = RoomManager.MINERAL_SCORES[mineral.mineralType] || 5;
          score += mineralScore;
          // Bonus for new mineral type
          if (!ownedMinerals.has(mineral.mineralType)) {
            score += 20;
          } else {
            score += 2; // Small bonus for duplicate
          }
          // Bonus if extractor already exists in this room
          const extractors = RoomCache.get(room, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTRACTOR });
          if (extractors.length > 0) {
            score += 10;
          }
          // Penalize if mineral is on cooldown (recently mined out)
          if (mineral.ticksToRegeneration && mineral.ticksToRegeneration > 0) {
            score -= 10;
          }
          // --- Market price logic (real-time trend) ---
          const { price, trend } = MarketTrends.get(mineral.mineralType);
          if (trend > 50) score += EXPANSION_CONFIG.weights.mineralMarketHigh;
          else if (trend > 10) score += EXPANSION_CONFIG.weights.mineralMarketMed;
          else if (trend < -10) score += EXPANSION_CONFIG.weights.mineralMarketLow;
        }
        // Proximity to owned rooms (closer = better)
        let minDist = 10;
        for (const owned of Memory.colony.rooms.owned) {
          const dist = Game.map.getRoomLinearDistance(room.name, owned);
          if (dist < minDist) minDist = dist;
        }
        score += Math.max(0, 10 - minDist); // +10 for adjacent, less for farther
        // Open terrain
        let openCount = 0, wallCount = 0, swampCount = 0;
        for (let x = 0; x < 50; x += 10) {
          for (let y = 0; y < 50; y += 10) {
            const t = terrain.get(x, y);
            if (t === TERRAIN_MASK_WALL) wallCount++;
            else if (t === TERRAIN_MASK_SWAMP) swampCount++;
            else openCount++;
          }
        }
        score += Math.floor(openCount / 5);
        score -= swampCount * 2;
        // Hostile structures
        const hostiles = RoomCache.get(room, FIND_HOSTILE_STRUCTURES);
        if (hostiles.length > 0) score -= 20;
        // Hostile reservation/ownership
        if (room.controller && room.controller.owner && !room.controller.my) score -= 100;
        if (room.controller && room.controller.reservation && room.controller.reservation.username !== Memory.username) score -= 100;
        // Source keeper/highway
        if (/^[WE][0-9][3|6][NS][0-9][3|6]$/.test(room.name)) score -= 50; // source keeper
        if (/^[WE][0-9]*0[NS][0-9]*0$/.test(room.name)) score -= 50; // highway
        // --- Enemy empire analysis, map features, and sector/region targeting ---
        const exits = Game.map.describeExits(room.name);
        const topEnemies = Memory.topEnemies || [];
        let strongEnemyNearby = false;
        let connectsRooms = 0;
        for (const dir in exits) {
          const adjRoomName = exits[dir];
          const adjRoomData = Memory.roomData[adjRoomName];
          if (adjRoomData && adjRoomData.owner && topEnemies.includes(adjRoomData.owner)) {
            strongEnemyNearby = true;
          }
          if (adjRoomData && ((adjRoomData.hostileCount && adjRoomData.hostileCount > 5) || (adjRoomData.hostileStructures && adjRoomData.hostileStructures > 2))) {
            strongEnemyNearby = true;
          }
          if (Memory.colony.rooms.owned.includes(adjRoomName)) connectsRooms++;
        }
        if (strongEnemyNearby) score -= EXPANSION_CONFIG.weights.enemyStrong;
        if (connectsRooms >= 2) score += EXPANSION_CONFIG.weights.connectsRooms;
        // Penalty for border/highway rooms
        if (/^[WE][0-9]*0[NS][0-9]*0$/.test(room.name)) score += EXPANSION_CONFIG.weights.highway;
        if (/^[WE]0[NS]|[NS]0[WE]/.test(room.name)) score += EXPANSION_CONFIG.weights.border;
        // --- Sector/region targeting and preferences ---
        const sector = room.name.match(/[WE][0-9]+[NS][0-9]+/)[0];
        if (EXPANSION_CONFIG.preferredSectors.includes(sector)) {
          score += EXPANSION_CONFIG.weights.sector;
        }
        if (EXPANSION_CONFIG.blacklistedSectors.includes(sector)) {
          score += EXPANSION_CONFIG.weights.sectorFar;
        }
        // Store the score
        if (!Memory.roomData[room.name]) Memory.roomData[room.name] = {} as any;
        Memory.roomData[room.name].expansionScore = score;
      } catch (e) {
        // ... existing code ...
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
    const containers = RoomCache.get(room, FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER
    }) as StructureContainer[];
    
    // If storage has plenty of energy, distribute to extensions/spawns/towers
    const storageEnergy = room.storage.store[RESOURCE_ENERGY] || 0;
    
    if (storageEnergy > 5000 && room.energyAvailable < room.energyCapacityAvailable) {
      // We have energy to spare - make sure spawns/extensions are filled
      const targets = RoomCache.get(room, FIND_MY_STRUCTURES, {
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
        room.memory.constructionQueue.shift();
      } else if (result === ERR_INVALID_TARGET || result === ERR_FULL || result === ERR_INVALID_ARGS) {
        // Remove invalid/blocked positions
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
    const spawns = RoomCache.get(room, FIND_MY_SPAWNS);
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
    const rcl = room.controller?.level || 0;
    // --- 1. Containers near sources and controller ---
    const sources = RoomCache.get(room, FIND_SOURCES);
    const containers = RoomCache.get(room, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
    const containerSites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
    // Place container near each source
    for (const source of sources) {
      const nearContainers = containers.filter(c => c.pos.getRangeTo(source.pos) <= 2);
      const nearSites = containerSites.filter(c => c.pos.getRangeTo(source.pos) <= 2);
      // Redundancy: allow a second container if the first is often full
      let allowSecond = false;
      if (nearContainers.length === 1) {
        const c = nearContainers[0];
        if (!c.memory) c.memory = {};
        if (!c.memory.fullTicks) c.memory.fullTicks = 0;
        if (c.store.getFreeCapacity(RESOURCE_ENERGY) === 0) c.memory.fullTicks++;
        else c.memory.fullTicks = 0;
        if (c.memory.fullTicks > 1000) allowSecond = true;
      }
      if ((nearContainers.length + nearSites.length < 1) || (allowSecond && nearContainers.length + nearSites.length < 2)) {
        const pos = this.findContainerSpotNear(room, source.pos);
        if (pos) {
          room.memory.constructionQueue = room.memory.constructionQueue || [];
          room.memory.constructionQueue.push({
            x: pos.x, y: pos.y, structureType: STRUCTURE_CONTAINER, tag: allowSecond ? 'redundant source container' : 'source container'
          });
        }
      }
    }
    // Place container near controller
    if (room.controller) {
      const nearContainers = containers.filter(c => c.pos.getRangeTo(room.controller!.pos) <= 2);
      const nearSites = containerSites.filter(c => c.pos.getRangeTo(room.controller!.pos) <= 2);
      if (nearContainers.length + nearSites.length < 1) {
        const pos = this.findContainerSpotNear(room, room.controller.pos);
        if (pos) {
          room.memory.constructionQueue = room.memory.constructionQueue || [];
          room.memory.constructionQueue.push({
            x: pos.x, y: pos.y, structureType: STRUCTURE_CONTAINER, tag: 'controller container'
          });
        }
      }
    }
    // --- 2. Links (RCL 5+) ---
    if (rcl >= 5) {
      const links = RoomCache.get(room, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_LINK });
      const linkSites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_LINK });
      const maxLinks = [0,0,0,0,0,2,3,4,6][rcl] || 0;
      let placed = links.length + linkSites.length;
      for (const source of sources) {
        if (placed >= maxLinks) break;
        const nearLink = links.some(l => l.pos.getRangeTo(source.pos) <= 2);
        const nearLinkSite = linkSites.some(l => l.pos.getRangeTo(source.pos) <= 2);
        if (!nearLink && !nearLinkSite) {
          const pos = this.findContainerSpotNear(room, source.pos);
          if (pos) { room.createConstructionSite(pos, STRUCTURE_LINK); placed++; }
        }
      }
      // Place link near storage
      if (room.storage && placed < maxLinks) {
        const nearLink = links.some(l => l.pos.getRangeTo(room.storage!.pos) <= 2);
        const nearLinkSite = linkSites.some(l => l.pos.getRangeTo(room.storage!.pos) <= 2);
        if (!nearLink && !nearLinkSite) {
          const pos = this.findContainerSpotNear(room, room.storage.pos);
          if (pos) { room.createConstructionSite(pos, STRUCTURE_LINK); placed++; }
        }
      }
      // Place link near controller
      if (room.controller && placed < maxLinks) {
        const nearLink = links.some(l => l.pos.getRangeTo(room.controller!.pos) <= 2);
        const nearLinkSite = linkSites.some(l => l.pos.getRangeTo(room.controller!.pos) <= 2);
        if (!nearLink && !nearLinkSite) {
          const pos = this.findContainerSpotNear(room, room.controller.pos);
          if (pos) { room.createConstructionSite(pos, STRUCTURE_LINK); placed++; }
        }
      }
    }
    // --- 3. Labs, Terminal, Factory (RCL 6+) ---
    if (rcl >= 6) {
      // Labs
      const labs = RoomCache.get(room, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_LAB });
      const labSites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_LAB });
      const maxLabs = [0,0,0,0,0,0,3,6,10][rcl] || 0;
      let placedLabs = labs.length + labSites.length;
      for (let i = placedLabs; i < maxLabs; i++) {
        const pos = this.findLabSpot(room);
        if (pos) room.createConstructionSite(pos, STRUCTURE_LAB);
      }
      // Terminal
      const terminals = RoomCache.get(room, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TERMINAL });
      const terminalSites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_TERMINAL });
      if (terminals.length + terminalSites.length < 1) {
        const pos = this.findNearStorage(room);
        if (pos) room.createConstructionSite(pos, STRUCTURE_TERMINAL);
      }
      // Factory
      const factories = RoomCache.get(room, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_FACTORY });
      const factorySites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_FACTORY });
      if (factories.length + factorySites.length < 1) {
        const pos = this.findNearStorage(room);
        if (pos) room.createConstructionSite(pos, STRUCTURE_FACTORY);
      }
    }
    // --- 4. Defensive structures: ramparts and walls ---
    // Place ramparts on all spawns, storage, terminal, towers, and controller
    const rampartTargets = [
      ...RoomCache.get(room, FIND_MY_SPAWNS),
      ...(room.storage ? [room.storage] : []),
      ...(room.terminal ? [room.terminal] : []),
      ...RoomCache.get(room, FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }),
      ...(room.controller ? [room.controller] : [])
    ];
    const ramparts = RoomCache.get(room, FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART });
    const rampartSites = RoomCache.get(room, FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_RAMPART });
    for (const target of rampartTargets) {
      const hasRampart = ramparts.some(r => r.pos.isEqualTo(target.pos));
      const hasRampartSite = rampartSites.some(r => r.pos.isEqualTo(target.pos));
      if (!hasRampart && !hasRampartSite) room.createConstructionSite(target.pos, STRUCTURE_RAMPART);
    }
    // Place walls at room exits
    const exits = Game.map.describeExits(room.name);
    for (const dir in exits) {
      const exitRoom = exits[dir];
      for (let x = 1; x < 49; x++) {
        for (let y = 1; y < 49; y++) {
          if (room.getPositionAt(x, y)?.lookFor(LOOK_TERRAIN)[0] === 'plain') {
            if (x === 1 || x === 48 || y === 1 || y === 48) {
              const hasWall = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_WALL && s.pos.x === x && s.pos.y === y }).length > 0;
              const hasWallSite = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_WALL && s.pos.x === x && s.pos.y === y }).length > 0;
              if (!hasWall && !hasWallSite) room.createConstructionSite(x, y, STRUCTURE_WALL);
            }
          }
        }
      }
    }
    // --- Road Planning: Track planned road positions ---
    const plannedRoads = new Set<string>();
    // Only build roads if there are no critical structure construction sites (extensions, towers, storage, etc.)
    const criticalTypes: (BuildableStructureConstant | string)[] = [STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_SPAWN, STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_LAB, STRUCTURE_LINK];
    const criticalSites = constructionSites.filter(site => (criticalTypes as string[]).includes(site.structureType));
    if (criticalSites.length === 0) {
      // Limit road construction sites to 2 at a time
      const roadSites = constructionSites.filter(site => site.structureType === STRUCTURE_ROAD);
      if (roadSites.length < 2) {
        // 1. Essential roads: spawn↔sources, storage↔controller, storage↔sources
        const spawns = room.find(FIND_MY_SPAWNS);
        for (const spawn of spawns) {
          for (const source of sources) {
            this.ensureRoadBetween(room, spawn.pos, source.pos, plannedRoads);
            if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
          }
        }
        if (room.storage && room.controller) {
          this.ensureRoadBetween(room, room.storage.pos, room.controller.pos, plannedRoads);
          if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
        }
        if (room.storage) {
          for (const source of sources) {
            this.ensureRoadBetween(room, room.storage.pos, source.pos, plannedRoads);
            if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
          }
        }
        // 2. Heatmap-based roads (only if no essential roads to build)
        if (room.memory.roadHeatmap && Game.time % 200 === 0) {
          const thresholdPlain = 10;
          const thresholdSwamp = 2;
          for (const xStr in room.memory.roadHeatmap) {
            const x = Number(xStr);
            for (const yStr in room.memory.roadHeatmap[x]) {
              const y = Number(yStr);
              const value = room.memory.roadHeatmap[x][y];
              const terrain = room.getTerrain().get(x, y);
              let shouldBuild = false;
              if (terrain === TERRAIN_MASK_SWAMP && value >= thresholdSwamp) {
                shouldBuild = true;
              } else if (terrain !== TERRAIN_MASK_WALL && value >= thresholdPlain) {
                shouldBuild = true;
              }
              if (shouldBuild) {
                const pos = new RoomPosition(x, y, room.name);
                plannedRoads.add(`${x},${y}`);
                const structures = pos.lookFor(LOOK_STRUCTURES);
                const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
                const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_ROAD);
                if (!hasRoad && !hasSite) {
                  room.createConstructionSite(x, y, STRUCTURE_ROAD);
                  if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
                }
              }
            }
          }
        }
      }
    }
    // --- Build plan aware road cleanup: only remove roads not in plannedRoads and with low heatmap ---
    if (Game.time % 5000 === 0 && !room.memory.emergency && room.energyAvailable > room.energyCapacityAvailable * 0.5) {
      if (room.memory.roadHeatmap) {
        const roads = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD });
        for (const road of roads) {
          const x = road.pos.x;
          const y = road.pos.y;
          const heat = room.memory.roadHeatmap[x]?.[y] || 0;
          if (heat < 2 && !plannedRoads.has(`${x},${y}`)) {
            road.destroy();
          }
        }
      }
    }
  }

  // Improved: Find optimal container spot near a position
  private static findContainerSpotNear(room: Room, pos: RoomPosition): RoomPosition | null {
    const candidates: {pos: RoomPosition, score: number}[] = [];
    for (const dx of [-1,0,1]) {
      for (const dy of [-1,0,1]) {
        if (dx === 0 && dy === 0) continue;
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        const terrain = room.getTerrain().get(x, y);
        if (terrain === TERRAIN_MASK_WALL) continue;
        // Avoid planned structures/sites
        const hasStructure = room.lookForAt(LOOK_STRUCTURES, x, y).length > 0;
        const hasSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0;
        if (hasStructure || hasSite) continue;
        // Prefer non-swamp
        let score = 0;
        if (terrain === TERRAIN_MASK_SWAMP) score += 10;
        // Prefer adjacent to road
        const road = room.lookForAt(LOOK_STRUCTURES, x, y).some(s => s.structureType === STRUCTURE_ROAD);
        if (!road) score += 2;
        candidates.push({pos: new RoomPosition(x, y, room.name), score});
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0].pos;
  }

  // --- Helper: Find a spot for a lab (simple: near storage or center) ---
  private static findLabSpot(room: Room): RoomPosition | null {
    if (room.storage) {
      for (const dx of [-2,-1,0,1,2]) {
        for (const dy of [-2,-1,0,1,2]) {
          const x = room.storage.pos.x + dx;
          const y = room.storage.pos.y + dy;
          if (x < 1 || x > 48 || y < 1 || y > 48) continue;
          const look = room.lookForAt(LOOK_STRUCTURES, x, y);
          if (look.length === 0 && room.lookForAt(LOOK_TERRAIN, x, y)[0] !== 'wall') {
            return new RoomPosition(x, y, room.name);
          }
        }
      }
    }
    return new RoomPosition(25, 25, room.name);
  }
  // --- Helper: Find a spot near storage ---
  private static findNearStorage(room: Room): RoomPosition | null {
    if (room.storage) {
      for (const dx of [-1,0,1]) {
        for (const dy of [-1,0,1]) {
          const x = room.storage.pos.x + dx;
          const y = room.storage.pos.y + dy;
          if (x < 1 || x > 48 || y < 1 || y > 48) continue;
          const look = room.lookForAt(LOOK_STRUCTURES, x, y);
          if (look.length === 0 && room.lookForAt(LOOK_TERRAIN, x, y)[0] !== 'wall') {
            return new RoomPosition(x, y, room.name);
          }
        }
      }
    }
    return null;
  }
  // --- Helper: Ensure a road exists along the path between two positions ---
  private static ensureRoadBetween(room: Room, from: RoomPosition, to: RoomPosition, plannedRoads?: Set<string>): void {
    const path = room.findPath(from, to, { ignoreCreeps: true, range: 1 });
    for (const step of path) {
      const x = step.x;
      const y = step.y;
      const pos = new RoomPosition(x, y, room.name);
      const terrain = room.getTerrain().get(x, y);
      if (terrain !== TERRAIN_MASK_WALL) {
        if (plannedRoads) plannedRoads.add(`${x},${y}`);
        const structures = pos.lookFor(LOOK_STRUCTURES);
        const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
        const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_ROAD);
        // --- Swamp prioritization: always build road on swamp, regardless of heatmap or traffic ---
        if (terrain === TERRAIN_MASK_SWAMP) {
          if (!hasRoad && !hasSite) {
            room.createConstructionSite(x, y, STRUCTURE_ROAD);
            if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
          }
        } else {
          // For plains, keep existing logic
          if (!hasRoad && !hasSite) {
            room.createConstructionSite(x, y, STRUCTURE_ROAD);
            if (_.filter(Game.constructionSites, s => s.room && s.room.name === room.name && s.structureType === STRUCTURE_ROAD).length >= 2) return;
          }
        }
      }
    }
  }

  /**
   * Run logic for a specific room
   */
  public static runRoomLogic(room: Room): void {
    // --- Task planning: create tasks for all opportunities ---
    this.planRoomTasks(room);
    // --- DEBUG LOGGING ---
    const controller = room.controller;
    const spawns = room.find(FIND_MY_SPAWNS);
    const extensions = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
    const extensionSites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
    // ... existing code ...
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
   * Run stage 2 logic (mid-game: storage, links, towers)
   */
  private static runStage2(room: Room): void {
    // At RCL 4+, focus on storage, link, and tower infrastructure
    if (room.controller && room.controller.level >= 4) {
      // Ensure storage exists
      if (!room.storage) {
        // Plan storage construction (already handled in planRoomConstruction)
      }
      // Ensure at least one tower
      const towers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
      if (towers.length < 1) {
        // Plan tower construction (already handled in planRoomConstruction)
      }
      // Ensure links are planned (handled in planRoomConstruction)
      // Modular AI hooks: could call AI.link/task, AI.tower/task, etc. in future
    }
  }

  /**
   * Run stage 3 logic (late-game: labs, terminal, advanced defense)
   */
  private static runStage3(room: Room): void {
    // At RCL 6+, focus on labs, terminal, and advanced defense
    if (room.controller && room.controller.level >= 6) {
      // Ensure labs exist (handled in planRoomConstruction)
      // Ensure terminal exists (handled in planRoomConstruction)
      // Advanced defense: ramparts, walls, etc.
      // Future: industry/boosting logic, modular AI for labs/industry
    }
  }
  
  /**
   * Check if the room should advance to the next stage
   */
  private static checkStageProgress(room: Room): void {
    const stage = room.memory.stage as RoomStage;
    
    switch (stage) {
      case RoomStage.Initial:
        if (room.energyCapacityAvailable >= 550) {
          room.memory.stage = RoomStage.Basic;
          // ... existing code ...
        }
        break;
      case RoomStage.Basic:
        if (room.storage && room.storage.my) {
          room.memory.stage = RoomStage.Intermediate;
          // ... existing code ...
        }
        break;
      case RoomStage.Intermediate:
        if (room.controller && room.controller.level >= 6) {
          room.memory.stage = RoomStage.Advanced;
          // ... existing code ...
        }
        break;
      // Add more stage advancement logic as needed
    }
  }
  
  /**
   * Request creeps based on room needs (expert, dynamic, config-driven)
   */
  private static requestCreeps(room: Room): void {
    // Build profiles (CPU-efficient)
    const roomProfile = CreepManager.buildRoomProfile(room);
    // For empireProfile, only build once per tick and cache globally (to save CPU)
    if (!global._empireProfile || global._empireProfileTick !== Game.time) {
      global._empireProfile = CreepManager.buildEmpireProfile();
      global._empireProfileTick = Game.time;
    }
    const empireProfile = global._empireProfile as ReturnType<typeof CreepManager.buildEmpireProfile>;
    // Get creep requests from the generic planner
    const requests = CreepManager.planCreeps(roomProfile, empireProfile);
    for (const req of requests) {
      CreepManager.requestCreep(req);
    }
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
      } else {
        // Fallback: attack hostiles, heal friendlies, repair ramparts
        let target: Creep | null = null;
        if (CONFIG.DEFENSE.BOOSTED_DETECTION && room.find(FIND_HOSTILE_CREEPS).some(c => c.body.some(part => part.boost))) {
          // Focus fire on boosted hostile
          target = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
            filter: c => c.body.some(part => part.boost)
          });
        }
        if (!target) {
          // Focus on highest attack/ranged/heal hostile
          target = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
            filter: c => c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK) + c.getActiveBodyparts(HEAL) > 0
          });
        }
        if (!target) {
          target = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        }
        if (target) {
          tower.attack(target);
          continue;
        }
        const closestHurt = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
          filter: c => c.hits < c.hitsMax
        });
        if (closestHurt) {
          tower.heal(closestHurt);
          continue;
        }
        const weakRampart = tower.pos.findClosestByRange(FIND_STRUCTURES, {
          filter: s => s.structureType === STRUCTURE_RAMPART && s.hits < CONFIG.DEFENSE.RAMPART_CRITICAL_HITS * 2
        });
        if (weakRampart) {
          tower.repair(weakRampart);
        }
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

  /**
   * Plan all room tasks: build, repair, transfer, withdraw, pickup, and remote mining
   * Creates tasks for TaskManager to be executed by modular AI roles.
   */
  private static planRoomTasks(room: Room): void {
    // --- Throttle remote mining/hauling/reserving/container placement for CPU ---
    const doRemote = Game.time % 20 === 0;
    // --- Build tasks ---
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    for (const site of sites) {
      if (!TaskManager.getTask(`build_${site.id}`)) {
        TaskManager.createTask(TaskType.Build, site.id, 50, room.name);
      }
    }
    // --- Repair tasks ---
    const repairables = room.find(FIND_STRUCTURES, {
      filter: s => s.hits < s.hitsMax * 0.75 && s.hits < 1000000
    });
    for (const s of repairables) {
      let priority = 40;
      if ((s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < 5000) priority = 90;
      if (!TaskManager.getTask(`repair_${s.id}`)) {
        TaskManager.createTask(TaskType.Repair, s.id, priority, room.name);
      }
    }
    // --- Transfer tasks (energy to spawns/extensions/towers) ---
    const transferTargets = room.find(FIND_MY_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    for (const t of transferTargets) {
      let priority = 100;
      if (!TaskManager.getTask(`transfer_${t.id}`)) {
        TaskManager.createTask(TaskType.Transfer, t.id, priority, room.name, { resourceType: RESOURCE_ENERGY });
      }
    }
    // Towers: slightly lower than spawn/extensions
    const towers = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    for (const t of towers) {
      if (!TaskManager.getTask(`transfer_${t.id}`)) {
        TaskManager.createTask(TaskType.Transfer, t.id, 60, room.name, { resourceType: RESOURCE_ENERGY });
      }
    }
    // --- Withdraw tasks (energy from containers/storage) ---
    const withdrawSources = room.find(FIND_STRUCTURES, {
      filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    });
    for (const s of withdrawSources) {
      if (!TaskManager.getTask(`withdraw_${s.id}`)) {
        TaskManager.createTask(TaskType.Withdraw, s.id, 20, room.name, { resourceType: RESOURCE_ENERGY });
      }
    }
    // --- Pickup tasks (dropped energy) ---
    const dropped = room.find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50 });
    for (const r of dropped) {
      if (!TaskManager.getTask(`pickup_${r.id}`)) {
        TaskManager.createTask(TaskType.Pickup, r.id, 10, room.name, { resourceType: RESOURCE_ENERGY });
      }
    }
    // --- Throttled remote mining/hauling/reserving/container placement ---
    if (doRemote && Memory.colony && Memory.colony.rooms && Memory.colony.rooms.reserved) {
      for (const remoteRoomName of Memory.colony.rooms.reserved) {
        const remoteRoom = Game.rooms[remoteRoomName];
        if (!remoteRoom) continue;
        // --- Remote mining: ensure containers at remote sources ---
        const remoteSources = remoteRoom.find(FIND_SOURCES);
        for (const source of remoteSources) {
          const containers = source.pos.findInRange(FIND_STRUCTURES, 2, { filter: { structureType: STRUCTURE_CONTAINER } });
          const sites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, { filter: { structureType: STRUCTURE_CONTAINER } });
          if (containers.length === 0 && sites.length === 0) {
            if (remoteRoom.controller && remoteRoom.controller.my) {
              const path = remoteRoom.findPath(remoteRoom.controller.pos, source.pos, { ignoreCreeps: true });
              if (path.length > 2) {
                const containerPos = new RoomPosition(path[path.length - 2].x, path[path.length - 2].y, remoteRoom.name);
                remoteRoom.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
              }
            }
          }
        }
        // --- Remote hauling: create withdraw tasks for containers/storage with energy ---
        const remoteEnergy = remoteRoom.find(FIND_STRUCTURES, {
          filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });
        for (const s of remoteEnergy) {
          if (!TaskManager.getTask(`remote_withdraw_${s.id}`)) {
            let priority = 80;
            if (room.storage && room.storage.store[RESOURCE_ENERGY] < 2000) priority = 120;
            TaskManager.createTask(TaskType.Withdraw, s.id, priority, remoteRoomName, { resourceType: RESOURCE_ENERGY, targetRoom: room.name });
          }
        }
        // --- Remote reserving: create reserve tasks if not already reserved ---
        if (remoteRoom.controller && (!remoteRoom.controller.reservation || remoteRoom.controller.reservation.ticksToEnd < 2000)) {
          if (!TaskManager.getTask(`reserve_${remoteRoom.controller.id}`)) {
            TaskManager.createTask(TaskType.ReserveController, remoteRoom.controller.id, 60, remoteRoomName);
          }
        }
        // --- Remote harvesting: create harvest tasks for each source ---
        for (const source of remoteSources) {
          if (!TaskManager.getTask(`remote_harvest_${source.id}`)) {
            TaskManager.createTask(TaskType.Harvest, source.id, 70, remoteRoomName);
          }
        }
      }
    }
    // --- Throttle local container placement for CPU ---
    if (Game.time % 20 === 0) {
      // --- 1. Containers near sources and controller ---
      const sources = room.find(FIND_SOURCES);
      const containers = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
      const containerSites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
      for (const source of sources) {
        const nearContainers = containers.filter(c => c.pos.getRangeTo(source.pos) <= 2);
        const nearSites = containerSites.filter(c => c.pos.getRangeTo(source.pos) <= 2);
        if ((nearContainers.length + nearSites.length < 1) || (nearContainers.length + nearSites.length < 2)) {
          const pos = this.findContainerSpotNear(room, source.pos);
          if (pos) {
            room.memory.constructionQueue = room.memory.constructionQueue || [];
            room.memory.constructionQueue.push({
              x: pos.x, y: pos.y, structureType: STRUCTURE_CONTAINER, tag: nearContainers.length + nearSites.length < 2 ? 'redundant source container' : 'source container'
            });
          }
        }
      }
      // Place container near controller
      if (room.controller) {
        const nearContainers = containers.filter(c => c.pos.getRangeTo(room.controller!.pos) <= 2);
        const nearSites = containerSites.filter(c => c.pos.getRangeTo(room.controller!.pos) <= 2);
        if (nearContainers.length + nearSites.length < 1) {
          const pos = this.findContainerSpotNear(room, room.controller.pos);
          if (pos) {
            room.memory.constructionQueue = room.memory.constructionQueue || [];
            room.memory.constructionQueue.push({
              x: pos.x, y: pos.y, structureType: STRUCTURE_CONTAINER, tag: 'controller container'
            });
          }
        }
      }
    }
    // --- Advanced industry tasks (labs, factories, terminals) ---
    // TODO: Add lab reaction, boosting, factory production, terminal transfer/market tasks here
    // Example:
    // - TaskManager.createTask(TaskType.LabReaction, labId, 30, room.name, { ... })
    // - TaskManager.createTask(TaskType.TerminalTransfer, terminalId, 25, room.name, { ... })
  }

  /**
   * Cleanup root-level Memory keys that look like creep names (e.g., builder_12345)
   */
  public static cleanup(): void {
    // Only remove keys that are not part of the intended schema
    const allowedRootKeys = new Set([
      'creeps', 'rooms', 'colony', 'buildId', 'lastBuildLog', 'stats', 'tasks', '_profiler', 'logLevel', 'enableStats', 'roomData',
      // Add any other root keys you use
    ]);
    for (const key in Memory) {
      // If it's an allowed key, skip
      if (allowedRootKeys.has(key)) continue;
      // If it matches a creep name pattern and is undefined/null, remove it
      if (/^(builder|harvester|upgrader|archer|reserver|remoteHarvester|hauler|scout|claimer|destroyer|defender)_\d+(_\d+)?$/.test(key)) {
        if (Memory[key] === undefined || Memory[key] === null) {
          delete Memory[key];
        }
      }
    }
  }
}

/**
 * RoomExplorer: Scans adjacent rooms and records their status in memory
 */
export class RoomExplorer {
  /**
   * Scan exits of a room and update memory with adjacent room info
   */
  public static scanAdjacentRooms(room: Room): void {
    if (!room.memory.adjacentRooms) room.memory.adjacentRooms = {};
    const exits = Game.map.describeExits(room.name);
    for (const dir in exits) {
      const adjacentRoom = exits[dir];
      if (!room.memory.adjacentRooms[adjacentRoom]) {
        room.memory.adjacentRooms[adjacentRoom] = { status: 'unexplored' };
      }
    }
  }

  /**
   * Update memory for an adjacent room after scouting
   */
  public static updateRoomStatus(roomName: string, status: string): void {
    for (const myRoomName in Game.rooms) {
      const myRoom = Game.rooms[myRoomName];
      if (myRoom.memory.adjacentRooms && myRoom.memory.adjacentRooms[roomName]) {
        myRoom.memory.adjacentRooms[roomName].status = status;
      }
    }
  }
}