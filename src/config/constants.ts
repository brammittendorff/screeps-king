/**
 * Game constants and configuration
 */

export const CONFIG = {
  // Game version - increment when making major changes
  VERSION: 3,
  
  // Build ID is defined at build time
  BUILD_ID: BUILD_ID || new Date().getTime().toString(36),
  
  // CPU usage thresholds
  CPU: {
    CRITICAL_BUCKET: 1000,
    LOW_BUCKET: 3000,
    TARGET_BUCKET: 8000,
    CRITICAL_USAGE: 0.8, // 80% of limit
    MAX_USAGE: 0.95     // 95% of limit
  },
  
  // Creep defaults
  CREEP: {
    DEFAULT_LIFESPAN: 1500,
    RENEW_THRESHOLD: 0.7,   // Renew at 70% of lifespan
    MAX_PATH_LENGTH: 50,
    PATH_REUSE_TICKS: 50
  },
  
  // Room control
  ROOM: {
    MIN_ENERGY_CAPACITY: 300,
    BASIC_ENERGY_CAPACITY: 550,
    INTERMEDIATE_ENERGY_CAPACITY: 800,
    ADVANCED_ENERGY_CAPACITY: 1300,
    
    DESIRED_BUILDERS: {
      1: 2,
      2: 3,
      3: 4,
      4: 5,
      5: 1,  // RCL 5
      6: 1,  // RCL 6
      7: 1,  // RCL 7
      8: 1   // RCL 8
    },
    
    DESIRED_UPGRADERS: {
      1: 5,
      2: 5,
      3: 6,
      4: 8,
      5: 2,  // RCL 5
      6: 1,  // RCL 6
      7: 1,  // RCL 7
      8: 1   // RCL 8
    },
    
    DESIRED_HARVESTERS: {
      1: 3, // RCL 1 = Initial
      2: 4, // RCL 2 = Basic
      3: 4, // RCL 3 = Intermediate
      4: 2, // RCL 4 = Advanced
      5: 2,  // RCL 5
      6: 2,  // RCL 6
      7: 2,  // RCL 7
      8: 2   // RCL 8
    }
  },
  
  // Visual settings
  VISUALS: {
    SHOW_CPU: true,
    SHOW_STATS: true,
    SHOW_PATHS: true
  },
  
  // Log settings
  LOG: {
    LEVEL: 'info',  // debug, info, warn, error
    SHOW_TICK: true
  },
  
  // Task priorities
  TASK_PRIORITY: {
    DEFENSE: 100,
    HARVEST: 90,
    STRUCTURE_ENERGY: 80,
    CONSTRUCTION: 70,
    UPGRADE_CONTROLLER: 60,
    REPAIR: 50,
    WALLS: 40
  },

  // Defense settings
  DEFENSE: {
    HOSTILES_THRESHOLD: 3, // Number of hostiles to trigger emergency
    RAMPART_CRITICAL_HITS: 1000, // Rampart hits to trigger emergency
    DEFENDER_MIN: 2, // Minimum defenders to spawn in emergency
    DEFENDER_MAX: 5, // Maximum defenders to spawn in emergency
    NOTIFY_INTERVAL: 100, // Minimum ticks between notifications
    AUTO_SAFE_MODE: true, // Enable automatic safe mode
    SAFE_MODE_CRITICAL_STRUCTURES: ['spawn', 'storage', 'controller'], // Structures to protect
    BOOSTED_DETECTION: true, // Enable boosted hostile detection
    BOOSTED_RESPONSE_MULTIPLIER: 2 // Multiplier for defenders/tower focus if boosted hostiles present
  }
};

export const EXPANSION_CONFIG = {
  weights: {
    sources2: 20,
    sources1: 5,
    mineralBase: 5,
    mineralNew: 20,
    mineralDuplicate: 2,
    mineralExtractor: 10,
    mineralCooldown: -10,
    mineralMarketHigh: 10,
    mineralMarketMed: 5,
    mineralMarketLow: -5,
    mineralValue: {
      [RESOURCE_CATALYST]: 30,
      [RESOURCE_ZYNTHIUM]: 20,
      [RESOURCE_KEANIUM]: 20,
      [RESOURCE_UTRIUM]: 15,
      [RESOURCE_LEMERGIUM]: 15,
      [RESOURCE_HYDROGEN]: 5,
      [RESOURCE_OXYGEN]: 5
    },
    proximity: 10,
    proximityFar: -10,
    openTerrain: 1,
    swamp: -2,
    hostileStructures: -20,
    hostileOwnership: -100,
    sourceKeeper: -50,
    highway: -20,
    border: -10,
    enemyNearby: -30,
    enemyStrong: -50,
    connectsRooms: 15,
    sector: 10,
    sectorFar: -10
  },
  preferredSectors: [
    // Example: 'W10N20', 'W20N30'
  ],
  blacklistedSectors: [
    // Example: 'E0N0', 'W0S0'
  ]
};