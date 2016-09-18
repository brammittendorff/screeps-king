Object.assign(component, {

  archer: {

    task: function (creep) {

      var closest = creep.room.find(FIND_HOSTILE_CREEPS);
      var targets = closest;

      if (targets > 0) {

        closest = targets.findClosestByRange(FIND_HOSTILE_CREEPS);
        var something = true;
        if (creep.distanceTo(closest) < something) {
          //attack
        } else {
          closest = targets.findClosestByPath(FIND_HOSTILE_CREEPS);
          //creep.moveTo(closest);
        }

      } else {

        // move back to center

      }

    }

  }

});
