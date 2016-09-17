module.exports.loop = function () {

    // Foreach room:
    for(var r in Game.rooms) {
        var room = Game.rooms[r];

        // definitions that are needed for all rooms
        // count entities, save to object & memory.
        room.harvesters    = room.memory.harvesters    = _(room.find(FIND_MY_CREEPS)).filter({memory: {role: 'harvester'}}).size();
        room.upgraders     = room.memory.upgraders     = _(room.find(FIND_MY_CREEPS)).filter({memory: {role: 'upgrader'}}).size();
        room.builders      = room.memory.builders      = _(room.find(FIND_MY_CREEPS)).filter({memory: {role: 'builder'}}).size();
        room.structures    = room.memory.structures    = _(room.find(FIND_MY_STRUCTURES)).size();
        room.spawns        = room.memory.spawns        = _(room.find(FIND_MY_SPAWNS)).size();
        room.constructions = room.memory.constructions = _(room.find(FIND_MY_CONSTRUCTION_SITES)).size();

        // set template according to rooms memory
        if( !room.memory.template ) {
            console.log('Room \'' + room.name + '\': I have no template. Setting my template to \'default\'.');
            room.template = room.memory.template = 'default';
        } else {
            room.template = room.memory.template;
        }

        // require room template
        try {
            var template = require('room.' + room.template);
        } catch (e) {
            console.log('Room \'' + room.name + '\': Template error - ' + e.message);
            console.log('Room \'' + room.name + '\': Trying to process with default template.');
            try {
                var template = require('room.default');
            } catch(e) {
                console.log('Room \'' + room.name + '\': Default template does not exist.');
                template = false;
            }
        }

        // process room according to template
        if(template) {
            template.execute(room);
        } else {
            console.log('Room \'' + room.name + '\': Skipping.');
        }

    }
};