module.exports = {

    /**
     * @see: http://support.screeps.com/hc/en-us/articles/203339002-Defending-your-room
     * @todo: make generic, so creeps can use it too (attack vs rangedattack, heal/repair, outofrange=moveto)
     */

    routine: function(entity) {

        var targets, room = entity.room;

        /**
         * priority order
         */

        // things to always shoot at
        if( entity.energy > 0 ) {

            // attack enemy military creeps //FIND_HOSTILE_CREEPS // todo: make distinction between unit types
            targets = room.find(FIND_HOSTILE_CREEPS);
            if(targets.length) {
                this.attackClosestTarget(entity, targets);
            }

            // attack enemy military structures //STRUCTURE_TOWER
            targets = room.find(FIND_HOSTILE_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
            if(targets.length) {
                this.attackClosestTarget(entity, targets);
            }

        }

        if( entity.energy > entity.energyCapacity/4 ) {

            // attack hostile construction sites //FIND_HOSTILE_CONSTRUCTION_SITES
            targets = room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
            if (targets.length) {
                this.attackClosestTarget(entity, targets);
            }

            // heal friendly military creeps // todo: actually go for military unites
            targets = room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
            if (targets.length) {
                this.healClosestTarget(entity, targets);
            }

        }

        if( entity.energy > entity.energyCapacity/2 ) {

            // attack enemy primary structures //STRUCTURE_TOWER
            targets = room.find(FIND_HOSTILE_SPAWNS);
            if(targets.length) {
                this.attackClosestTarget(entity, targets);
            }

            // attack enemy //FIND_HOSTILE_STRUCTURES
            targets = room.find(FIND_HOSTILE_STRUCTURES);
            if(targets.length) {
                this.attackClosestTarget(entity, targets);
            }

            targets = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
            if(targets.length) {
                this.repairClosestTarget(entity, targets);
            }

        }

        if( entity.energy > (entity.energyCapacity/4)*3 ) {

            // heal friendly non-military creeps
            targets = room.find(FIND_MY_CREEPS);
            if(targets.length) {
                this.healClosestTarget(entity, targets);
            }

            // heal friendly non-essential buildings
            targets = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
            if(targets.length) {
                this.repairClosestTarget(entity, targets);
            }

            // heal roads or any kind that is damaged // todo, filter better, more
            targets = room.find(FIND_STRUCTURES, {
                filter: function(structure) {
                    return structure.hits < structure.hitsMax && structure.structureType != STRUCTURE_WALL
                }
            });
            if(targets.length) {
                this.repairClosestTarget(entity, targets);
            }

        }

        if( entity.energy >= (entity.energyCapacity-100) ) {

            // generate walls using heal
            targets = room.find(FIND_STRUCTURES, {
                filter: function(structure) {
                    return structure.hits < structure.hitsMax;
                }
            });
            if(targets.length) {
                this.repairClosestTarget(entity, targets);
            }
        }

    },

    attackClosestTarget: function(entity, targets) {
        var target = entity.pos.findClosestByRange(targets);
        entity.attack(target);
    },

    healClosestTarget: function(entity, targets) {
        var target = entity.pos.findClosestByRange(targets);
        entity.heal(target);
    },

    repairClosestTarget: function(entity, targets) {
        var repairCode = entity.repair(targets[0]);
        //var target = entity.pos.findClosestByRange(targets);
        //var repairCode =  entity.repair(Game.getObjectById(target.id));
        if(repairCode != 0) {
            console.log('Repair failed with code: (' + repairCode + ').');
        };
    }

}