module.exports = {

    selectClosestTo: function(entity) {
        var room = entity.room;
        var sources = room.find(FIND_SOURCES);
        var source = entity.pos.findClosestByRange(sources);
        //console.log('closest source: ' + source + ' (id: ' + source.id + ')');

        if(!source.id) {
            console.log('[' + entity.room.name + '] ' + entity.name + ': Unable to select resource, are there any?');
            return false;
        }
        return source.id;
    },

    selectSecondClosestTo: function(entity) {

        var room = entity.room;
        var sources = room.find(FIND_SOURCES);
        var exclude = entity.pos.findClosestByRange(sources);
        var source = entity.pos.findClosestByRange(sources, {
            filter: function(s) {
                return s.id != exclude.id;
            }
        });
        //console.log('the 2nd closest: ' + source + ' (id: ' + source.id + ')');

        if(!source.id) {
            console.log('[' + entity.room.name + '] ' + entity.name + ': Only 1 resource in room. (Using primary instead of secondary)');
            source.id = exclude.id;
        }

        return source.id;
    }

};