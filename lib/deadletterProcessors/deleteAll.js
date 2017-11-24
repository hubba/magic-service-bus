const deadletterActions = require('./../deadletterActions');
const Q = require('q');

module.exports = function() {
  return Q.when(deadletterActions.DELETE_MESSAGE);
};
