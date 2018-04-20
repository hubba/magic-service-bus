const Bus = require('./lib/bus');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const requireDirectory = require('require-directory');

let connection;

function fromDir(startPath, filter, callback) {

  if (!fs.existsSync(startPath)) {

    console.log(`start path not found. Please ensure ${startPath} is a valid directory`); // eslint-disable-line no-console
    return;

  }

  const files = fs.readdirSync(startPath);

  for (let i = 0; i < files.length; i++) {

    const filename = path.join(startPath, files[i]);
    const stat = fs.lstatSync(filename);

    if (stat.isDirectory()) {
      fromDir(filename, filter, callback); //recurse
    } else if (filter.test(filename)) {
      callback(filename);
    }
  }
}

function onMessage(eventName, handler) {
  assert.ok(connection, 'Connection not created. Please make sure you have initialized the worker');

  if(handler.name === null) {
    connection.logger.warn('Anonymous functions have been deprecated and will no longer be supported in version 2.0.0');
  }

  connection.bindEvent(eventName, handler);
}

Object.assign(module.exports, {
  emit(message, callback) {
    assert.ok(connection, 'Connection not created. Please make sure you have initialized the emitter');
    assert.ok(message, 'must have a non-null message');
    assert.ok(message.event, 'You must have a message name');

    const eventName = message.event;
    const sendMessagePromise = connection.sendMessage(eventName, message);

    if (callback) { sendMessagePromise.nodeify(callback); }

    return sendMessagePromise;
  },

  init(opts, callback) {
    assert.ok(!connection, 'The Magic Service Bus has already been initialized. *honk honk*!');

    const workerPath = opts.workerPath;
    const workerRegularExpression = opts.workerRegularExpression || /\.worker\.js$/;

    const newRelic = opts.newRelic;

    connection = new Bus(opts);
    const busConnectionPromise = connection.init();

    //
    // For now this will exist here, but should be moved outside of the service-bus
    // initialization
    //
    if (newRelic) {
      connection.addMiddleware(function(req, res, next) {
        return new Promise(function(resolve, reject) {
          newRelic.createBackgroundTransaction(req.event, function() {
            next().then(function(result) {
              newRelic.endTransaction();
              resolve(result);
            })
            .catch(function(error) {
              newRelic.noticeError(error);
              newRelic.endTransaction();
              reject(error);
            });
          })();
        });
      });
    }

    if (workerPath) {
      fromDir(workerPath, workerRegularExpression, function(filename) {
        require(filename);
      });
    }

    busConnectionPromise.nodeify(callback);

    return busConnectionPromise;
  },

  listenToDeadletter(onEvent) {
    return connection.listenDeadLetterQueue(onEvent);
  },

  deadletterActions: require('./lib/deadletterActions'),
  deadletterProcessors: requireDirectory(module, './lib/deadletterProcessors'),

  onMessage,
  /**
     * @deprecated
     */
  events: { onMessage }
});
