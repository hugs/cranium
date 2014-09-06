var Project = require('../lib/project');

module.exports.enableProject = function (req, res, next) {
  Project.getProject(req.params.name, function (err, project) {
    if (err || !project) { return res.send(400); }   // Shouldn't happen anyway

    project.setEnabledValue(true, function () {
      return res.send(200);
    });
  });
};


module.exports.disableProject = function (req, res, next) {
  Project.getProject(req.params.name, function (err, project) {
    if (err || !project) { return res.send(400); }   // Shouldn't happen anyway

    project.setEnabledValue(false, function () {
      return res.send(200);
    });
  });
};
