/**
 * Responsible for queuing and executing builds
 * Also, the name is kinda cool. Like some bad guy in a movie.
 * This ensures at most one build is executed at any given time
 */

var buildsQueue = []
  , Project = require('./project')
  , Stream = require('stream')
  , currentProject = null
  , logStream
  ;


/**
 * Register a new build for project 'name' at the end of the execution queue
 */
function registerBuild (name) {
  buildsQueue.push(name);

  if (!currentProject) {
    launchNextQueuedBuild();
  }
}


/**
 * Launch the next queued build
 */
function launchNextQueuedBuild () {
  if (buildsQueue.length === 0) {
    currentProject = null;
  } else {
    Project.getProject(buildsQueue.shift(), function (err, project) {
      // In some edge cases (project was renamed after build was scheduled), the project can be not found
      // In that case, simply launch the next build
      if (err || !project) { return launchNextQueuedBuild(); }

      currentProject = {};
      currentProject.name = project.name;
      currentProject.buildNumber = project.nextBuildNumber;
      currentProject.log = "";

      logStream = new Stream();
      logStream.writable = true;
      logStream.write = function (data) {
        currentProject.log += data;
        return true;
      };

      project.build(logStream, launchNextQueuedBuild);
    });
  }
}


/**
 * Get info about the state of the executor
 */
function getQueueState () { return buildsQueue; }
function getCurrentProject() { return currentProject; }

function isABuildQueued(name) {
  if (buildsQueue.indexOf(name) === -1) {
    return false;
  } else {
    return true;
  }
}


module.exports.registerBuild = registerBuild;
module.exports.getCurrentProject = getCurrentProject;
module.exports.isABuildQueued = isABuildQueued;
module.exports.getQueueState = getQueueState;
