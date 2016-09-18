module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaFeatures": {
            "jsx": true
        },
        "sourceType": "module"
    },
    "rules": {
        "indent": [
            "error",
            2
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "single"
        ],
        "semi": [
            "error",
            "always"
        ]
    },
    "globals": {
      "BODYPART_COST": true,
      "CREEP_LIFE_TIME": true,
      "Game": true,
      "Creep": true,
      "LOOK_CREEPS": true,
      "StructureController": true,
      "StructureExtension": true,
      "StructureLink": true,
      "StructureRampart": true,
      "StructureSpawn": true,
      "StructureTower": true,
      "StructureWall": true,
      "Room": true,
      "RoomPosition": true,
      "Source": true,
      "Spawn": true,
      "Structure": true,
      "Flag": true,
      "MOVE": true,
      "WORK": true,
      "CARRY": true,
      "CLAIM": true,
      "ATTACK": true,
      "RANGED_ATTACK": true,
      "HEAL": true,
      "TOUGH": true,
      "Energy": true,
      "COLOR_YELLOW": true,
      "CONTROLLER_STRUCTURES": true,
      "FIND_CONSTRUCTION_SITES": true,
      "FIND_HOSTILE_SPAWNS": true,
      "FIND_DROPPED_ENERGY": true,
      "FIND_EXIT": true,
      "FIND_FLAGS": true,
      "FIND_HOSTILE_CREEPS": true,
      "FIND_HOSTILE_STRUCTURES": true,
      "FIND_MINERALS": true,
      "FIND_MY_CREEPS": true,
      "FIND_MY_SPAWNS": true,
      "FIND_MY_STRUCTURES": true,
      "FIND_SOURCES": true,
      "FIND_STRUCTURES": true,
      "FIND_HOSTILE_CONSTRUCTION_SITES": true,
      "FIND_MY_CONSTRUCTION_SITES": true,
      "FIND_HOSTILE_SPAWNS": true,
      "RESOURCE_ENERGY": true,
      "STRUCTURE_CONTAINER": true,
      "STRUCTURE_EXTENSION": true,
      "STRUCTURE_EXTRACTOR": true,
      "STRUCTURE_LINK": true,
      "STRUCTURE_OBSERVER": true,
      "STRUCTURE_RAMPART": true,
      "STRUCTURE_ROAD": true,
      "STRUCTURE_SPAWN": true,
      "STRUCTURE_STORAGE": true,
      "STRUCTURE_TERMINAL": true,
      "STRUCTURE_TOWER": true,
      "STRUCTURE_WALL": true,
      "Memory": true,
      "TOP": true,
      "TOP_RIGHT": true,
      "RIGHT": true,
      "BOTTOM_RIGHT": true,
      "BOTTOM": true,
      "BOTTOM_LEFT": true,
      "LEFT": true,
      "TOP_LEFT": true,
      "ERR_NOT_IN_RANGE": true,
      "_": true,
      "component": true
    }
};
