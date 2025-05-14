/**
 * Movement Optimizer
 * Optimizes creep movement based on room-specific terrain and conditions
 */

import { Logger } from './logger';
import * as _ from 'lodash';

/**
 * Movement cost matrix configuration
 */
interface MovementConfig {
  avoidCreeps: boolean;
  avoidConstructionSites: boolean;
  preferRoads: boolean;
  avoidSources: boolean;
  avoidMinerals: boolean;
  respectRamparts: boolean;
  roomSpecificCosts: boolean;
}

/**
 * Room terrain analysis cache
 */
interface RoomTerrainCache {
  terrainMatrix: CostMatrix;
  swampPercentage: number;
  wallPercentage: number;
  roomType: RoomType;
  lastUpdated: number;
}

/**
 * Room types for movement strategy
 */
enum RoomType {
  OPEN = 'open',         // Mostly plains, few obstacles
  SWAMPY = 'swampy',     // High percentage of swamps
  WALLED = 'walled',     // Many natural walls/barriers
  MAZE = 'maze',         // Complex pathways with many walls
  MIXED = 'mixed'        // A mix of terrain types
}

/**
 * Default movement options by room type
 */
const defaultMoveOptions: Record<RoomType, Partial<MoveToOpts>> = {
  [RoomType.OPEN]: {
    reusePath: 30,
    swampCost: 10,  // Increased swamp cost
    plainCost: 1,
    visualizePathStyle: { stroke: '#ffffff', opacity: 0.15, lineStyle: 'solid' }
  },
  [RoomType.SWAMPY]: {
    reusePath: 15, // More frequent recalculation in swamps
    swampCost: 7,  // Still penalize swamps but less than in other room types
    plainCost: 1,
    visualizePathStyle: { stroke: '#77ff77', opacity: 0.15, lineStyle: 'dashed' }
  },
  [RoomType.WALLED]: {
    reusePath: 20,
    swampCost: 10,  // Increased swamp cost
    plainCost: 1,
    visualizePathStyle: { stroke: '#ffaa00', opacity: 0.15, lineStyle: 'solid' }
  },
  [RoomType.MAZE]: {
    reusePath: 10, // Frequent recalculation in complex rooms
    swampCost: 10,  // Increased swamp cost
    plainCost: 1,
    visualizePathStyle: { stroke: '#ff00aa', opacity: 0.15, lineStyle: 'dotted' }
  },
  [RoomType.MIXED]: {
    reusePath: 20, 
    swampCost: 8,  // Increased swamp cost
    plainCost: 1,
    visualizePathStyle: { stroke: '#aaaaff', opacity: 0.15, lineStyle: 'solid' }
  }
};

export class MovementOptimizer {
  // Cache for room terrain analysis
  private static roomTerrainCache: {[roomName: string]: RoomTerrainCache} = {};
  
  // Default configuration
  private static defaultConfig: MovementConfig = {
    avoidCreeps: true,
    avoidConstructionSites: true,
    preferRoads: true,
    avoidSources: true,
    avoidMinerals: true,
    respectRamparts: true,
    roomSpecificCosts: true
  };

  /**
   * Get optimized movement options based on room type and context
   */
  public static getMovementOptions(
    creep: Creep, 
    target: RoomPosition | { pos: RoomPosition },
    customOpts: Partial<MoveToOpts> = {}
  ): MoveToOpts {
    const targetPos = target instanceof RoomPosition ? target : target.pos;
    const roomType = this.analyzeRoom(creep.room).roomType;
    
    // Start with default options for the room type
    const options = { ...defaultMoveOptions[roomType] };
    
    // Adjust based on distance
    const distance = creep.pos.getRangeTo(targetPos);
    if (distance < 5) {
      options.reusePath = Math.min(options.reusePath || 5, 3);
    } else if (distance > 20) {
      options.reusePath = Math.min(options.reusePath || 20, 40);
    }
    
    // Adjust for creep carry capacity - heavier creeps should prefer roads
    const carryParts = creep.body.filter(part => part.type === CARRY).length;
    if (carryParts > 10) {
      options.plainCost = 2;
      options.swampCost = 10;
    }
    
    // Dynamic adjust for fatigue - if creep gets fatigued often, prefer roads more
    if (creep.fatigue > 0) {
      options.plainCost = 2;
      options.swampCost = 10;
    }
    
    // Default settings
    if (!options.range) options.range = 1;
    if (!options.visualizePathStyle) {
      options.visualizePathStyle = {
        stroke: '#ffffff',
        opacity: 0.15
      };
    }
    
    // Set up cost callback for room-specific costs
    options.costCallback = (roomName, costMatrix) => {
      const matrix = this.getRoomCostMatrix(roomName, this.defaultConfig);
      return matrix === false ? undefined : matrix;
    };
    
    // Apply custom options provided by the caller
    return { ...options, ...customOpts };
  }

  /**
   * Optimize creep movement to target with room-specific strategy
   */
  public static moveToTarget(
    creep: Creep, 
    target: RoomPosition | { pos: RoomPosition },
    customOpts: Partial<MoveToOpts> = {}
  ): ScreepsReturnCode {
    const targetPos = target instanceof RoomPosition ? target : target.pos;
    const options = this.getMovementOptions(creep, targetPos, customOpts);
    
    return creep.moveTo(targetPos, options);
  }

  /**
   * Analyze room and determine its type and terrain characteristics
   */
  public static analyzeRoom(room: Room): RoomTerrainCache {
    // Return cached analysis if available and not too old
    if (this.roomTerrainCache[room.name] && 
        Game.time - this.roomTerrainCache[room.name].lastUpdated < 1000) {
      return this.roomTerrainCache[room.name];
    }
    
    const terrain = room.getTerrain();
    let plainCount = 0;
    let swampCount = 0;
    let wallCount = 0;
    const terrainMatrix = new PathFinder.CostMatrix();
    
    // Analyze terrain
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const tile = terrain.get(x, y);
        if (tile === TERRAIN_MASK_WALL) {
          wallCount++;
          terrainMatrix.set(x, y, 255); // Unwalkable
        } else if (tile === TERRAIN_MASK_SWAMP) {
          swampCount++;
          terrainMatrix.set(x, y, 5); // Default cost
        } else {
          plainCount++;
          terrainMatrix.set(x, y, 1); // Default cost
        }
      }
    }
    
    const totalTiles = 50 * 50;
    const swampPercentage = swampCount / totalTiles;
    const wallPercentage = wallCount / totalTiles;
    
    // Determine room type based on terrain percentages
    let roomType: RoomType;
    if (swampPercentage > 0.4) {
      roomType = RoomType.SWAMPY;
    } else if (wallPercentage > 0.3) {
      // Further analyze if it's a maze or just walled
      const isComplex = this.analyzeComplexity(terrain);
      roomType = isComplex ? RoomType.MAZE : RoomType.WALLED;
    } else if (wallPercentage < 0.1 && swampPercentage < 0.1) {
      roomType = RoomType.OPEN;
    } else {
      roomType = RoomType.MIXED;
    }
    
    // Cache the results
    this.roomTerrainCache[room.name] = {
      terrainMatrix,
      swampPercentage,
      wallPercentage,
      roomType,
      lastUpdated: Game.time
    };
    
    return this.roomTerrainCache[room.name];
  }

  /**
   * Analyze terrain complexity to determine if it's a maze-like structure
   */
  private static analyzeComplexity(terrain: RoomTerrain): boolean {
    // Sample a few points in the room and check nearby walls
    const samplePoints = [
      {x: 10, y: 10}, {x: 10, y: 40}, 
      {x: 40, y: 10}, {x: 40, y: 40},
      {x: 25, y: 25}
    ];
    
    let complexityScore = 0;
    
    for (const point of samplePoints) {
      // Count wall/non-wall transitions in 4 directions
      let transitions = 0;
      const directions = [
        {dx: 0, dy: -1, len: 10}, // North
        {dx: 1, dy: 0, len: 10},  // East
        {dx: 0, dy: 1, len: 10},  // South
        {dx: -1, dy: 0, len: 10}  // West
      ];
      
      for (const dir of directions) {
        let lastWasWall = false;
        for (let i = 1; i <= dir.len; i++) {
          const x = point.x + (dir.dx * i);
          const y = point.y + (dir.dy * i);
          
          // Skip if out of bounds
          if (x < 0 || x >= 50 || y < 0 || y >= 50) continue;
          
          const isWall = terrain.get(x, y) === TERRAIN_MASK_WALL;
          if (isWall !== lastWasWall) {
            transitions++;
            lastWasWall = isWall;
          }
        }
      }
      
      // More transitions indicate more complexity
      complexityScore += transitions;
    }
    
    // If average transitions per sample point is high, it's maze-like
    return (complexityScore / samplePoints.length) > 3;
  }

  /**
   * Get cost matrix for room with room-specific costs
   */
  public static getRoomCostMatrix(
    roomName: string, 
    config: MovementConfig
  ): CostMatrix | false {
    // Skip empty rooms or rooms not in view
    const room = Game.rooms[roomName];
    if (!room) return false;
    
    // Start with terrain matrix if available
    let costMatrix: CostMatrix;
    if (this.roomTerrainCache[roomName]) {
      costMatrix = this.roomTerrainCache[roomName].terrainMatrix.clone();
    } else {
      costMatrix = new PathFinder.CostMatrix();
      const terrain = room.getTerrain();
      
      // Set base costs for terrain - higher swamp costs to prefer plain paths
      for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
          const tile = terrain.get(x, y);
          if (tile === TERRAIN_MASK_WALL) {
            costMatrix.set(x, y, 255); // Unwalkable
          } else if (tile === TERRAIN_MASK_SWAMP) {
            costMatrix.set(x, y, 10); // Higher swamp cost to discourage swamp paths
          } else {
            costMatrix.set(x, y, 1); // Default plain cost
          }
        }
      }
    }
    
    // Find roads and adjust their cost
    if (config.preferRoads) {
      const roads = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_ROAD
      });
      
      for (const road of roads) {
        costMatrix.set(road.pos.x, road.pos.y, 1); // Prefer roads
      }
    }
    
    // Avoid creeps for preventing traffic jams
    if (config.avoidCreeps) {
      const creeps = room.find(FIND_CREEPS);
      for (const creep of creeps) {
        if (creep.my) {
          // Less penalty for own creeps but still avoid
          costMatrix.set(creep.pos.x, creep.pos.y, 5);
        } else {
          // Higher penalty for hostile creeps
          costMatrix.set(creep.pos.x, creep.pos.y, 20);
        }
      }
    }
    
    // Avoid walking around construction sites
    if (config.avoidConstructionSites) {
      const sites = room.find(FIND_CONSTRUCTION_SITES);
      for (const site of sites) {
        costMatrix.set(site.pos.x, site.pos.y, 10);
      }
    }
    
    // Avoid sources where harvesters might be working
    if (config.avoidSources) {
      const sources = room.find(FIND_SOURCES);
      for (const source of sources) {
        // Source itself is unwalkable, but add cost to surroundings
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = source.pos.x + dx;
            const y = source.pos.y + dy;
            if (x < 0 || x >= 50 || y < 0 || y >= 50) continue;
            
            // Don't overwrite walls
            const currentCost = costMatrix.get(x, y);
            if (currentCost < 255) {
              costMatrix.set(x, y, Math.max(currentCost, 10));
            }
          }
        }
      }
    }
    
    // Apply similar logic for minerals
    if (config.avoidMinerals) {
      const minerals = room.find(FIND_MINERALS);
      for (const mineral of minerals) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = mineral.pos.x + dx;
            const y = mineral.pos.y + dy;
            if (x < 0 || x >= 50 || y < 0 || y >= 50) continue;
            
            const currentCost = costMatrix.get(x, y);
            if (currentCost < 255) {
              costMatrix.set(x, y, Math.max(currentCost, 10));
            }
          }
        }
      }
    }
    
    // Respect ramparts - only allow passing through our own
    if (config.respectRamparts) {
      const ramparts = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_RAMPART
      }) as StructureRampart[];
      
      for (const rampart of ramparts) {
        if (!rampart.my && !rampart.isPublic) {
          costMatrix.set(rampart.pos.x, rampart.pos.y, 255); // Make enemy ramparts unwalkable
        }
      }
    }
    
    // If specified, apply room-specific cost modifiers
    if (config.roomSpecificCosts) {
      this.applyRoomSpecificCosts(room, costMatrix);
    }
    
    return costMatrix;
  }

  /**
   * Apply room-specific cost modifiers based on room state
   */
  private static applyRoomSpecificCosts(room: Room, costMatrix: CostMatrix): void {
    // Add custom cost modifiers based on room state
    
    // Example: Add cost near controller for rooms that prioritize upgrading
    if (room.controller && room.controller.my) {
      // Check if this room is focusing on upgrading
      const isUpgradeFocused = room.memory.upgradeFocus === true;
      
      if (isUpgradeFocused) {
        // Reserve space for dedicated upgraders
        const controller = room.controller;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
              const x = controller.pos.x + dx;
              const y = controller.pos.y + dy;
              if (x < 0 || x >= 50 || y < 0 || y >= 50) continue;
              
              const currentCost = costMatrix.get(x, y);
              if (currentCost < 255) {
                costMatrix.set(x, y, Math.max(currentCost, 20));
              }
            }
          }
        }
      }
    }
    
    // Example: Check for hostile threats and avoid those areas
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
      for (const hostile of hostiles) {
        // Add high cost around hostile creeps
        for (let dx = -3; dx <= 3; dx++) {
          for (let dy = -3; dy <= 3; dy++) {
            const x = hostile.pos.x + dx;
            const y = hostile.pos.y + dy;
            if (x < 0 || x >= 50 || y < 0 || y >= 50) continue;
            
            const rangeSq = dx*dx + dy*dy;
            const baseCost = 20;
            
            if (rangeSq <= 9) { // Within range 3
              const currentCost = costMatrix.get(x, y);
              if (currentCost < 255) {
                // Higher penalty for closer positions
                const dangerCost = baseCost * (4 - Math.sqrt(rangeSq));
                costMatrix.set(x, y, Math.max(currentCost, dangerCost));
              }
            }
          }
        }
      }
    }
    
    // Example: High traffic areas management
    if (room.memory.roadHeatmap) {
      for (const x in room.memory.roadHeatmap) {
        for (const y in room.memory.roadHeatmap[x]) {
          const trafficLevel = room.memory.roadHeatmap[x][y];
          if (trafficLevel > 100) {
            // Heavy traffic area - add a slight cost to encourage path diversity
            const ix = parseInt(x);
            const iy = parseInt(y);
            const currentCost = costMatrix.get(ix, iy);
            if (currentCost < 10) { // Don't increase already high costs
              // Add small cost to high traffic areas without roads
              // Check if there is a road here
              const hasRoad = room.lookForAt(LOOK_STRUCTURES, ix, iy)
                .some(s => s.structureType === STRUCTURE_ROAD);
              
              if (!hasRoad) {
                costMatrix.set(ix, iy, currentCost + 1);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get dynamic reuse path value based on distance and room type
   */
  public static getDynamicReusePath(creep: Creep, target: RoomPosition | { pos: RoomPosition }): number {
    const targetPos = target instanceof RoomPosition ? target : target.pos;
    const distance = creep.pos.getRangeTo(targetPos);
    const analysis = this.analyzeRoom(creep.room);
    
    // Base reuse path on room type
    let baseReuse = defaultMoveOptions[analysis.roomType].reusePath || 20;
    
    // Adjust based on distance
    if (distance < 5) {
      baseReuse = Math.min(baseReuse, 3);
    } else if (distance > 20) {
      baseReuse = Math.max(baseReuse, 30);
    } else {
      baseReuse = Math.max(5, Math.min(baseReuse, distance * 1.5));
    }
    
    // Adjust for cross-room travel
    if (creep.room.name !== targetPos.roomName) {
      baseReuse = Math.min(baseReuse, 20); // Be more cautious with cross-room paths
    }
    
    // Adjust for creep role - static roles can use longer paths
    if (creep.memory.role === 'harvester' || creep.memory.role === 'upgrader') {
      baseReuse = Math.max(baseReuse, 15);
    }
    
    return Math.round(baseReuse);
  }
}