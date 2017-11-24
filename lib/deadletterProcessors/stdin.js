/*eslint no-console: 0 */

const deadletterActions = require('./../deadletterActions');
const Q = require('q');

module.exports = function(message) {
  console.log(JSON.parse(message.content.toString('utf8')));
  console.log('What would you like to do with this message:');
  console.log('1 - Renqueue on original queue');
  console.log('2 - Delete');
  console.log('3 - Send to back of deadletter queue');
  console.log('Exit or any-other entry to leave message in place');

  return new Q.Promise(function(resolve, reject) {
    process.stdin.once('data', function(buffer) {
      let parsedResponse = -1;
      const text = buffer.toString().trim();

      try {
        parsedResponse = parseInt(text);
      } catch (e) {
        console.log(`invalid selection: ${text}`);
      }

      if (parsedResponse === 1) {
        resolve(deadletterActions.REENQUEUE_MESSAGE);
      } else if (parsedResponse === 2) {
        resolve(deadletterActions.DELETE_MESSAGE);
      } else if (parsedResponse === 3) {
        resolve(deadletterActions.SEND_TO_BACK);
      } else {
        reject(new Error('selected other'));
      }

      return text;
    });
  });
};
