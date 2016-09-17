module.exports = {

    selectClosestTo: function(entity) {
        var source = entity.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        //console.log(source.id);
        return source.id;
    },

    selectSecondClosestTo: function(entity) {
        var sources = entity.room.find(FIND_SOURCES);
        var exclude = entity.pos.findClosestByPath(FIND_SOURCES);
        var source = _.find(sources, function(source) { return source != exclude });
        
        if(!source.id) {
            exclude.id = source.id
        }
        //console.log(source.id);
        return source.id;
    }

};