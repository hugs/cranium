/**
 * Handle payloads received from Github and
 * launch the corresponding build if necessary
 */

var Project = require('../lib/project')
  , executor = require('../lib/executor')
  , customUtils = require('../lib/customUtils')
  , db = require('../lib/db')
  , _ = require('underscore')
  ;


module.exports = function (req, res, next) {
  db.settings.findOne({ type: 'generalSettings' }, function (err, settings) {
    if (req.query.token === undefined || req.query.token.length === 0 || req.query.token !== settings.githubToken) { return res.send(200); }

    db.projects.find({}, function (err, projects) {
      var payload = JSON.parse(req.body.payload)
        , receivedGithubRepoUrl = payload.repository.url
        , receivedBranch = payload.ref.replace(/^.*\//,'')
        ;

      // Build all the enabled projects corresponding using the repo and branch of this push
      projects.forEach(function (project) {
        if (project.githubRepoUrl === receivedGithubRepoUrl && project.branch === receivedBranch) {
          if (project.enabled) {
            executor.registerBuild(project.name);
          } else {
            Project.getProject(project.name, function (err, project) {
              if (err || !project) { return; }
              project.advertiseBuildResult(null);
            });
          }
        }
      });

      return res.send(200);   // Always return a success
    });
  });
};
