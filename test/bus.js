const assert = require('assert');
const sinon = require('sinon');
const Bus = require('./../lib/bus');
const Q = require('q');
const uuid = require('uuid');

describe('Message Bus', function() {

  describe('Must have sane defaults', function() {
    beforeEach(function() {
      const testScope = this;

      testScope.bus = new Bus({
        connectionUrl: 'amqp://someurl'
      });
    });

    it('must initialize a root exchange', function() {
      const testScope = this;

      assert.equal(testScope.bus.rootExchange, 'root.exchange');
    });

    it('must default to an empty string serviceName', function() {
      const testScope = this;

      assert.equal(testScope.bus.serviceName, 'global');
    });

    it('must default the environment correctly', function() {
      const testScope = this;

      assert.equal(testScope.bus.environment, 'development');
    });

    it('must default the logger to the console', function() {
      const testScope = this;

      assert.equal(testScope.bus.logger, console);
    });
  });

  describe('Must construct with options', function() {
    beforeEach(function() {
      const testScope = this;
      testScope.testAMQP = {};
      testScope.testLogger = {};
      testScope.bus = new Bus({
        connectionUrl: 'amqp://someurl',
        rootExchange: 'root.exchange',
        serviceName: 'tester',
        environment: 'test',
        AMQPLib: testScope.testAMQP,
        logger: testScope.testLogger
      });
    });

    it('must set a connectionUrl', function() {
      const testScope = this;

      assert.equal(testScope.bus.connectionUrl, 'amqp://someurl');
    });

    it('must set a timeout', function() {
      const testScope = this;

      assert.equal(testScope.bus.timeout, 1000 * 60 * 5);
    });

    it('must set a root exchange', function() {
      const testScope = this;

      assert.equal(testScope.bus.rootExchange, 'root.exchange');
    });

    it('must set the serviceName', function() {
      const testScope = this;

      assert.equal(testScope.bus.serviceName, 'tester');
    });

    it('must set the environment correctly', function() {
      const testScope = this;

      assert.equal(testScope.bus.environment, 'test');
    });

    it('must set the logger to the rabbitMQ library', function() {
      const testScope = this;

      assert.equal(testScope.bus.rabbitMQ, testScope.testAMQP);
    });

    it('must set the logger to the test logger', function() {
      const testScope = this;

      assert.equal(testScope.bus.logger, testScope.testLogger);
    });
  });

  describe('when the process.env.NODE_ENV is set', function() {
    beforeEach(function() {
      const testScope = this;
      testScope.testAMQP = {};
      testScope.testLogger = {};
      process.env.NODE_ENV = 'TEST_ENV';
      testScope.bus = new Bus({
        connectionUrl: 'amqp://someurl',
        rootExchange: 'root.exchange',
        serviceName: 'tester',
        AMQPLib: testScope.testAMQP,
        logger: testScope.testLogger
      });
    });

    it('must read the environment', function() {
      const testScope = this;

      assert.equal(testScope.bus.environment, 'TEST_ENV');
    });
  });

  describe('constructing a bus with no parameters', function() {

    it('must throw if no connection url is specified', function() {
      assert.throws(function() {
        new Bus();
      });
    });

  });

  describe('With a Mock AMQP Lib', function() {
    beforeEach(function() {
      const testScope = this;
      testScope.serviceName = 'tester';

      testScope.queue = {
        queue: 'development.discovery.testEvent'
      };

      testScope.channel = {
        ack: sinon.stub().resolves(),
        nack: sinon.stub().resolves(),
        assertQueue: sinon.stub().resolves(testScope.queue),
        bindQueue: sinon.stub().resolves(),
        assertExchange: sinon.stub().resolves(),
        consume: sinon.stub().resolves(),
        prefetch: sinon.stub().resolves(),
        publish: sinon.stub().resolves(),
        cancel: sinon.stub().resolves()
      };

      testScope.connection = {
        createChannel: sinon.stub().resolves(testScope.channel),
        createConfirmChannel: sinon.stub().resolves(testScope.channel)
      };

      testScope.testAMQP = {
        connect: sinon.stub().resolves(testScope.connection),
      };

      testScope.testLogger = {
        info: sinon.stub(),
        log: sinon.stub(),
        error: sinon.stub()
      };

      testScope.bus = new Bus({
        connectionUrl: 'amqp://someurl',
        rootExchange: 'root.exchange',
        serviceName: testScope.serviceName,
        environment: 'test',
        AMQPLib: testScope.testAMQP,
        logger: testScope.testLogger
      });
    });

    describe('intialize', function() {
      beforeEach(function() {
        const testScope = this;

        testScope.queue.queue = 'test.tester';
        return testScope.bus.init();
      });

      it('should connect', function() {
        const testScope = this;

        assert(testScope.testAMQP.connect.calledOnce, 'Should have been called once');
      });

      it('should connect with stub connection string', function() {
        const testScope = this;

        assert.equal(testScope.testAMQP.connect.firstCall.args[0], 'amqp://someurl');
      });

      it('should create a confirming channel', function() {
        const testScope = this;

        assert(testScope.connection.createConfirmChannel.calledOnce, 'Should have created a confirming channel');
      });

      it('should not have called createChannel', function() {
        const testScope = this;

        assert(testScope.connection.createConfirmChannel.called, 'Should have called regular createChannel');
      });

      it('should call assertExchange', function() {
        const testScope = this;

        assert(testScope.channel.assertExchange.called, 'Should attempt to create an exchange');
      });

      it('should call assertExchange twice, once for root and one for the dead letter', function() {
        const testScope = this;

        assert.equal(testScope.channel.assertExchange.callCount, 2, 'Should have have been called twice');
      });

      it('should assert the root exchange', function() {
        const testScope = this;

        assert.equal(testScope.channel.assertExchange.secondCall.args[0], 'root.exchange', 'Dead letter exchange should have been created');
      });

      it('should call prefetch', function() {
        const testScope = this;

        assert.equal(testScope.channel.prefetch.firstCall.args[0], 1, 'Prefetch should be initialized to 1 message at a time.');
      });

      it('should assert the deadletter exchange', function() {
        const testScope = this;

        assert.equal(testScope.channel.assertExchange.firstCall.args[0], 'test.tester', 'Dead letter exchange should have been created');
      });

      it('should assert the deadletter queue', function() {
        const testScope = this;

        assert.equal(testScope.channel.assertQueue.firstCall.args[0], 'test.tester', 'Dead letter queue should have been created');
        assert.ok(testScope.channel.assertQueue.firstCall.args[1].durable, 'The durable option should be set.');
        assert.equal(testScope.channel.assertQueue.firstCall.args[1].durable, true, 'Dead letter should have been initialized as duarable');
      });

      it('should assert the deadletter exchange is bound to the queue', function() {
        const testScope = this;

        assert.equal(testScope.channel.bindQueue.firstCall.args[0], 'test.tester', 'First argument should be the queue name.');
        assert.equal(testScope.channel.bindQueue.firstCall.args[1], 'test.tester', 'Second argument should be the desired exchange');
        assert.equal(testScope.channel.bindQueue.firstCall.args[2], '#', 'The binding key should be all messages to this exchange');
      });
    });

    describe('Bind Event', function() {
      beforeEach(function() {
        const testScope = this;

        testScope.messageHandler = sinon.spy();
        testScope.promiseResolver = Q.defer();
        testScope.bus.connectionPromise = testScope.promiseResolver.promise;

      });

      it('Should generate with the correct queue name', function() {
        const testScope = this;
        testScope.promiseResolver.resolve(testScope.channel);
        return testScope.bus.bindEvent('message', testScope.messageHandler).then(function() {
          assert(testScope.channel.assertQueue.calledOnce, 'Should have called assert queue');
          assert.equal(testScope.channel.assertQueue.firstCall.args[0], 'test.tester.message');
        });
      });

      it('Should create the queue with the correct deadletter queue', function() {
        const testScope = this;
        testScope.promiseResolver.resolve(testScope.channel);

        return testScope.bus.bindEvent('message', testScope.messageHandler).then(function() {
          assert.ok(testScope.channel.assertQueue.calledOnce, 'Should have called assert queue');
          assert.ok(testScope.channel.assertQueue.firstCall.args[1].deadLetterExchange, '');
          assert.equal(testScope.channel.assertQueue.firstCall.args[1].deadLetterExchange, 'test.tester');
        });
      });

      it('Should bind the root queue with the correct arguments', function() {
        const testScope = this;
        testScope.promiseResolver.resolve(testScope.channel);

        testScope.queue.queue = 'test.tester.message';

        return testScope.bus.bindEvent('message', testScope.messageHandler).then(function() {
          assert(testScope.channel.bindQueue.calledTwice, 'Should have called to bind the queue');
          assert.equal(testScope.channel.bindQueue.firstCall.args[0], 'test.tester.message', 'Should select the correct queue');
          assert.equal(testScope.channel.bindQueue.firstCall.args[1], 'root.exchange', 'Should select the exchange name');
          assert.equal(testScope.channel.bindQueue.firstCall.args[2], 'message', 'The binding key should be the eventName');
        });
      });

      it('Should bind the dead letter queue with the correct arguments', function() {
        const testScope = this;
        testScope.promiseResolver.resolve(testScope.channel);

        testScope.queue.queue = 'test.tester.message';

        return testScope.bus.bindEvent('message', testScope.messageHandler).then(function() {
          assert(testScope.channel.bindQueue.calledTwice, 'Should have called to bind the queue');
          assert.equal(testScope.channel.bindQueue.secondCall.args[0], 'test.tester.message', 'Should select the correct queue');
          assert.equal(testScope.channel.bindQueue.secondCall.args[1], 'root.exchange', 'Should select the exchange name');
          assert.equal(testScope.channel.bindQueue.secondCall.args[2], 'test.tester.message', 'The second binding key should be the queuename');
        });
      });

      it('Should fail on null event name', function() {
        const testScope = this;
        testScope.promiseResolver.resolve(testScope.channel);

        assert.throws(function() {
          testScope.bus.bindEvent(null, testScope.messageHandler);
        }, /event name/);
      });

      it('Should fail on null handler', function() {
        const testScope = this;
        testScope.promiseResolver.resolve(testScope.channel);

        assert.throws(function() {
          testScope.bus.bindEvent('message', null);
        }, /handler/);
      });
    });

    describe('Send Bus Message', function() {
      beforeEach(function() {
        const testScope = this;

        testScope.messageHandler = sinon.spy();
        testScope.promiseResolver = Q.defer();
        testScope.bus.connectionPromise = testScope.promiseResolver.promise;

      });

      it('Should publish the message to the correct exchange', function() {
        const testScope = this;

        testScope.promiseResolver.resolve(testScope.channel);

        return testScope.bus.sendMessage('message', { message: 'message' })
        .then(function() {
          assert(testScope.channel.publish.calledOnce, 'Should have called publish');
          assert.equal(testScope.channel.publish.firstCall.args[0], 'root.exchange', 'Should publish to the root exchange');
        });
      });

      it('Should publish the message with the correct routing key', function() {
        const testScope = this;

        testScope.promiseResolver.resolve(testScope.channel);

        return testScope.bus.sendMessage('message', { value: { message: 'message' } })
        .then(function() {
          assert(testScope.channel.publish.calledOnce, 'Should have called publish');
          assert.equal(testScope.channel.publish.firstCall.args[1], 'message', 'The routing key should be correct');
        });
      });

      it('Should publish the message with the correct value', function() {
        const testScope = this;

        testScope.promiseResolver.resolve(testScope.channel);

        return testScope.bus.sendMessage('message', { value: { message: 'message' } })
        .then(function() {
          assert(testScope.channel.publish.calledOnce, 'Should have called publish');
          assert.deepEqual(JSON.parse(testScope.channel.publish.firstCall.args[2].toString('ascii')).value, { 'message': 'message' }, 'The message content should be correct');
        });
      });

      it('Should publish the message with the correct realm', function() {
        const testScope = this;

        testScope.promiseResolver.resolve(testScope.channel);

        return testScope.bus.sendMessage('message', { value: { message: 'message' } })
        .then(function() {
          assert(testScope.channel.publish.calledOnce, 'Should have called publish');
          assert.equal(JSON.parse(testScope.channel.publish.firstCall.args[2].toString('ascii')).realm, testScope.serviceName, 'The realm should be the service name.');
        });
      });

      it('Should publish the message with the correct date', function() {
        const testScope = this;

        testScope.promiseResolver.resolve(testScope.channel);

        return testScope.bus.sendMessage('message', { value: { message: 'message' } })
        .then(function() {
          assert(testScope.channel.publish.calledOnce, 'Should have called publish');
          assert.ok(JSON.parse(testScope.channel.publish.firstCall.args[2].toString('ascii')).date, 'the date field should be populated.');
        });
      });

      it('Should publish the message with the content type', function() {
        const testScope = this;

        testScope.promiseResolver.resolve(testScope.channel);

        return testScope.bus.sendMessage('message', { message: 'message' })
        .then(function() {
          assert(testScope.channel.publish.calledOnce, 'Should have called publish');
          assert.deepEqual(testScope.channel.publish.firstCall.args[3].contentType, 'application/json', 'The content type should be "application/json"');
        });
      });

      it('Should fail on null message type', function() {
        const testScope = this;
        testScope.promiseResolver.resolve(testScope.channel);
        const message = 'message';
        assert.throws(function() {
          testScope.bus.sendMessage(null, { message });
        }, /event name/);
      });

      it('Should fail on null message', function() {
        const testScope = this;
        testScope.promiseResolver.resolve(testScope.channel);
        assert.throws(function() {
          testScope.bus.sendMessage('message', null);
        }, /object message/);
      });
    });

    describe('Timing out message', function() {
      beforeEach(function() {
        const testScope = this;

        testScope.handlerFcn = function() {

        };

        testScope.messageContent = {
          event: 'someEvent',
          value: {
            _id: 'mongoid'
          }
        };

        testScope.message = {
          fields: {},
          content: Buffer.from(JSON.stringify(testScope.messageContent), 'utf8'),
          properties: {
            headers: {
              'content-type': 'application/json',
              messageId: uuid.v4()
            }
          }
        };
      });

      it('Should nack a received message when one fails', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;
        testScope.bus.timeout = 0;
        testScope.bus.messageHandlers['someEvent'] = [
          Q.denodeify(testScope.handlerFcn)
        ];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.channel.nack.calledOnce, 'Should have nack\'d the message');
        });
      });
    });

    describe('Consuming message', function() {
      beforeEach(function() {
        const testScope = this;

        testScope.handlerFcn = sinon.stub();

        testScope.messageContent = {
          event: 'someEvent',
          value: {
            _id: 'mongoid'
          }
        };

        testScope.messageId = uuid.v4();

        testScope.message = {
          fields: {},
          content: Buffer.from(JSON.stringify(testScope.messageContent), 'utf8'),
          properties: {
            headers: {
              'content-type': 'application/json',
              messageId: testScope.messageId
            }
          }
        };

      });

      it('should ack a received message', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;
        testScope.handlerFcn = testScope.handlerFcn.callsArg(1);
        testScope.bus.messageHandlers['someEvent'] = [Q.denodeify(testScope.handlerFcn)];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.channel.ack.calledOnce, 'Should have ack\'d the message');
        });
      });

      it('should log the messageId', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;
        testScope.handlerFcn = testScope.handlerFcn.callsArg(1);
        testScope.bus.messageHandlers['someEvent'] = [Q.denodeify(testScope.handlerFcn)];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          const logMessage = testScope.testLogger.info.firstCall.args[0];
          assert.ok(logMessage.indexOf(testScope.messageId) > 0, 'Must log the supplied messageId');
        });
      });

      it('should ack a received message with two callbacks', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;
        testScope.handlerFcn = testScope.handlerFcn.callsArg(1);
        testScope.bus.messageHandlers['someEvent'] = [
          Q.denodeify(testScope.handlerFcn),
          Q.denodeify(testScope.handlerFcn)
        ];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.handlerFcn.calledTwice, 'Should have called the handler twice');
          assert(testScope.channel.ack.calledOnce, 'Should have ack\'d the message');
        });
      });

      it('should nack a received message when one fails', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;

        testScope.handlerFcn = testScope.handlerFcn.callsArg(1);
        testScope.handlerErrorFcn = sinon.stub().callsArgWith(1, new Error('stub error'));

        testScope.bus.messageHandlers['someEvent'] = [
          Q.denodeify(testScope.handlerFcn),
          Q.denodeify(testScope.handlerErrorFcn)
        ];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.handlerFcn.calledOnce, 'Should have called the handler twice');
          assert(testScope.handlerErrorFcn.calledOnce, 'Should have called the error function');
          assert(testScope.channel.nack.calledOnce, 'Should have nack\'d the message');
          assert(testScope.channel.ack.callCount === 0, 'Should not have ack\'d the message');
        });
      });

      it('should nack a received message when its being redelivered', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;

        testScope.message.fields.redelivered = true;

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.channel.nack.calledOnce, 'Should have nack\'d the message');
          assert(testScope.channel.ack.callCount === 0, 'Should not have ack\'d the message');
        });
      });

      it('should log the error stack if available', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;

        testScope.handlerFcn = testScope.handlerFcn.callsArg(1);
        testScope.handlerErrorFcn = sinon.stub().callsArgWith(1, new Error('stub error'));

        testScope.bus.messageHandlers['someEvent'] = [
          Q.denodeify(testScope.handlerFcn),
          Q.denodeify(testScope.handlerErrorFcn)
        ];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.testLogger.error.args[0][0].includes('Error: stub error'));
          assert(testScope.testLogger.error.args[0][0].includes('at Context.'));
        });
      });

      it('should log the error message if no stack is available', function() {
        const testScope = this;

        function CustomError(msg) {
          Error.call(this);
          // By default, V8 limits the stack trace size to 10 frames.
          Error.stackTraceLimit = -1;
          this.message = msg;
          this.name = 'CustomError';
        }

        testScope.bus.channel = testScope.channel;

        testScope.handlerFcn = testScope.handlerFcn.callsArg(1);
        testScope.handlerErrorFcn = sinon.stub().callsArgWith(1, new CustomError('no stack trace'));

        testScope.bus.messageHandlers['someEvent'] = [
          Q.denodeify(testScope.handlerFcn),
          Q.denodeify(testScope.handlerErrorFcn)
        ];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.testLogger.error.args[0][0].includes('no stack trace'));
        });
      });

      it('should receive a message', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;
        testScope.handlerFcn = testScope.handlerFcn.callsArg(1);
        testScope.bus.messageHandlers['someEvent'] = [Q.denodeify(testScope.handlerFcn)];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.handlerFcn.calledOnce, 'Should have called the handler function');
        });
      });

      it('should preserve the original message even if a previous handler mutates it', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;
        testScope.firstHandlerFcn = (message, callback) => {
          message.value.foo = 'bar';
          callback();
        };
        testScope.secondHandlerFcn = sinon.stub().callsArg(1);
        testScope.bus.messageHandlers['someEvent'] = [
          Q.denodeify(testScope.firstHandlerFcn),
          Q.denodeify(testScope.secondHandlerFcn)
        ];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert.ok(!testScope.secondHandlerFcn.firstCall.args[0].value.foo, 'Should not have mutated the message');
        });
      });

      it('should nack if failed to process received message', function() {
        const testScope = this;

        testScope.bus.channel = testScope.channel;
        testScope.handlerFcn = testScope.handlerFcn.callsArgWith(1, new Error());
        testScope.bus.messageHandlers['someEvent'] = [Q.denodeify(testScope.handlerFcn)];

        return testScope.bus.consumeMessage('someEvent')(testScope.message).then(function() {
          assert(testScope.channel.nack.calledOnce, 'Should have nack\'d the message');
        });
      });
    });

    describe('Messages Middleware', function() {
      it('should call the middleware', function() {
        const testScope = this;
        let callCount = 0;

        testScope.bus.addMiddleware(function(req, res, next) {
          callCount++;
          return next();
        });

        const messageHandlerSpy = sinon.stub().resolves();
        const middlewarePromise = testScope.bus.performMiddleware({ testVal: 'val' }, messageHandlerSpy);

        return middlewarePromise.then(function() {
          assert.equal(callCount, 1, 'This must have been called once');
          assert.ok(messageHandlerSpy.calledOnce, 'Post-middleware handler spy must have been called once');
        });
      });

      it('should work with 3 middleware', function() {
        const testScope = this;
        let callCount = 0;

        function middlewareFunction(req, res, next) {
          callCount++;
          return next();
        }

        testScope.bus.addMiddleware(middlewareFunction);
        testScope.bus.addMiddleware(middlewareFunction);
        testScope.bus.addMiddleware(middlewareFunction);

        const messageHandlerSpy = sinon.stub().resolves();
        const middlewarePromise = testScope.bus.performMiddleware({ testVal: 'val' }, messageHandlerSpy);

        return middlewarePromise.then(function() {
          assert.equal(callCount, 3, 'This must have been called three times');
          assert.ok(messageHandlerSpy.calledOnce, 'Post-middleware handler must have been called once');
        });
      });

      it('should call after next clause', function() {
        const testScope = this;
        let callCount = 0;

        function middlewareFunction(req, res, next) {
          return next().then(function(result) {
            assert.equal(result.testSuccess, true, 'Should have succeeded');
            callCount++;
          });
        }

        testScope.bus.addMiddleware(middlewareFunction);

        const messageHandlerSpy = sinon.stub().resolves({ testSuccess: true });
        const middlewarePromise = testScope.bus.performMiddleware({ testVal: 'val' }, messageHandlerSpy);

        return middlewarePromise.then(function() {
          assert.equal(callCount, 1, 'Middleware must be called once');
          assert.ok(messageHandlerSpy.calledOnce, 'Post-middleware handler must have been called once');
        });
      });

      it('should allow you to return any promise', function() {
        const testScope = this;
        let callCount = 0;

        function middlewareFunction(req, res, next) {
          return new Q.Promise(function(resolve) { resolve(); }).then(function() {
            callCount++;
            return next();
          });
        }

        testScope.bus.addMiddleware(middlewareFunction);

        const messageHandlerSpy = sinon.stub().resolves({ testSuccess: true });
        const middlewarePromise = testScope.bus.performMiddleware({ testVal: 'val' }, messageHandlerSpy);

        return middlewarePromise.then(function() {
          assert.equal(callCount, 1, 'Middleware must be called once');
          assert.ok(messageHandlerSpy.calledOnce, 'Post-middleware handler must have been called once');
        });
      });

      it('it must error if we return a non promise from the middleware function', function() {
        const testScope = this;
        let callCount = 0;

        function middlewareFunction(req, res, next) {
          callCount++;
          next();
          return req;
        }

        testScope.bus.addMiddleware(middlewareFunction);

        const messageHandlerSpy = sinon.stub().rejects(new Error());
        const middlewarePromise = testScope.bus.performMiddleware({ testVal: 'val' }, messageHandlerSpy);

        return middlewarePromise.then(function() {
          return Q.reject('Should not have called this method, this should have failed!');
        }, function(error) {
          assert.equal(callCount, 1, 'Middleware have called the error handler once');
          assert.ok(error instanceof assert.AssertionError);
          return Q.resolve();
        });
      });

      it('if the call fails then middleware should know', function() {
        const testScope = this;
        let callCount = 0;

        function middlewareFunction(req, res, next) {
          return next().then(null, function() {
            callCount++;

            return Q.reject(new Error());
          });
        }

        testScope.bus.addMiddleware(middlewareFunction);

        const messageHandlerSpy = sinon.stub().rejects(new Error());
        const middlewarePromise = testScope.bus.performMiddleware({ testVal: 'val' }, messageHandlerSpy);

        return middlewarePromise.then(function() {
          return Q.reject('Should not have called this method, this should have failed!');
        }, function() {
          assert.equal(callCount, 1, 'Middleware have called the error handler once');
          assert.ok(messageHandlerSpy.calledOnce, 'Post-middleware handler must have been called once');
        });
      });
    });

    describe('Deadletter Queue', function() {
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
              messageId: testScope.messageId,
              originalRoutingKey: 'someEvent'
            }
          }
        };

        testScope.bus.connectionPromise = Q.resolve(testScope.channel);
      });

      it('should cancel when the handler function rejects', function() {
        const testScope = this;
        return new Q.Promise(function(resolve) {
          testScope.channel.consume = sinon.stub().callsArgWith(1, testScope.message);
          testScope.bus.listenDeadLetterQueue(function() {
            resolve();

            return Q.reject();
          });
        }).then(function() {
          return Q.delay();
        }).then(function() {
          assert(testScope.channel.cancel.calledOnce, 'must call the cancel function on rejected handler');
        });
      });

      it('should ack a message if promise is resolved with delete action', function() {
        const testScope = this;
        const deadletterActions = require('./../lib/deadletterActions');

        return new Q.Promise(function(resolve) {
          testScope.channel.consume = sinon.stub().callsArgWith(1, testScope.message);
          testScope.bus.listenDeadLetterQueue(function() {
            resolve();
            return Q.resolve(deadletterActions.DELETE_MESSAGE);
          });
        }).then(function() {
          return Q.delay();
        }).then(function() {
          assert(testScope.channel.ack.calledOnce, 'the message must be deleted by acknowledgement');
        });
      });

      it('should re-enqueue a message if promise is resolved with re-enqueue action', function() {
        const testScope = this;
        const deadletterActions = require('./../lib/deadletterActions');

        return new Q.Promise(function(resolve) {
          testScope.channel.consume = sinon.stub().callsArgWith(1, testScope.message);
          testScope.bus.listenDeadLetterQueue(function() {
            resolve();
            return Q.resolve(deadletterActions.REENQUEUE_MESSAGE);
          });
        }).then(function() {
          return Q.delay();
        }).then(function() {
          assert(testScope.channel.ack.calledOnce, 'the message must be deleted by acknowledgement');
          assert(testScope.channel.publish.calledOnce, 'the message must be re-enqueued');

          const publishArgs = testScope.channel.publish.firstCall.args;

          assert.equal(publishArgs[0], 'root.exchange', 'must post to the root exchange');
          assert.equal(publishArgs[1], 'test.tester.someEvent', 'must with the correct routing key');
          assert.equal(publishArgs[3].headers.originalRoutingKey, 'someEvent', 'must preserve the original routing key');
        });
      });

      it('should send to the back of deadletter if promise is resolved with sendback action', function() {
        const testScope = this;
        const deadletterActions = require('./../lib/deadletterActions');

        return new Q.Promise(function(resolve) {
          testScope.channel.consume = sinon.stub().callsArgWith(1, testScope.message);
          testScope.bus.listenDeadLetterQueue(function() {
            resolve();
            return Q.resolve(deadletterActions.SEND_TO_BACK);
          });
        }).then(function() {
          return Q.delay();
        }).then(function() {
          assert(testScope.channel.ack.calledOnce, 'the message must be deleted by acknowledgement');
          assert(testScope.channel.publish.calledOnce, 'the message must be re-enqueued');

          const publishArgs = testScope.channel.publish.firstCall.args;

          assert.equal(publishArgs[0], 'test.tester', 'must post to the deadletter exchange');
          assert.equal(publishArgs[1], 'test.tester', 'must have the deadletter queue routing key');
          assert.equal(publishArgs[3].headers.originalRoutingKey, 'someEvent', 'must preserve the original routing key');
        });
      });
    });
  });
});
