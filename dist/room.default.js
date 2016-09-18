var go = require('process.go');
var resourceSelector = require('select.resource');

module.exports = {

    execute: function(room) {

        /**
         * Every tick
         */
        
        // task creeps
        var creeps = room.find(FIND_MY_CREEPS);
        go.taskCreepsByTheirRoles(creeps);

        // task towers
        var towers = room.find(FIND_MY_STRUCTURES, { filter:
            function(structure) {
                return structure.structureType == STRUCTURE_TOWER;
            }
        });
        try {
            var towerTasker = require('structure.tower');
        } catch (e) {
            console.log('[Roomcontroller] Error: Unable to load tower routine');
        }
        if(towerTasker) {
            for(i in towers) {
                towerTasker.routine(towers[i]);
            }
        }

        /**
         * Conditional proceedings
         *
         * SET STAGE
         */

        if(!room.memory.stage) {
            room.memory.stage = 0;
        }

        /**
         * STAGE 0: Build initial creeps
         */

        if(room.memory.stage == 0) {

            // advance to next room?
            if(room.energyCapacityAvailable >= 550) {
                console.log('[' + room.name + '] STAGE 0: Advancing to STAGE 1...');
                room.memory.stage = 1;
                return;
            }

            // check if enough energy
            if(room.energyAvailable < 300) {
                return;
            }

            // create first <amount> harvesters
            var amount = 3; // no more than spaces for resource closest tot spawn
            if(room.harvesters < amount) {
                var blueprint = require('z.300harvester');
                var avaialableSpawn = go.findAvailableSpawnInRoom(room);
                if( avaialableSpawn.canCreateCreep(blueprint.body, blueprint.name, blueprint.memory) == 0 ) {
                    console.log('[' + room.name + '] STAGE 0: Creating initial harvesters (' + (room.harvesters+1) + '/' + amount + ').');
                    avaialableSpawn.createCreep(blueprint.body, blueprint.name, blueprint.memory);
                    return;
                }
                console.log('[' + room.name + '] STAGE 0: Unable to create one of first ' + amount + ' harvesters.');
                return;
            }

            // create first <amount> upgraders
            amount = 5;
            if(room.upgraders < amount) {
                var blueprint = require('z.300upgrader');
                var avaialableSpawn = go.findAvailableSpawnInRoom(room);
                if( avaialableSpawn.canCreateCreep(blueprint.body, blueprint.name, blueprint.memory) == 0 ) {
                    console.log('[' + room.name + '] STAGE 0: Creating initial upgraders (' + (room.upgraders+1) + '/' + amount + ').');
                    avaialableSpawn.createCreep(blueprint.body, blueprint.name, blueprint.memory);
                    return;
                }
                console.log('[' + room.name + '] STAGE 0: Unable to create one of first ' + amount + ' upgraders.');
                return;
            }

        }

        /**
         * STAGE 1: Build larger creeps
         */

        if(room.memory.stage == 1) {

            if(room.energyAvailable < 550) {
                return;
            }

            // create <amount> bigger harvesters
            var amount = 4; // no more than spaces for resource closest tot spawn
            if(room.harvesters < amount) {
                if(room.energyCapacityAvailable >= 800) {
                    if(room.energyAvailable < 800) {
                      return;
                    }
                    var blueprint = require('z.800harvester');
                } else {
                    var blueprint = require('z.550harvester');
                }
                var avaialableSpawn = go.findAvailableSpawnInRoom(room);
                if( avaialableSpawn.canCreateCreep(blueprint.body, blueprint.name, blueprint.memory) == 0 ) {
                    console.log('STAGE 1: Creating 550 or 800 harvester (' + (room.harvesters+1) + '/' + amount + ').');
                    avaialableSpawn.createCreep(blueprint.body, blueprint.name, blueprint.memory);
                    return;
                }
                console.log('STAGE 1: Unable to create ' + amount + ' harvester.');
                return;
            }

            // create <amount> bigger upgraders
            amount = 5;
            if(room.upgraders < amount) {
                if(room.energyCapacityAvailable >= 800) {
                    if(room.energyAvailable < 800) {
                        return;
                    }
                    var blueprint = require('z.800upgrader');
                } else {
                    var blueprint = require('z.550upgrader');
                }
                var avaialableSpawn = go.findAvailableSpawnInRoom(room);
                if( avaialableSpawn.canCreateCreep(blueprint.body, blueprint.name, blueprint.memory) == 0 ) {
                    console.log('STAGE 1: Creating 550 or 800 upgrader (' + (room.upgraders+1) + '/' + amount + ').');
                    avaialableSpawn.createCreep(blueprint.body, blueprint.name, blueprint.memory);
                    return;
                }
                console.log('STAGE 1: Unable to create ' + amount + ' upgraders.');
                return;
            }

            return;


        }



    }

};