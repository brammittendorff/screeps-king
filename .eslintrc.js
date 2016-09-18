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
      "ATTACK": true,
      "CARRY": true,
      "ERR_FULL": true,
      "ERR_NOT_IN_RANGE": true,
      "FIND_CONSTRUCTION_SITES": true,
      "FIND_DROPPED_ENERGY": true,
      "FIND_HOSTILE_CREEPS": true,
      "FIND_MY_CREEPS": true,
      "FIND_MY_STRUCTURES": true,
      "FIND_SOURCES": true,
      "FIND_STRUCTURES": true,
      "Game": true,
      "HEAL": true,
      "MOVE": true,
      "Memory": true,
      "OK": true,
      "RANGED_ATTACK": true,
      "STRUCTURE_CONTROLLER": true,
      "STRUCTURE_EXTENSION": true,
      "STRUCTURE_RAMPART": true,
      "STRUCTURE_ROAD": true,
      "STRUCTURE_SPAWN": true,
      "STRUCTURE_STORAGE": true,
      "STRUCTURE_TOWER": true,
      "STRUCTURE_WALL": true,
      "TOUGH": true,
      "WORK": true,
      "_": true
    },
};
