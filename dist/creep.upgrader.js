var resourceSelector = require('select.resource');

module.exports = {

    /** @param {Creep} creep **/
    task: function(creep) {

        // initiate
        if(!creep.memory.initiated) {
            creep.memory.activity = 'harvesting';
            creep.memory.targetSourceId = resourceSelector.selectSecondClosestTo(creep);
            creep.memory.initiated = true;
            creep.say('++RCL;');
        }

        // When full, change this creeps harvesting spot and switch to upgrading
        if(creep.memory.activity == 'harvesting') {
            if(creep.carryCapacity != creep.carry.energy) {
                var targetSource = Game.getObjectById(creep.memory.targetSourceId);
                if(creep.harvest(targetSource) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targetSource);
                }
            } else {
                creep.memory.activity = 'upgrading';
                creep.say('Upgrading!');
            }
        }

        // When done upgrading, switch to harvesting
        if(creep.memory.activity == 'upgrading') {
            var controller = creep.room.controller;
            if(creep.carry.energy != 0) {
                if(creep.upgradeController(controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(controller);
                }
            } else {
                creep.memory.activity = 'harvesting';
                creep.say('Crystals!');
            }
        }

    }

};