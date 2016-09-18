module.exports = {

  build: function(room) {

    // Tell user we're analyzing the room

    // Determine points of interest
    var POIs = this.pois(room);

    // Determine space around points of interest
    var workingSpace = this.spaceInRoom(POIs, room);

    // Determine roads between points of interest, avoiding workingspace
    var roadsSpace = this.spaceRoadsInRoom(POIs, workingSpace, room);

    if(roadsSpace) {
      // more to come
    }

  },

  spaceRoadsInRoom: function(locationArray, avoidArray, room) {
    var roadsSpace = [];
    for (var i in locationArray) {
      for (var j in locationArray) {
        if (i < j) {
          var road = room.findPath(locationArray[i], locationArray[j], {
            ignoreCreeps: true,
            ignoreDestructibleStructures: false,
            ignoreRoads: true,
            //ignore: [],
            //avoid: avoidArray
          });
          if (!road.length) {
            // no path
          } else {
            for (var k in road) {
              roadsSpace.push(road[k]);
            }
          }
        }
      }
    }

    return roadsSpace;
  },

  spaceInRoom: function(locationArray, room) {
    var workingSpace = [];
    var i = null;
    for (i in locationArray) {
      var locationObject = locationArray[i];
      var x = null;
      for (x = -1; x <= 1; x++) {
        var y = null;
        for (y = -1; y <= 1; y++) {
          if (!(x == 0 && y == 0)) {
            workingSpace.push(
              room.getPositionAt(locationObject.x + x,locationObject.y + y)
            );
          }
        }
      }
    }

    return workingSpace;
  },

  pois: function(room) {
    // Array with points of interest in this room
    var POIs = [];
    // object to add info to before adding to POI
    var positionObj;
    var i;

    // add resources to POIs
    var sources = room.find(FIND_SOURCES);
    for (i in sources) {
      positionObj = sources[i].pos;
      positionObj.type = 'resource';
      positionObj.subType = 'energy';
      positionObj.name = 'resource' + i;
      POIs.push(positionObj);
    }

    // add room controller to POIs
    positionObj = room.controller.pos;
    positionObj.type = 'building';
    positionObj.subType = 'primary';
    positionObj.name = 'controller';
    POIs.push(positionObj);

    // add spawns to POIs
    var spawns = room.find(FIND_MY_SPAWNS);
    for (i in spawns) {
      positionObj = spawns[i].pos;
      positionObj.type = 'building';
      positionObj.subType = 'primary';
      positionObj.name = spawns[i].name;
      POIs.push(positionObj);
    }

    // add minerals to POIs
    var minerals = room.find(FIND_MINERALS);
    for (i in minerals) {
      positionObj = minerals[i].pos;
      positionObj.type = 'mineral';
      positionObj.subType = minerals[i].mineralType;
      positionObj.name = 'mineral' + i;
      POIs.push(positionObj);
    }

    return POIs;
  }

};
