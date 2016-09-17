module.exports = {

    /** @param {Creep} creep **/
    task: function(creep) {

        var closest, targets = creep.room.find(FIND_HOSTILE_CREEPS);

        if(targets > 0) {

            closest = targets.findClosestByRange(FIND_HOSTILE_CREEPS);
            if(creep.distanceTo(closest) < something) {
                //attack
            } else {
                closest = targets.findClosestByPath(FIND_HOSTILE_CREEPS);
                //creep.moveTo(closest);
            }

        } else {

            // move back to center

        }

    }

};