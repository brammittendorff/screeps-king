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
            
            try {
                var stage = require('stage.0');
            } catch (e) {
                console.log ('STAGE 0: Error: ' + e.message);
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
            var amount = 2; // no more than spaces for resource closest tot spawn
            if(room.harvesters < amount) {
                var blueprint = require('z.550harvester');
                var avaialableSpawn = go.findAvailableSpawnInRoom(room);
                if( avaialableSpawn.canCreateCreep(blueprint.body, blueprint.name, blueprint.memory) == 0 ) {
                    console.log('STAGE 1: Creating 550 harvester (' + (room.harvesters+1) + '/' + amount + ').');
                    avaialableSpawn.createCreep(blueprint.body, blueprint.name, blueprint.memory);
                    return;
                }
                console.log('STAGE 1: Unable to create one of first ' + amount + ' harvesters.');
                return;
            }

            // create <amount> bigger upgraders
            amount = 5;
            if(room.upgraders < amount) {
                var blueprint = require('z.550upgrader');
                var avaialableSpawn = go.findAvailableSpawnInRoom(room);
                if( avaialableSpawn.canCreateCreep(blueprint.body, blueprint.name, blueprint.memory) == 0 ) {
                    console.log('STAGE 1: Creating 550 upgrader (' + (room.upgraders+1) + '/' + amount + ').');
                    avaialableSpawn.createCreep(blueprint.body, blueprint.name, blueprint.memory);
                    return;
                }
                console.log('STAGE 1: Unable to create one of first ' + amount + ' upgraders.');
                return;
            }

            return;


        }



    }

};