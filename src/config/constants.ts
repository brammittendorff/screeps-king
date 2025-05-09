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
      0: 0,  // RCL 0
      1: 1,  // RCL 1
      2: 2,  // RCL 2
      3: 2,  // RCL 3
      4: 2,  // RCL 4
      5: 1,  // RCL 5
      6: 1,  // RCL 6
      7: 1,  // RCL 7
      8: 1   // RCL 8
    },
    
    DESIRED_UPGRADERS: {
      0: 0,  // RCL 0
      1: 1,  // RCL 1
      2: 2,  // RCL 2
      3: 3,  // RCL 3
      4: 3,  // RCL 4
      5: 2,  // RCL 5
      6: 1,  // RCL 6
      7: 1,  // RCL 7
      8: 1   // RCL 8
    },
    
    DESIRED_HARVESTERS: {
      0: 0,  // RCL 0
      1: 2,  // RCL 1
      2: 2,  // RCL 2
      3: 2,  // RCL 3
      4: 2,  // RCL 4
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
  }
};