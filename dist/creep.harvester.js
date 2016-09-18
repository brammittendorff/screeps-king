var resourceSelector = require('select.resource');


module.exports = {

    /** @param {Creep} creep **/
    task: function(creep) {

        //vars
        var buildingTemplate = require('build.' + creep.room.template);

        // initiate
        if(!creep.memory.initiated) {
            creep.memory.activity = 'harvesting';
            creep.memory.targetSourceId = resourceSelector.selectClosestTo(creep);
            creep.memory.initiated = true;
            creep.say('Work Work!');
        }

        // When full, change this creeps harvesting spot and switch to upgrading
        if(creep.memory.activity == 'harvesting') {
            if(creep.carryCapacity != creep.carry.energy) {
                var targetSource = Game.getObjectById(creep.memory.targetSourceId);
                if(creep.harvest(targetSource) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targetSource);
                    return;
                }
            } else {
                creep.memory.activity = 'unloading';
                creep.say('Unloading!');
            }
        }

        // When done upgrading, switch to harvesting
        if(creep.memory.activity == 'unloading') {
            // when not empty, transfer energy to target
            if(creep.carry.energy != 0) {

                // priority order
                var structuresPriority = [
                    STRUCTURE_TOWER,
                    STRUCTURE_EXTENSION,
                    STRUCTURE_SPAWN
                ];

                // select targets in order // todo: add structures per type in room object (maybe not even per tick but per event update their state)
                var targets = [];
                for (i in structuresPriority) {
                    var targetsOfOneType = creep.room.find(FIND_MY_STRUCTURES, {
                        filter: function (structure) {
                            return (structure.energy < structure.energyCapacity) && (structure.structureType == structuresPriority[i]);
                        }
                    });
                    for (j in targetsOfOneType) {
                        targets.push(targetsOfOneType[j]);
                    }
                }

                // transfer energy to first selected target (because they are in priority order)
                if(targets.length > 0) {
                    if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(targets[0]);
                        return;
                    }
                } else {
                    creep.memory.activity = 'building';
                    //creep.say('Work Work!');
                }
            } else {
                creep.memory.activity = 'harvesting';
                creep.say('Need moarr!');
            }
        }

        // when energy is full, switch to building/repairing
        if(creep.memory.activity == 'building') {
            // when not empty, start building/repairing
            if(creep.carry.energy != 0) {
                // what was i doing exactly?
                if(!creep.memory.buildMode) {
                    creep.memory.buildMode = _.random(1,2); // 1 = build, 2 = repair
                    switch(creep.memory.buildMode) {
                        case 1:  creep.say('Build!'); break;
                        case 2:  creep.say('Repair!'); break;
                        default: creep.say('Huh?!'); break;
                    }
                }
                // build
                if(creep.memory.buildMode == 1) {
                    var targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
                    if(targets.length > 0) {
                        if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(targets[0]);
                            return;
                        }
                    } else {
                        // create new building if needed
                        console.log('[' + creep.room.name + '] Build Queue is empty! todo=autobuild');
                        buildingTemplate.build(creep.room);

                        // todo: need a good way to handle building, otherwise go back to harvesting
                        //if(creep.carry.energy < creep.carryCapacity) {
                            creep.memory.activity = 'harvesting';
                        //}

                    }
                }
                // repair
                if(creep.memory.buildMode == 2) {
                    console.log('buildmode repair');
                    var targets = creep.room.find(FIND_MY_STRUCTURES, {
                        filter: function(structure) {
                            return ( structure.hits < structure.hitsMax )
                        }
                    });
                    console.log('repair targets: ' + targets);
                    if(targets.length) {
                        console.log(targets[0].name);
                        if(creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(targets[0]);
                            return;
                        }
                    } else {
                        // nothing to repair, back to buildmode
                        creep.say('Build.');
                        creep.memory.buildMode = 1;
                    }
                }
            } else {
                creep.memory.buildMode = false;
                creep.memory.activity = 'harvesting';
                creep.say('Need moarr!');
            }
        }

    }

};