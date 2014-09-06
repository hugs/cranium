var should = require('chai').should()
  , assert = require('chai').assert
  , db = require('../lib/db')
  , config = require('../lib/config')
  , Project = require('../lib/project')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , async = require('async')
  , app = require('../cranium')
  ;


describe('Project', function () {
  var projectData;

  before(function (done) {
    app.init(done);
  });

  beforeEach(function (done) {
    db.projects.remove({}, function (err) {
      if (err) { return done(err.toString()); }

      // Make sure these tests projects directories are removed
      var projectsToRemove = ['test', 'another', 'again'];

      async.each(projectsToRemove, function (name, cb) {
        fs.exists(Project.getRootDir(name), function (exists) {
          if (!exists) { return cb(); }
          rimraf(Project.getRootDir(name), function (err) { return cb(err); });
        });
      }, done);
    });
  });

  // Sample projectData and function to test a project corresponds to this data
  projectData = { name: 'test'
            , projectType: 'Basic'
            , githubRepoUrl: 'gru'
            , repoSSHUrl: 'rsu'
            , branch: 'b'
            , testScript: 'ts'
            , deployScript: 'ds'
            };

  function testProject (project) {
    project.name.should.equal('test');
    project.projectType.should.equal('Basic');
    project.githubRepoUrl.should.equal('gru');
    project.repoSSHUrl.should.equal('rsu');
    project.branch.should.equal('b');
    project.testScript.should.equal('ts');
    project.deployScript.should.equal('ds');
    project.nextBuildNumber.should.equal(1);
    project.enabled.should.equal(true);
    Object.keys(project.previousBuilds).length.should.equal(0);
  }

  it('Can create a project with default args, persist to the database and create root directory', function (done) {
    db.projects.findOne({ name: 'test' }, function (err, project) {
      if (err) { return done(err.toString()); }
      assert.isNull(project);

      fs.exists(Project.getRootDir('test'), function (exists) {
        exists.should.equal(false);

        Project.createProject(projectData, function (err, project) {
          if (err) { return done(err.toString()); }

          // Returned project is the expected one
          testProject(project);

          // Root directory was created
          fs.exists(Project.getRootDir('test'), function (exists) {
            exists.should.equal(true);

            db.projects.findOne({ name: 'test' }, function (err, project) {
              if (err) { return done(err.toString()); }
              testProject(project);

              done();
            });
          });
        });
      })
    });
  });

  it('Can get a project by its name', function (done) {
    Project.createProject(projectData, function () {
      Project.getProject('testy', function (err, project) {
        if (err) { return done(err.toString()); }
        assert.isNull(project);

        Project.getProject('test', function (err, project) {
          if (err) { return done(err.toString()); }
          testProject(project);

          done();
        });
      });
    });
  });

  it('Can remove a project', function (done) {
    Project.createProject(projectData, function () {
      Project.getProject('test', function (err, project) {
        assert.isDefined(project);

        // Can't remove it if wrong name is used
        Project.removeProject('testy', function (err) {
          assert.isDefined(err);
          Project.getProject('test', function (err, project) {
            assert.isDefined(project);
            fs.exists(Project.getRootDir('test'), function (exists) {
              exists.should.equal(true);

              // Remove it if correct name is used
              Project.removeProject('test', function (err) {
                if (err) { return done(err.toString()); }
                Project.getProject('test', function (err, project) {
                  if (err) { return done(err.toString()); }
                  assert.isNull(project);
                  fs.exists(Project.getRootDir('test'), function (exists) {
                    exists.should.equal(false);

                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it('Can modify a project name (other edits are straightforward)', function (done) {
    Project.createProject({ name: 'test' }, function (err, project) {
      if (err) { return done(err.toString()); }
      assert.isDefined(project);
      fs.exists(Project.getRootDir('test'), function (exists) {
        exists.should.equal(true);
        fs.exists(Project.getRootDir('another'), function (exists) {
          exists.should.equal(false);

          // Project 'test' is now 'another' and the root dir has changed name accordingly
          // Need to get the project from the DB to retrieve the _id (createProject gives a cached copy)
          Project.getProject('test', function (err, project) {
            project.edit({ name: 'another' }, function (err) {
              Project.getProject('test', function (err, project) {
                assert.isNull(project);
                Project.getProject('another', function (err, project) {
                  project.name.should.equal('another');
                  fs.exists(Project.getRootDir('test'), function (exists) {
                    exists.should.equal(false);
                    fs.exists(Project.getRootDir('another'), function (exists) {
                      exists.should.equal(true);

                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

});
