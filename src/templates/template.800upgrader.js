Object.assign(component, {

  _800upgrader: {

    body: [
      MOVE,
      MOVE,
      MOVE,
      MOVE,
      WORK,
      WORK,
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
