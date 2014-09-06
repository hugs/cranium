/**
 * A project takes care of a branch on a repo.
 * Its config is stored in workspace/name_of_project.js
 * The corresponding Git repo used for tests is workspace/name_of_project
 *
 */
var config = require('./config')
  , fs = require('fs')
  , url = require('url')
  , customUtils = require('./customUtils')
  , validation = require('./validation')
  , childProcess = require('child_process')
  , async = require('async')
  , rimraf = require('rimraf')
  , db = require('./db')
  , basicSteps = require('./projectTypes/basic.js')
  , request = require('request')
  , app = require('../cranium')
  ;



// =============================================================
// Project creation, edition, deletion
// =============================================================

function Project (projectData) {
  var keys = Object.keys(projectData)
    , i, self = this
    , steps
    ;

  // Give the project its basic properties (settings)
  Project.propertiesToSave().forEach(function (prop) {
    self[prop] = projectData[prop];
  });

  // If project type is not defined, assume it's a Basic project
  self.projectType = self.projectType || 'Basic';

  // Populate the project's build sequence
  app.getAllProjectTypes()[self.projectType](self);
}


/**
 * Get the fields we want to persist (don't save extraneous data)
 */
Project.propertiesToSave = function () {
  return [ 'name'
         , 'githubRepoUrl'
         , 'repoSSHUrl'
         , 'branch'
         , 'nextBuildNumber'
         , 'previousBuilds'
         , 'testScript'
         , 'deployScript'
         , 'enabled'
         , '_id'
         , 'projectType'
         ];
};


/**
 * Create a new project
 * @param {Object} projectData
 * @param {Function} callback Signature: err, project
 */
Project.createProject = function (projectData, callback) {
  var validationErrors = Project.validate(projectData)
    , j;
  if (validationErrors) { return callback({ validationErrors: validationErrors }); }

  projectData.nextBuildNumber = 1;
  projectData.previousBuilds = {};
  projectData.enabled = true;
  j = new Project(projectData);

  // Persist project to the database and create its root directory
  customUtils.ensureDirectoryExists(Project.getRootDir(j.name), function (err) {
    if (err) { return callback(err); }

    j.save(function (err) {
      return callback(err, j);
    });
  });
}


/**
 * Delete a project
 * @param {String} name
 * @param {Function} cb Optional callback, signature: err
 */
Project.removeProject = function (name, cb) {
  var callback = cb || function () {};

  db.projects.findOne({ name: name }, function (err, project) {
    if (err) { return callback(err); }
    if (!project) { return callback("Project doesn't exist"); }

    db.projects.remove({ name: name }, { multi: false }, function (err) {
      if (err) { return callback(err); }

      rimraf(Project.getRootDir(name), function (err) { return callback(err); });
    });
  });
};


/**
 * Get a project object from the DB data
 */
Project.getProject = function (name, callback) {
  db.projects.findOne({ name: name }, function (err, projectData) {
    if (err) { return callback (err); }
    if (!projectData) { return callback(null, null); }

    return callback(null, new Project(projectData));
  });
};


/**
 * Save project data in the database
 * Can be used to save an already existing or a newly created project
 */
Project.prototype.save = function (callback) {
  var self = this
    , toSave = {}
    , query = this._id ? { _id: this._id } : { name: this.name }
    ;

  if (! this.name) { return callback("This project doesn't seem to have a name ..."); }

  Project.propertiesToSave().forEach(function (prop) { toSave[prop] = self[prop]; });
  db.projects.update(query, toSave, { upsert: true }, function (err) {
    return callback(err);
  });
};


/**
 * Validate a project (synchronous)
 */
Project.validate = function (projectData) {
  var validators = {}
    , errors = []
    , fields// = Object.keys(projectData)
    , field, i
    ;

  // Register all validators
  function registerValidator (field, validator, errorMessage) {
    validators[field] = { validator: validator
                        , errorMessage: errorMessage };
  }
  registerValidator('name', validation.validateProjectName, 'The name must be composed of between 1 and 16 alphanumerical characters and spaces');
  registerValidator('githubRepoUrl', validation.accept, '');
  registerValidator('repoSSHUrl', validation.accept, '');
  registerValidator('branch', validation.accept, '');
  registerValidator('testScript', validation.accept, '');
  registerValidator('deployScript', validation.accept, '');

  fields = Object.keys(validators);

  // Actually perform validation
  for (i = 0; i < fields.length; i += 1) {
    field = fields[i];
    if (validators[field].validator(projectData[field]) === false) {
      errors.push(validators[field].errorMessage);
    }
  }

  return errors.length > 0 ? errors : null;
};


/**
 * Set new value for a project's enabled state
 */
Project.prototype.setEnabledValue = function (newValue, callback) {
  var self = this;

  self.enabled = newValue;
  self.save(function (err) { return callback(err); });
};


/**
 * Specific field editing functions
 * They take care of changing a project's property and the "side effects" (if any)
 * Side effects are the stuff Cranium needs to do on top of just changing the Project object's properties
 * For example changing the root directory in the workspace when you change a project's name
 * All with the same signature: newValue, callback([err])
 * To be call with Function.call to provide the correct this
 */
Project.getEditableProperties = function () {
  // The order of fields is important, as some have an impact on the others downstream
  // name impacts repoSSHUrl (needs to pull the new repo in the right directory)
  // branch impacts repoSSHUrl (needs to create the new repo on the correct branch)
  return ['name', 'branch', 'githubRepoUrl', 'repoSSHUrl', 'testScript', 'deployScript', 'projectType'];
};

Project._edit = {};

// Register an editing function that just changes the field and saves the new object, with no side effect
function justChangeField (property) {
  Project._edit[property] = function (newValue, callback) {
    this[property] = newValue;
    this.save(callback);
  };
}
justChangeField('branch');
justChangeField('githubRepoUrl');
justChangeField('testScript');
justChangeField('deployScript');
justChangeField('projectType');

Project._edit.name = function (newValue, callback) {
  var self = this;

  // Rename project directory
  fs.rename(Project.getRootDir(self.name), Project.getRootDir(newValue), function (err) {
    if (err) { return callback(err); }

    self.name = newValue;
    self.save(function (err) {
      if (err) { return callback(err); }
      return callback();
    });
  });
};

Project._edit.repoSSHUrl = function (newValue, callback) {
  var self = this
    , executor = require('./executor')   // We need to require it here to break the circular dependency
    ;

  rimraf(Project.getRepoPath(self.name), function (err) {
    if (err) { return callback(err); }
    rimraf(Project.getDependenciesInfoDir(self.name), function (err) {
      if (err) { return callback(err); }

      self.repoSSHUrl = newValue;
      self.save(function (err) {
        if (err) { return callback(err); }

        // Will take care of cloning the new repo
        executor.registerBuild(self.name);
      });

      return callback();
    });
  });
}


/**
 * Edit an existing project
 */
Project.prototype.edit = function (newOptions, callback) {
  var keys = Object.keys(newOptions)
    , self = this
    , editableProperties = Project.getEditableProperties()
    , validationErrors = Project.validate(newOptions)
    , i = 0
    ;

  if (validationErrors) { return callback({ validationErrors: validationErrors }); }

  async.whilst( function () { return i < editableProperties.length; }
  , function (cb) {
    var property = editableProperties[i];
    i += 1;

    if (self[property] !== newOptions[property]) {
      return Project._edit[property].call(self, newOptions[property], cb);
    } else {
      return cb();
    }
  }
  , callback);
};


/**
 * Get a build's data
 */
Project.prototype.getBuild = function (buildNumber, callback) {
  var self = this;
  if (! self.previousBuilds[buildNumber]) { return callback('Build number ' + buildNumber + ' doesn\'t exist'); }

  fs.readFile(Project.getBuildFilename(self.name, parseInt(buildNumber, 10)), 'utf8', function (err, data) {
    var buildData = {};
    if (err) { return callback('Build number ' + buildNumber + ' doesn\'t exist or data is corrupted'); }

    buildData = self.previousBuilds[buildNumber];
    buildData.log = data;

    return callback(null, buildData);
  });
};


// ==================================================
// Project building and advertising
// ==================================================

/**
 * Advertise build results
 * Manages all channels
 * buildSuccessful can have 4 values:
 * * true means the build was successful
 * * false means it failed
 * * null and undefined mean the project wasn't built
 */
Project.prototype.advertiseBuildResult = function (buildSuccessful) {
  this.advertiseOnHipchat(buildSuccessful);
};


/**
 * Advertise the result of a build on hipchat
 */
Project.prototype.advertiseOnHipchat = function (buildSuccessful) {
  var messageToSend = { from: 'Cranium CI'
                      , message_format: 'html'
                      }
    , self = this
    , buildUrl = '/projects/' + self.name + '/builds/' + self.nextBuildNumber
    , uri = "https://api.hipchat.com/v1/rooms/message?format=json&auth_token="
    ;

  db.settings.findOne({ type: 'generalSettings' }, function (err, settings) {
    if (err || !settings || !customUtils.settingDefined(settings.hipchatToken) || !customUtils.settingDefined(settings.hipchatRoom)) {
      return;
    }

    messageToSend.room_id = settings.hipchatRoom;
    buildUrl = url.resolve(settings.craniumRootUrl, buildUrl);

    if (buildSuccessful === null || buildSuccessful === undefined) {
      messageToSend.notify = 0;
      messageToSend.color = 'gray';
      messageToSend.message = self.name + " was not built since it's in disabled state";
    }

    if (buildSuccessful === true) {
      messageToSend.notify = 0;
      messageToSend.color = 'green';
      messageToSend.message = self.name + ' - Build and deploy successful (<a href="' + buildUrl + '">see build</a>)';
    }

    if (buildSuccessful === false) {
      messageToSend.notify = 1;
      messageToSend.color = 'red';
      messageToSend.message = self.name + ' - Build and deploy failed (<a href="' + buildUrl + '">see build</a>)';
    }

    uri += settings.hipchatToken;
    Object.keys(messageToSend).forEach(function (k) {
      uri += '&' + k + '=' + encodeURIComponent(messageToSend[k]);
    });
    request.get({ headers: {"Accept": "application/json"}, uri: uri}, function () {});
  });
};


/**
 * Launch a build
 * @param {WritableStream} out A stream provided by the build initiator. Can be process.stdout or Http.ServerResponse for example.
 * @param {Function} callback Signature: err
 */
Project.prototype.build = function (out, callback) {
  var self = this
    , buildReport
    ;

  self.buildingSandbox = {};   // Usable by the build steps to store and pass data during a build
  self.buildingSandbox.channel =  new customUtils.PassthroughStream();

  customUtils.ensureDirectoryExists(Project.getBuildsDir(this.name), function (err) {
    if (err) { return callback(err); }
    buildReport = fs.createWriteStream(Project.getBuildFilename(self.name, self.nextBuildNumber));
    out && self.buildingSandbox.channel.pipe(out);
    self.buildingSandbox.channel.pipe(buildReport);

    async.waterfall(self.buildSequence, function (err) {
      var buildSuccessful = err ? false : true;

      if (buildSuccessful) {
        self.buildingSandbox.channel.write("=== YES! Build and deploy successful! ===\n");
      } else {
        self.buildingSandbox.channel.write("=== OH NOES! Something went wrong :( ===\n");
        self.buildingSandbox.channel.write(err.toString());
      }

      buildReport.end();
      self.advertiseBuildResult(buildSuccessful);   // Asynchronously advertise build
      self.previousBuilds[self.nextBuildNumber] = { number: self.nextBuildNumber
                                                  , success: buildSuccessful
                                                  , date: new Date()
                                                  };
      self.nextBuildNumber += 1;
      self.save(function (err) { return callback(err); });
    });
  });
};




/**
 * Functions defining where the data is stored
 */
Project.getRootDir = function (name) { return config.workspace + '/' + name };
Project.getConfigPath = function (name) { return Project.getRootDir(name) + '/settings.conf'; };
Project.getRepoPath = function (name) { return Project.getRootDir(name) + '/repo'; };
Project.getBuildsDir = function (name) { return Project.getRootDir(name) + '/builds'; };
Project.getBuildFilename = function (name, buildNumber) { return Project.getBuildsDir(name) + '/build' + buildNumber + '.log'; };
Project.getDependenciesInfoDir = function (name) { return Project.getRootDir(name) + '/dependencies'; };



module.exports = Project;
