module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-screeps');
    grunt.loadNpmTasks('grunt-env');
    grunt.initConfig({
        screeps: {
            options: {
                email: process.env.EMAIL,
                password: process.env.PASSWORD,
                branch: 'my-screeps'
            },
            dist: {
                src: ['dist/*.js']
            }
        }
    });
}
