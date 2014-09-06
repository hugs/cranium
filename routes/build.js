/**
 * Launch a new build or show a previous one
 */


var config = require('../lib/config')
  , Project = require('../lib/project')
  , executor = require('../lib/executor')
  , moment = require('moment')
  ;

function newBuildWebpage (req, res, next) {
  var values = req.renderValues || {}
    , partials = { content: '{{>pages/newBuild}}' }
    ;

  Project.getProject(req.params.name, function (err, project) {
    if (err || !project) { return res.redirect(302, '/'); }   // Shouldn't happen anyway

    values.project = project;
    executor.registerBuild(project.name);

    return res.render('layout', { values: values
                                , partials: partials
                                });
  });
};


function buildLog (req, res, next) {
  Project.getProject(req.params.name, function (err, project) {
    if (err || !project) { return res.redirect(302, '/'); }   // Shouldn't happen anyway

    project.getBuild(req.params.buildNumber, function (err, buildData) {
      if (!err) { return res.json(200, { log: buildData.log }); }
      var currentProject = executor.getCurrentProject();

      if (req.params.name === currentProject.name && parseInt(req.params.buildNumber, 10) === currentProject.buildNumber) {
        return res.json(206, { log: currentProject.log });
      }

      if (executor.isABuildQueued(req.params.name)) {   // We're lying a bit here but this case shouldn't happen
        return res.json(201, { message: 'Build scheduled' });
      } else {
        return res.json(404, { message: 'This project has no build for this number, and no queued' });
      }
    });
  });
}


function buildRecap (req, res, next) {
  var values = req.renderValues || {}
    , partials = { content: '{{>pages/buildRecap}}' }
    ;

  Project.getProject(req.params.name, function (err, project) {
    if (err || !project) { return res.redirect(302, '/'); }   // Shouldn't happen anyway

    values.project = project;

    project.getBuild(req.params.buildNumber, function (err, buildData) {
      // If build can't be found, it means it hasnt completed yet but is scheduled
      if (err) { return currentBuild(req, res, next); }

      values.build = buildData;
      values.build.date = moment(values.build.date).format('MMMM Do YYYY HH:mm:ss');

      return res.render('layout', { values: values
                                  , partials: partials
                                  });
    });
  });
}


module.exports.buildRecap = buildRecap;
module.exports.newBuildWebpage = newBuildWebpage;
module.exports.buildLog = buildLog;
