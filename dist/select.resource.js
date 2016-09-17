module.exports = {

    selectClosestTo: function(entity) {
        var source = entity.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        return source.id;
    },

    selectSecondClosestTo: function(entity) {
        var sources = entity.room.find(FIND_SOURCES);
        var exclude = entity.pos.findClosestByPath(FIND_SOURCES);
        var source = _.find(sources, function(source) {
            return source.id != exclude.id
        });

        if(!source) {
            exclude.id = source
        }
        return source;
    }

};
