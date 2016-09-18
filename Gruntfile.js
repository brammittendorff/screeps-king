module.exports = function(grunt) {

  // load npm tasks
  grunt.loadNpmTasks('grunt-screeps');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-eslint');

  // unix LF
  grunt.util.linefeed = '\n';

  // grunt init config
  grunt.initConfig({
    concat: {
      options: {
        banner: 'var component = {};\n\n',
        footer: '\nmodule.exports = component;'
      },
      dist_ai: {
        src: ['src/ai/*.js'],
        dest: 'dist/ai.js'
      },
      dist_templates: {
        src: ['src/templates/*.js'],
        dest: 'dist/templates.js'
      }
    },
    eslint: {
      target: ['dist/*.js', 'src/*/*.js']
    },
    screeps: {
      options: {
        email: process.env.SCREEPS_EMAIL,
        password: process.env.SCREEPS_PASSWORD,
        branch: 'my-screeps'
      },
      dist: {
        src: ['dist/*.js']
      }
    },
    watch: {
      scripts: {
        files: ['src/*/*.js'],
        tasks: ['eslint', 'concat', 'screeps'],
        options: {
          interrupt: false
        }
      }
    }
  });

  // register tasks
  grunt.registerTask('default', ['eslint', 'concat', 'screeps']);
  grunt.registerTask('sync', ['eslint', 'concat', 'screeps']);

};
