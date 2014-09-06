/**
 * Homepage
 */


var config = require('../lib/config')
  , Project = require('../lib/project')
  , moment = require('moment')
  , db = require('../lib/db')
  ;

module.exports = function (req, res, next) {
  var values = req.renderValues || {}
    , partials = { content: '{{>pages/index}}' }
    , dashboardData = []
    ;

  db.projects.find({}, function (err, projects) {
    projects.forEach(function (project) {
      if (project.nextBuildNumber && project.nextBuildNumber > 1) {
        project.latestBuild = project.previousBuilds[project.nextBuildNumber - 1];
        project.latestBuild.timeago = moment(project.latestBuild.date).fromNow();
      }
      dashboardData.push(project);
    });

    values.dashboardData = dashboardData;
    values.noProjectYet = dashboardData.length === 0;

    return res.render('layout', { values: values
                                , partials: partials
                                });
  });
};
