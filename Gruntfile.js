module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-screeps');
    grunt.loadNpmTasks('grunt-contrib-watch');
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
        },
        watch: {
            scripts: {
                files: ['dist/*.js'],
                tasks: ['screeps'],
                options: {
                    interrupt: false
                }
            }
        }
    });
    grunt.registerTask('default', 'screeps');


}
