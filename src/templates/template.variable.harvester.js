Object.assign(component, {

  variableHarvester: {

    generate: function (energy) {

      if(energy) {
        // something
      }
      // var component, components = this.settings.components;
      // var i;
      // var name;
      // var build = {
      //   components: []
      // };
      //
      // // minimum components
      // for (name in components) {
      //   if (Object.hasOwnProperty(name)) {
      //     component = components[name];
      //     for (i = 0; i < component.min; i++) {
      //       build.components.push(component.value);
      //       build[component.name] += 1;
      //       build.initialSize += component.cost;
      //       build.chunkSize += (component.cost * component.ratio);
      //     }
      //   }
      // }
      // var energyLeft = energy - build.initialSize;
      // for (name in components) {
      //   if(Object.hasOwnProperty(name)) {
      //     component = components[name];
      //     var ratio = build.chunkSize / (component.size * component.ratio);
      //   }
      // }

    },

    components: [
      {
        name: 'move',
        value: MOVE,
        cost: 50,
        min: 1,
        ratio: 1,
        max: 10
      },
      {
        name: 'work',
        value: WORK,
        cost: 100,
        min: 1,
        ratio: 4,
        max: 999
      },
      {
        name: 'carry',
        value: CARRY,
        cost: 50,
        min: 1,
        ratio: 2,
        max: 999
      }
    ],
    settings: {
      name: 'harvester' + _.random(1000, 1999),
      memory: {
        role: 'harvester',
        targetSourceId: null,
        iAmOld: false,
      }
    },

  }

});