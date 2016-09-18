module.exports = {
  body: [
    MOVE,
    RANGED_ATTACK,
    TOUGH,
    TOUGH,
    TOUGH,
    TOUGH,
    TOUGH,
    TOUGH,
    TOUGH,
    TOUGH,
    TOUGH,
    TOUGH
  ],
  name: 'archer' + _.random(1000, 1999),
  memory: {
    role: 'archer',
    targetResourceId: null,
    directive: null
  }
};
