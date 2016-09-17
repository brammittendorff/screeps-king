module.exports = {
    body: [MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, CARRY, CARRY],
    name: 'harvester'+_.random(1000, 1999),
    memory: {
        role: 'harvester',
        targetResourceId: null
    }
};