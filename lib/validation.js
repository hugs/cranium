/**
 * Augment a request's renderValues by validation errors
 */
module.exports.prepareErrorsForDisplay = function (req, errors, userInput) {
  req.renderValues.validationErrors = true;
  req.renderValues.errors = errors;
  req.renderValues.userInput = userInput;
};


/**
 * Validators, sorted by object type (for now only project)
 */
function validateProjectName (value) {
  if (value && value.match(/^[a-zA-Z0-9 ]{1,16}$/)) {
    return true;
  } else {
    return false;
  }
}
module.exports.validateProjectName = validateProjectName;


function accept (value) { return true; }   // For those fields we will accept anyway
module.exports.accept = accept;
