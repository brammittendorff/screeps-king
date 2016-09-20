Object.assign(component, {

  resource: {

    selectClosestTo: function (entity) {
      var room = entity.room;
      var sources = room.find(FIND_SOURCES);
      var source = entity.pos.findClosestByRange(sources);

      if (!source.id) {
        return false;
      }

      return source.id;
    },

    selectSecondClosestTo: function (entity) {

      var room = entity.room;
      var sources = room.find(FIND_SOURCES);
      var exclude = entity.pos.findClosestByRange(sources);
      var source = entity.pos.findClosestByRange(sources, {
        filter: function (src) {
          return src.id != exclude.id;
        },
      });

      if (!source.id) {
        source.id = exclude.id;
      }

      return source.id;
    },

  }

});
