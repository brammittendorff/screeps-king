Object.assign(component, {

  _550harvester: {

    body: [
      MOVE,
      MOVE,
      MOVE,
      WORK,
      WORK,
      WORK,
      CARRY,
      CARRY
    ],
    name: 'harvester' + _.random(1000, 1999),
    memory: {
      role: 'harvester',
      targetResourceId: null
    }

  }

});
