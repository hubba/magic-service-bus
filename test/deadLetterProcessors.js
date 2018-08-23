const assert = require('assert');
const requireDirectory = require('require-directory');
const DeadLetterProcessors = requireDirectory(module, './../lib/deadletterProcessors');
const DeadletterActions = require('./../lib/deadletterActions');
const stdin = require('mock-stdin').stdin();
const Q = require('q');
const uuid = require('uuid');

describe('Deadletter processors', function() {
  beforeEach(function() {
    const testScope = this;

    testScope.messageContent = {
      event: 'someEvent',
      value: {
        _id: 'mongoid'
      }
    };

    testScope.messageId = uuid.v4();

    testScope.message = {
      fields: {
        routingKey: 'someEvent'
      },
      content: Buffer.from(JSON.stringify(testScope.messageContent), 'utf8'),
      properties: {
        headers: {
          'content-type': 'application/json',
          messageId: testScope.messageId
        }
      }
    };

  });

  describe('Delete all Processor', function() {

    it('should always return with a promise containing delete all action', function() {
      const testScope = this;

      return DeadLetterProcessors.deleteAll(testScope.message).then(function(result) {
        assert.equal(result, DeadletterActions.DELETE_MESSAGE);
      });
    });
  });

  // eslint-disable-next-line
  describe('Delete by Name Processor', function() {

    it('should return with a promise containing delete messages action when the event name matches', function() {
      const event = this.messageContent.event;

      return DeadLetterProcessors.deleteByName(event, this.message).then(function(result) {
        assert.equal(result, DeadletterActions.DELETE_MESSAGE);
      });
    });

    it('should reject promise when the event name doesn\'t match', function() {
      return DeadLetterProcessors.deleteByName('anyOtherEvent', this.message).then(function() {
        return Q.reject(new Error('Should have failed'));
      }, function() {
        return Q.resolve();
      });
    });

  });

  describe('Re-Enqueue all Processor', function() {

    it('should always return with a promise containing requeue all messages action', function() {
      const testScope = this;

      return DeadLetterProcessors.reenqueueAll(testScope.message).then(function(result) {
        assert.equal(result, DeadletterActions.REENQUEUE_MESSAGE);
      });
    });
  });

  describe('Re-Enqueue by Name Processor', function() {

    it('should return with a promise containing requeue all messages action when the event name matches', function() {
      const event = this.messageContent.event;

      return DeadLetterProcessors.reenqueueByName(event, this.message).then(function(result) {
        assert.equal(result, DeadletterActions.REENQUEUE_MESSAGE);
      });
    });

    it('should reject promise when the event name doesn\'t match', function() {
      return DeadLetterProcessors.reenqueueByName('anyOtherEvent', this.message).then(function() {
        return Q.reject(new Error('Should have failed'));
      }, function() {
        return Q.resolve();
      });
    });

  });

  describe('StdIn Processor', function() {

    it('when we respond with "1" we should reenqueue', function() {
      const testScope = this;

      const deadletterPromise = DeadLetterProcessors.stdin(testScope.message).then(function(result) {
        assert.equal(result, DeadletterActions.REENQUEUE_MESSAGE);
      });

      stdin.send(new Buffer('1'));

      return deadletterPromise;
    });

    it('when we respond with "1" with extra whitespace we should reenqueue', function() {
      const testScope = this;

      const deadletterPromise = DeadLetterProcessors.stdin(testScope.message).then(function(result) {
        assert.equal(result, DeadletterActions.REENQUEUE_MESSAGE);
      });

      stdin.send(new Buffer(' 1 \
            '));

      return deadletterPromise;
    });

    it('when we respond with "2" we should delete', function() {
      const testScope = this;

      const deadletterPromise = DeadLetterProcessors.stdin(testScope.message).then(function(result) {
        assert.equal(result, DeadletterActions.DELETE_MESSAGE);
      });

      stdin.send(new Buffer('2'));

      return deadletterPromise;
    });

    it('when we respond with "2" with extra whitespace we should delete', function() {
      const testScope = this;

      const deadletterPromise = DeadLetterProcessors.stdin(testScope.message).then(function(result) {
        assert.equal(result, DeadletterActions.DELETE_MESSAGE);
      });

      stdin.send(new Buffer('2\
            '));

      return deadletterPromise;
    });

    it('when we respond with "3" we should send to back', function() {
      const testScope = this;

      const deadletterPromise = DeadLetterProcessors.stdin(testScope.message).then(function(result) {
        assert.equal(result, DeadletterActions.SEND_TO_BACK);
      });

      stdin.send(new Buffer('3'));

      return deadletterPromise;
    });

    it('when we respond with "asdasdasdasd" we should reject', function() {
      const testScope = this;

      const deadletterPromise = DeadLetterProcessors.stdin(testScope.message).then(function() {
        return Q.reject(new Error('Should have failed'));
      }, function() {
        return Q.resolve();
      });

      stdin.send(new Buffer('asdasdasdd'));

      return deadletterPromise;
    });

    it('when we respond with "" we should reject', function() {
      const testScope = this;

      const deadletterPromise = DeadLetterProcessors.stdin(testScope.message).then(function() {
        return Q.reject(new Error('Should have failed'));
      }, function() {
        return Q.resolve();
      });

      stdin.send(new Buffer('\
            '));

      return deadletterPromise;
    });
  });
});
