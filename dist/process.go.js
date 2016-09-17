module.exports = {

    // task creeps according to roles
    taskCreepsByTheirRoles: function(creeps) {

        // go through all creeps in object
        for (var c in creeps) {

            // vars
            var creep = creeps[c];
            var role = creep.memory.role;

            // check if creep has a role
            if (role == undefined) {
                console.log(creep.name + ' doesn\'nt have a role, converting to harvester');
                role = creep.memory.role = 'harvester';
            }

            // load tasker for this creep, according to his role
            try {
                var creepTasker = require('creep.' + role);
            } catch (e) {
                console.log('Process.go: Error loading \'creep.' + role + '\' for \'' + creep.name + '\' in room \'' + creep.room.name + '\'.');
                creepTasker = false;
            }

            // execute creeps tasks
            if (creepTasker) {
                creepTasker.task(creep);
            }
        }

    },

    findAvailableSpawnInRoom: function(room) {
        var spawns = room.find(FIND_MY_SPAWNS);
        for(s in spawns) {
            var spawn = spawns[s];
            if(!spawn.spawning) {
                return spawn;
            }
        }
        return false;
    }

};