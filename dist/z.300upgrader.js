module.exports = {
    body: [MOVE, WORK, WORK, CARRY],
    name: 'upgrader'+_.random(1000, 1999),
    memory: {
        role: 'upgrader',
        targetResourceId: null
    }
};