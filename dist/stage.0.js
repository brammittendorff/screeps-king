module.exports = {

    run: function(room) {
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
                console.log('STAGE 0: Creating initial harvesters (' + (room.harvesters+1) + '/' + amount + ').');
                avaialableSpawn.createCreep(blueprint.body, blueprint.name, blueprint.memory);
                return;
            }
            console.log('STAGE 0: Unable to create one of first ' + amount + ' harvesters.');
            return;
        }

        // create first <amount> upgraders
        amount = 5;
        if(room.upgraders < amount) {
            var blueprint = require('z.300upgrader');
            var avaialableSpawn = go.findAvailableSpawnInRoom(room);
            if( avaialableSpawn.canCreateCreep(blueprint.body, blueprint.name, blueprint.memory) == 0 ) {
                console.log('STAGE 0: Creating initial upgraders (' + (room.upgraders+1) + '/' + amount + ').');
                avaialableSpawn.createCreep(blueprint.body, blueprint.name, blueprint.memory);
                return;
            }
            console.log('STAGE 0: Unable to create one of first ' + amount + ' upgraders.');
            return;
        }

        if(room.energyAvailable >= 550) {
            console.log('STAGE 0: Advancing to STAGE 1...');
            room.memory.stage = 1;
        }

        return;
    }

};