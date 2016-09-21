module.exports = function (grunt) {

  // load npm tasks
  grunt.loadNpmTasks('grunt-screeps');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-eslint');
  grunt.loadNpmTasks('grunt-jscs');

  // unix LF
  grunt.util.linefeed = '\n';

  // register tasks
  grunt.registerTask('sync', ['concat', 'eslint', 'screeps']);

  // grunt init config
  grunt.initConfig({
    concat: {
      options: {
        banner: 'var component = {};\n\n',
        footer: '\nmodule.exports = component;',
      },
      dist_ai: {
        src: ['src/ai/*.js'],
        dest: 'dist/ai.js',
      },
      dist_config: {
        src: ['src/config/*.js'],
        dest: 'dist/config.js'
      },
      dist_controller: {
        src: ['src/controllers/*.js'],
        dest: 'dist/controllers.js',
      },
      dist_functions: {
        src: ['src/functions/*.js'],
        dest: 'dist/functions.js',
      },
      dist_patterns: {
        src: ['src/patterns/*.js'],
        dest: 'dist/patterns.js',
      },
      dist_templates: {
        src: ['src/templates/*.js'],
        dest: 'dist/templates.js',
      },
      dist_main: {
        options: {
          banner: '',
          footer: '',
        },
        src: 'src/main.js',
        dest: 'dist/main.js',
      }
    },
    eslint: {
      target: ['dist/*.js', 'src/*/*.js'],
    },
    screeps: {
      options: {
        email: process.env.SCREEPS_EMAIL,
        password: process.env.SCREEPS_PASSWORD,
        branch: 'my-screeps',
      },
      dist: {
        src: ['dist/*.js'],
      },
    },
    watch: {
      scripts: {
        files: ['src/*/*.js'],
        tasks: ['sync'],
        options: {
          interrupt: false,
        },
      },
    },
  });



};
