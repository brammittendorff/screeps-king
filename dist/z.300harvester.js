module.exports = {
    body: [MOVE, WORK, WORK, CARRY],
    name: 'harvester'+_.random(1000, 1999),
    memory: {
        role: 'harvester',
        targetResourceId: null
    }
};