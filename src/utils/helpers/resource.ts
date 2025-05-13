import * as _ from 'lodash';

export const resourceHelpers = {
  selectClosestTo: function(entity) {
    try {
      if (!entity || !entity.room) return null;
      const sources = entity.room.find(FIND_SOURCES);
      if (!sources || sources.length === 0) return null;
      const source = entity.pos.findClosestByRange(sources);
      return source ? source.id : null;
    } catch (e) {
      console.log(`Error finding closest source: ${e}`);
      return null;
    }
  },
  selectSecondClosestTo: function(entity) {
    try {
      if (!entity || !entity.room) return null;
      const sources = entity.room.find(FIND_SOURCES);
      if (!sources || sources.length === 0) return null;
      if (sources.length === 1) return sources[0].id;
      const closest = entity.pos.findClosestByRange(sources);
      if (!closest) return sources[0].id;
      const filtered = _.filter(sources, s => s.id !== closest.id);
      if (filtered.length === 0) return closest.id;
      const second = entity.pos.findClosestByRange(filtered);
      return second ? second.id : sources[0].id;
    } catch (e) {
      console.log(`Error finding second closest source: ${e}`);
      return null;
    }
  }
}; 