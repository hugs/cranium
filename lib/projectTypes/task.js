/**
 * Build steps for a Node.js project
 */
var fs = require('fs')
  , async = require('async')
  , childProcess = require('child_process')
  , customUtils = require('../customUtils')
  ;


/**
 * Populates a project's building sequence
 */
function populateBuildingSequence (project) {
  var buildAndTest = project.repoSSHUrl && project.repoSSHUrl.length > 0 &&   // If no branch or repoSSHUrl is provided, that means the user doesn't want
                     project.branch && project.branch.length > 0              // to use the CI capability but just execute the deploy script
   , buildSequence = [];

  if (buildAndTest) {
    buildSequence.push(pullRepo.bind(project));
    buildSequence.push(checkIfDependenciesNeedToBeReinstalled.bind(project));
    buildSequence.push(reinstallDependencies.bind(project));
    buildSequence.push(runTestScript.bind(project));
  }

  buildSequence.push(runDeployScript.bind(project));

  if (buildAndTest) {
    buildSequence.push(rememberDependencies.bind(project));
  }

  project.buildSequence = buildSequence;
}


/**
 * Pull the repo, and create it if it doesn't exist
 * @param {Function} callback Required callback, signature: err
 */
function pullRepo (callback) {
  var self = this
    , Project = self.constructor
    ;

  self.buildingSandbox.channel.write("=== Pulling new code ===\n");

  async.waterfall([
    function (cb) {   // Ensure the repo exists, create it if needed
      customUtils.ensureDirectoryExists(Project.getRepoPath(self.name), function (err) {
        if (err) { return cb(err); }

        fs.readdir(Project.getRepoPath(self.name), function (err, files) {
          if (err) { return cb(err); }
          if (files.length > 0) { return cb(); }   // Files were found, we assume it's a Git repo.

          childProcess.exec('git clone ' + self.repoSSHUrl + ' .', {  cwd: Project.getRepoPath(self.name)  }, function (err, stdout, stderr) {
            self.buildingSandbox.channel.write("=== First build, cloning the repository ===\n");
            self.buildingSandbox.channel.write(stdout);
            self.buildingSandbox.channel.write(stderr);
            return cb(err);
          })
        });
      });
    }
  , function (cb) {   // Pull it (will fail if branch doesn't exist)
      childProcess.exec('set -e; git checkout ' + self.branch + '; git pull', {  cwd: Project.getRepoPath(self.name)  }, function (err, stdout, stderr) {
        self.buildingSandbox.channel.write(stdout);
        self.buildingSandbox.channel.write(stderr);
        return cb(err);
      })
    }
  ], callback);
}


/**
 * Check if we need to reinstall the dependencies, that's what takes most of the build time
 * @param {Function} callback Required callback. Signature: err
 */
function checkIfDependenciesNeedToBeReinstalled (callback) {
  var self = this
    , Project = self.constructor
    ;

  fs.readFile(Project.getRepoPath(self.name) + '/.gitignore', 'utf8', function (err, data) {
    var lines = data.split('\n')
      , nodeModulesIsGitignored = false;

    self.buildingSandbox.channel.write("=== Checking if we need to reinstall dependencies ===\n");

    lines.forEach(function (line) {
      if (line.match(/^\/?node_modules\/?$/)) {
        nodeModulesIsGitignored = true;
      }
    });

    if (!nodeModulesIsGitignored) {
      self.buildingSandbox.channel.write("=== node_modules is checked in Git so no need to reinstall them ===\n");
      self.buildingSandbox.needToReinstallDependencies = false;
      return callback();
    }

    customUtils.checkIfFilesAreIdentical(Project.getDependenciesInfoDir(self.name) + '/npm-shrinkwrap.json', Project.getRepoPath(self.name) + '/npm-shrinkwrap.json', function (err, sameN) {
      if (err) { return callback(err); }
      customUtils.checkIfFilesAreIdentical(Project.getDependenciesInfoDir(self.name) + '/package.json', Project.getRepoPath(self.name) + '/package.json', function (err, sameP) {
        if (err) { return callback(err); }
        if (sameN && sameP) {
          self.buildingSandbox.channel.write("=== node_modules is gitignored but package.json and npm-shrinkwrap.json didn't change, no need to reinstall ===\n");
          self.buildingSandbox.needToReinstallDependencies = false;
          return callback();
        } else {
          self.buildingSandbox.channel.write("=== node_modules is gitignored and package.json or npm-shrinkwrap.json changed, we need to reinstall ===\n");
          self.buildingSandbox.needToReinstallDependencies = true;
          return callback();
        }
      });
    });
  });
}


/**
 * (Re)install the dependencies
 * @param {Function} callback Required callback, signature: err
 */
function reinstallDependencies (callback) {
  var self = this, installer
    , Project = self.constructor
    ;

  if (! self.buildingSandbox.needToReinstallDependencies) { return callback(); }

  self.buildingSandbox.channel.write("=== Reinstalling dependencies ===\n");

  async.waterfall([
    function (cb) {   // Reinstall
    childProcess.exec('rm -rf node_modules', { cwd: Project.getRepoPath(self.name) }, function (err, stdout, stderr) {
      if (err) { return cb(err); }

      installer = childProcess.spawn('npm', ['install'], { cwd: Project.getRepoPath(self.name) });
      installer.stdout.pipe(self.buildingSandbox.channel, { end: false });
      installer.stderr.pipe(self.buildingSandbox.channel, { end: false });

      installer.on('exit', function (code) {
        var error = code === 0 ? null : "Couldn't reinstall dependencies";
        cb(error);
      });
    });
  }
  ], callback);
}


/**
 * Copy the dependencies files (npm-shrinkwrap.json and package.json) so that
 * For the next build we can compare them against the current versions and know
 * if we need to reinstall the dependencies.
 * @param {Function} callback Signature: err
 */
function rememberDependencies (callback) {   // Copy dependency files to remember them next time we check if need to reinstall
  var self = this
    , Project = self.constructor
    ;

  customUtils.ensureDirectoryExists(Project.getDependenciesInfoDir(self.name), function (err) {
    if (err) { return callback(err); }
    customUtils.copySafe(Project.getRepoPath(self.name) + '/npm-shrinkwrap.json', Project.getDependenciesInfoDir(self.name) + '/npm-shrinkwrap.json', function (err) {
      if (err) { return callback(err); }
      customUtils.copySafe(Project.getRepoPath(self.name) + '/package.json', Project.getDependenciesInfoDir(self.name) + '/package.json', function (err) {
        return callback(err);
      });
    });
  });
}


/**
 * Run the test script
 * @param {Function} callback Required callback, signature: err
 */
function runTestScript (callback) {
  var self = this
    , Project = self.constructor
    ;

  self.buildingSandbox.channel.write("=== Running test script ===\n");
  var script = "cd " + Project.getRepoPath(self.name).replace(/ /g, '\\ ') + ";" + self.testScript;
  customUtils.executeBashScript(script, null, self.buildingSandbox.channel, callback);
}


/**
 * Run the deploy script
 * @param {Function} callback Required callback, signature: err
 */
function runDeployScript (callback) {
  var self = this
    , Project = self.constructor
    ;

  self.buildingSandbox.channel.write("=== Running deployment script ===\n");
  customUtils.executeBashScript(self.deployScript, { REINSTALL_DEPS: self.buildingSandbox.needToReinstallDependencies }, self.buildingSandbox.channel, callback);
}

module.exports = { populateBuildingSequence: populateBuildingSequence, name: 'Node.js' };

