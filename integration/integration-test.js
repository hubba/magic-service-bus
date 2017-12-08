const Bus = require('./../lib/bus');
const assert = require('assert');
const sinon = require('sinon');
const uuid = require('uuid');
const Promise = require('bluebird');

describe('Integration tests', function() {
  beforeEach(function() {
    const testScope = this;
    testScope.queueName = uuid.v4();
    testScope.bus = new Bus({
      connectionUrl: 'amqp://localhost:5672/'
    });
  });

  it('Should connect to the bus', function() {
    const testScope = this;

    return testScope.bus.init();
  });

  it('Should bind an event to the bus', function() {
    const testScope = this;

    return testScope.bus.init()
    .then(function(){
      return testScope.bus.bindEvent(testScope.queueName, () => {});
    }).then(function() {
      return testScope.bus.connectionPromise;
    }).then(function(AMQPConnection) {
      return AMQPConnection.checkQueue(testScope.bus.generateQueueName(testScope.queueName));
    }).then(function(queueExists) {
      assert.ok(queueExists.queue, 'The queue must have been declared.');
      assert.equal(queueExists.queue, testScope.bus.generateQueueName(testScope.queueName), 'Should have declared the queue.');
    });
  });

  describe('With a handler', function() {
    beforeEach(function() {
      const testScope = this;
      testScope.handler = sinon.stub().callsArg(1);
      return testScope.bus.init()
      .then(function() {
        return testScope.bus.bindEvent(testScope.queueName, testScope.handler);
      });
    });

    it.only('Should send a message on the queue', function() {
      const testScope = this;
      const {bus} = testScope;
      let newChannel = null;

      return bus.disconnect().then(function() {
        return Promise.delay(10);
      }).then(function() {
        return bus.init();
      }).then(function(channel) {
        newChannel = channel;
        const emitPromise = bus.emit(testScope.queueName, { poop: 'test'});
        return emitPromise;
      }).then(function() {
        return newChannel.checkQueue(bus.generateQueueName(testScope.queueName));
      }).then(function(queueExists) {
        assert.ok(queueExists.queue, 'The queue must have been declared.');
        assert.equal(queueExists.messageCount, 1, 'The queue must have one message.');
        assert.equal(queueExists.consumerCount, 0, 'We should have disconnected the consumer');
      });
    });
  });

  afterEach(function() {
    const testScope = this;
    const { bus } = testScope;

    return bus.disconnect();
  });
});