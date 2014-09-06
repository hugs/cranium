/**
 * Create a new project
 */


var config = require('../lib/config')
  , Project = require('../lib/project')
  , validation = require('../lib/validation')
  , customUtils = require('../lib/customUtils')
  , moment = require('moment')
  , app = require('../cranium')
  , _ = require('underscore')
  ;

/**
 * Display all information about a project, its configuration, build results and enabled state
 */
function homepage (req, res, next) {
  var values = req.renderValues || {}
    , partials = { content: '{{>pages/projectHomepage}}' }
    ;

  Project.getProject(req.params.name, function (err, project) {
    if (err || !project) { return res.redirect(302, '/'); }   // Shouldn't happen anyway

    values.project = project;
    values.project.numberOfBuilds = project.nextBuildNumber - 1;
    values.project.previousBuilds = customUtils.objectToArrayInOrder(project.previousBuilds);
    values.project.previousBuilds.sort(function (a, b) { return (new Date(b.date)).getTime() - (new Date(a.date)).getTime(); });

    values.project.previousBuilds.forEach(function (build) {
      build.date = moment(build.date).format('MMMM Do YYYY HH:mm:ss');
    });

    values.taskManagerOnly = false;
    if (!project.repoSSHUrl || project.repoSSHUrl.length === 0) { values.taskManagerOnly = true; }
    if (!project.branch || project.branch.length === 0) { values.taskManagerOnly = true; }

    return res.render('layout', { values: values
                                , partials: partials
                                });
  });
}


function displayForm (req, res, next) {
  var values = req.renderValues || {}
    , partials = { content: '{{>pages/createProject}}' }
    ;

  values.projectTypes = Object.keys(app.getAllProjectTypes()).sort();

  if (values.editMode) {
    values.title = "Edit project " + values.userInput.name;
  } else {
    values.title = "Create a new project";
  }

  return res.render('layout', { values: values
                              , partials: partials
                              });
}


function populateFormForEdition (req, res, next) {
  Project.getProject(req.params.name, function (err, project) {
    if (err || !project) { return res.redirect(302, '/'); }   // Shouldn't happen anyway

    req.renderValues.userInput = project;
    req.renderValues.currentName = project.name;
    req.renderValues.editMode = true;
    return next();
  });
}


function create (req, res, next) {
  var values = req.renderValues || {}
    , errors = []
    ;

  Project.createProject(req.body, function (err) {
    if (err) {
      values.validationErrors = true;
      values.errors = err.validationErrors;
      values.userInput = req.body;
      return displayForm(req, res, next);
    }

    return res.redirect(302, '/projects/' + req.body.name + '/homepage');
  });
}


function edit (req, res, next) {
  var values = req.renderValues || {}
    , errors = []
    , currentName = req.body.currentName
    ;

  values.editMode = true;
  values.currentName = currentName;

  Project.getProject(currentName, function (err, project) {
    if (err || !project) { return res.redirect(302, '/'); }   // Shouldn't happen anyway

    project.edit(req.body, function (err) {
      if (err) {
        if (err.validationErrors) {
          values.validationErrors = true;
          values.errors = err.validationErrors;
          values.userInput = req.body;
        } else {
          validation.prepareErrorsForDisplay(req, ['Something strange happened, please try again'], req.body);
        }

        return displayForm(req, res, next);
      }

      res.redirect(302, '/projects/' + req.body.name + '/homepage');
    });
  });
}


function removeProject (req, res, next) {
  Project.removeProject(req.params.name, function (err) {
    if (err) { return res.send(500); }

    return res.send(200);
  });
}


// Interface
module.exports.homepage = homepage;
module.exports.populateFormForEdition = populateFormForEdition;
module.exports.displayForm = displayForm;
module.exports.create = create;
module.exports.edit = edit;
module.exports.removeProject = removeProject;
