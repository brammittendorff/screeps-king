module.exports = {

    build: function(room) {

        // Tell user we're analyzing the room
        // console.log('Build \'Default\': Analyzing what next building should be.');

        // Determine points of interest
        var POIs = this.determinePOIs(room);
        //console.log('POIs: ' + JSON.stringify(POIs));

        // Determine space around points of interest
        var workingSpace = this.determineSpaceAroundLocationObjectsArrayInRoom(POIs, room);
        //console.log('Workspace: ' + JSON.stringify(workingSpace));

        // Determine roads between points of interest, avoiding workingspace, within this room
        var roadsSpace = this.determineSpaceForRoadsBetweenLocationObjectsArrayAvoidingLocationsObjectsArrayInRoom(POIs, workingSpace, room);

        // roadsSpace[0]. //build road

    },

    determineSpaceForRoadsBetweenLocationObjectsArrayAvoidingLocationsObjectsArrayInRoom: function(locationObjectsArray, avoidLocationObjectsArray, room) {
        var roadsSpace = [];
        for(var i in locationObjectsArray) {
            for(var j in locationObjectsArray) {
                if( i < j ) {
                    // findPath: Find an optimal path inside the room between fromPos and toPos using A* search algorithm.
                    var road = room.findPath(locationObjectsArray[i], locationObjectsArray[j], {
                        ignoreCreeps: true,
                        ignoreDestructibleStructures: false,
                        ignoreRoads: true,
                        // These options option cannot be used when `PathFinder.use()` is enabled.
                        //ignore: [],                       
                        //avoid: avoidLocationObjectsArray
                    });
                    if(!road.length) {
                        console.log('Error: No path: ' +
                            'FROM x:' + locationObjectsArray[i].x + ', y:' + locationObjectsArray[i].y +
                             ' TO x:' + locationObjectsArray[j].x + ', y:' + locationObjectsArray[j].y
                        );
                    } else {
                        for(var k in road) {
                            roadsSpace.push(road[k]);
                        }
                    }
                }
            }
        }

        return roadsSpace;
    },

    determineSpaceAroundLocationObjectsArrayInRoom: function(locationObjectsArray, room) {
        var workingSpace = [];
        for( i in locationObjectsArray) {
            var locationObject = locationObjectsArray[i];
            // positions around x and y, using -1, 0, +1, every possible case except the original location itself
            for (x = -1; x <= 1; x++) {
                for ( y = -1; y <= 1; y++) {
                    if(!(x == 0 && y == 0)) {
                        workingSpace.push(room.getPositionAt(locationObject.x+x,locationObject.y+y));
                    }
                }
            }
        }

        return workingSpace;
    },
    
    determinePOIs: function(room) {
        // Array with points of interest in this room
        var POIs = [];
        // object to add info to before adding to POI
        var positionObj;
        var i;

        // add resources to POIs
        var sources = room.find(FIND_SOURCES);
        for (i in sources ) {
            positionObj = sources[i].pos;
            positionObj.type = 'resource';
            positionObj.subType = 'energy';
            positionObj.name = 'resource'+i;
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
        for (i in minerals ) {
            positionObj = minerals[i].pos;
            positionObj.type = 'mineral';
            positionObj.subType = minerals[i].mineralType;
            positionObj.name = 'mineral' + i;
            POIs.push(positionObj);
        }
        
        return POIs;
    }

};