Object.assign(component, {

  _550upgrader: {

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
    name: 'upgrader' + _.random(1000, 1999),
    memory: {
      role: 'upgrader',
      targetResourceId: null
    }

  }

});
