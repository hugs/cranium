#!/usr/bin/env node

/**
 * Main module
 */

var Project = require('./lib/project')
  , config = require('./lib/config')
  , customUtils = require('./lib/customUtils')
  , async = require('async')
  , fs = require('fs')
  , path = require('path')
  , server = require('./server')
  , db = require('./lib/db')
  , projectTypes = {}
  ;


/**
 * Initialize the list of project types
 * For now no plugin system is implemented, we only look at modules in the ./lib/projectTypes directory
 * @param {Function} callback Signature: err
 */
function initializeProjectTypes (callback) {
  var nativeProjectTypesDirectory = './lib/projectTypes';

  fs.readdir(nativeProjectTypesDirectory, function (err, files) {
    if (err) { return callback(err); }

    async.each(files, function (file, cb) {
      var moduleName = path.join(nativeProjectTypesDirectory, file).replace(/\.js$/, '')
        , projectType
        ;

      if (!moduleName.match(/^\.\//)) {
        moduleName = './' + moduleName;
      }

      try {
        projectType = require(moduleName);
      } catch (e) {
        projectType = {};
      }

      if (projectType.populateBuildingSequence) {
        projectTypes[projectType.name] = projectType.populateBuildingSequence;
      }

      return cb();
    }, callback);
  });
}


/**
 * Get all project types
 */
function getAllProjectTypes () {
  return projectTypes;
}


/**
 * Initialize the application
 */
function init (callback) {
  customUtils.ensureDirectoryExists(config.workspace, function (err) {
    if (err) { return callback("Couldn't ensure the workspace exists: " + err.toString()); }

    db.initialize(function (err) {
      if (err) { return callback("Couldn't initialize the database"); }

      initializeProjectTypes(function (err) {
        server.launchServer(callback);
      });
    });
  });
}


/*
 * If we executed this module directly, launch the server.
 * If not, let the module which required server.js launch it.
 */
if (module.parent === null) {
  init(function (err) {
    if (err) {
      console.log("An error occured, logging error and stopping the server");
      console.log(err);
      process.exit(1);
    } else {
      console.log('Workspace found. Server started on port ' + config.serverPort);
    }
  });
}


// Interface
module.exports.getAllProjectTypes = getAllProjectTypes;
module.exports.init = init;
