const deadletterActions = require('./../deadletterActions');
const Q = require('q');

module.exports = function() {
  return Q.when(deadletterActions.REENQUEUE_MESSAGE);
};
