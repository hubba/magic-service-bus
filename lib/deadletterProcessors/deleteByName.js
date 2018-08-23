const deadletterActions = require('./../deadletterActions');
const Q = require('q');

module.exports = function(event, message) {
  const content = JSON.parse(message.content);

  if (event === content.event) {
    return Q.when(deadletterActions.DELETE_MESSAGE);
  } else {
    return Q.reject(new Error(`Required ${event} does not match ${message.content.event}`));
  }
};
