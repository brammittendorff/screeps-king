module.exports = {

    selectClosestTo: function(entity) {
        var room = entity.room;
        console.log(room.name);

        var sources = room.find(FIND_SOURCES);
        console.log('all sources: ' + sources);

        var source = entity.pos.findClosestByRange(sources);
        console.log('closest source: ' + exclude + ' (id: ' + exclude.id + ')');

        if(!source.id) {
            console.log('Resource Selector: Unable to select closest resource (are there any in the room?)');
            return false;
        }
        
        return source.id;
    },

    selectSecondClosestTo: function(entity) {

        var room = entity.room;
        console.log(room.name);

        var sources = room.find(FIND_SOURCES);
        console.log('all sources: ' + sources);

        var exclude = entity.pos.findClosestByRange(sources);
        console.log('closest source: ' + exclude + ' (id: ' + exclude.id + ')');

        var source = entity.pos.findClosestByRange(sources, {
            filter: function(s) {
                return s.id != exclude.id;
            }
        });
        console.log('the 2nd closest: ' + source + ' (id: ' + source.id + ')');

        if(!source.id) {
            console.log(entity.name + 'Resource Selector: Only 1 resource in room. (Using primary instead of secondary)');
            source.id = exclude.id;
        }

        return source.id;
    }

};