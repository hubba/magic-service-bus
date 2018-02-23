const AMQP = require('amqplib');
const assert = require('assert');
const uuid = require('uuid');
const Q = require('q');
const url = require('url');
const DeadletterActions = require('./deadletterActions');

class Bus {
  constructor({
    connectionUrl = null,
    rootExchange = 'root.exchange',
    serviceName = 'global',
    environment = process.env.NODE_ENV || 'development',
    AMQPLib = AMQP,
    logger = console,
    timeout = 1000 * 60 * 5,
    messageConcurrency = 1
  } = {}) {
    assert.ok(connectionUrl, 'You must provide a connection string');

    this.connectionUrl = connectionUrl;
    this.rootExchange = rootExchange;
    this.serviceName = serviceName;
    this.environment = environment;
    this.rabbitMQ = AMQPLib;
    this.logger = logger;
    this.timeout = timeout;
    this._middlewareStack = [];
    this.prefetch = messageConcurrency;
    this.messageHandlers = {};
  }

  init() {
    const parsedurl = url.parse(this.connectionUrl);
    this.connectionPromise = this.rabbitMQ.connect(this.connectionUrl, { servername: parsedurl.hostname })
    .then((connection) => {
      this.connection = connection;

      return connection.createConfirmChannel();
    }).then((channel) => {
      this.channel = channel;

      /**
      * Lets make sure that the root exchange is created,
      * with durable settings.
      */

      return channel.assertExchange(this.generateDeadLetterExchangeName(), 'topic')
      .then(() => {
        return channel.assertQueue(this.generateDeadLetterQueueName(), {
          durable: true
        });
      }).then((queue) => {
        return channel.bindQueue(queue.queue, this.generateDeadLetterExchangeName(), '#');
      }).then(() => {
        return channel.assertExchange(this.rootExchange, 'topic', {
          durable: true
        });
      }).then(() => {
        return channel.prefetch(this.prefetch);
      }).then(() => {
        return channel;
      });
    });

    return this.connectionPromise;
  }

  disconnect() {
    assert(this.connectionPromise, 'You must have a connection or pending connection');

    return this.connectionPromise.then((channel) => {
      return channel.close();
    }).then(() => {
      return this.connection.close();
    }).then(() => {
      this.messageHandlers = {};
    });
  }
  /**
     * Bind an event name to a function.
     *
     * When a message of type {eventName} is recieved, this will call {handler}.
     *
     * This is an async method that will ensure that exchange has been created, and
     * ensure/create that the queue.
     *
     * @param {string} eventName An event name that this listener should listen to
     * @param {Function(message,callback)} handler A function to be called when a message is recieved.
     *
     * @return {Promise<>} returns an empty promise once the consumer has been setup on the channel.
     */
  bindEvent(eventName, handler) {
    assert.ok(typeof eventName === 'string', 'You must provide a string event name to bind to.');
    assert.ok(typeof handler === 'function', 'You must provide a handler function');
    assert.ok(this.connectionPromise, 'You must init before binding an event');

    return this.connectionPromise
    .then((channel) => {
      const queueName = this.generateQueueName(eventName);
      return channel.assertQueue(queueName, {
        durable: true,
        deadLetterExchange: this.generateDeadLetterExchangeName()
      }).then(function(queue) {
        return [channel, queue];
      });
    })
    .then(([channel, queue]) => {
      return channel.bindQueue(queue.queue, this.rootExchange, eventName).then(() => {
        return channel.bindQueue(queue.queue, this.rootExchange, queue.queue);
      }).then(function() {
        return [channel, queue];
      });
    })
    .then(([channel, queue]) => {
      if (!this.messageHandlers[eventName]) {
        this.messageHandlers[eventName] = this.messageHandlers[eventName] || [];
        channel.consume(queue.queue, this.consumeMessage(eventName));
      }

      const handlerFunction = Q.denodeify(handler);
      this.messageHandlers[eventName].push(handlerFunction);
    });
  }

  /**
     *
     * @param {Any} message The message payload.
     * @param {Function -> Promise<Any>} handler once all the middleware has been called this will be called.
     *
     * @returns Promise<Any> will return a promise.
     */
  performMiddleware(message, handler) {
    let currentStackIdx = 0;

    const next = () => {
      if (currentStackIdx < this._middlewareStack.length) {
        const middlewarePromise = this._middlewareStack[currentStackIdx++](message, handler, next);
        if (!middlewarePromise || typeof middlewarePromise.then !== 'function') {
          return Q.reject(new assert.AssertionError({
            message: 'middleware functions must provide a thenable'
          }));
        } else {
          return middlewarePromise;
        }
      } else {
        return handler(message);
      }
    };

    return next();
  }


    /**
     * 
     * @param {string} eventName the event name that the consumer will be bound with.
     * @param {Function(message,callback)} handler the wrapped handler function that will be called upon message.
     *
     * @return Function(message) Returns a function that will process the message and call any required middleware.
     */
  consumeMessage(eventName) {
    return (message) => {

      const requestUuid = message.properties.headers.messageId;
      this.logger.info(`Beginning processing event: ${requestUuid} - event name: ${eventName}`);

      if (message.fields.redelivered) {
        this.logger.error(`Finished processing event: ${requestUuid} - WITH REDELIVERY ERROR - event name: ${eventName} - nacking`);

        return this.channel.nack(message, false, false);
      }
      const messageContent = JSON.parse(message.content.toString('utf8'));

      const handlerPromise = this.performMiddleware(messageContent, (middlewareMessage) => {
        const messageHandlersArray = this.messageHandlers[eventName] || [];

        return messageHandlersArray.reduce(function(previous, item) {
          return previous.then(function() {
            const messageClone = JSON.parse(JSON.stringify(middlewareMessage));
            return item(messageClone);
          });
        }, Q.resolve());
      });

      return Q.timeout(handlerPromise, this.timeout).then((result) => {
        this.logger.info(`Finished processing event: ${requestUuid} - event name: ${eventName}`);

        if (result) {
          this.logger.debug(`Got result: ${result}`);
        }

        return this.channel.ack(message);
      }, (error) => {

        let errorMessage = JSON.stringify(error);

        if (error instanceof Error || error.message || error.stack) {
          errorMessage = error.stack || error.message;
        }

        this.logger.error(`Finished processing event: ${requestUuid} - WITH ERROR: ${errorMessage} - event name: ${eventName} - nacking`);

        return this.channel.nack(message, false, false);
      });
    };
  }

  /**
     *
     * @param {Function:Promise<Any>} messageMiddleware a middleware function. middleware function must return next() promise.
     */
  addMiddleware(messageMiddleware) {
    assert.ok(messageMiddleware, 'Middleware must be defined');
    assert.ok(typeof messageMiddleware === 'function', 'Middleware must be defined as a function');

    this._middlewareStack.push(messageMiddleware);
  }

  /**
     * send a message to all the services/queues that listen to the event.
     *
     * @param {string} eventName the event name to send.
     * @param {Object} message a message object.
     */
  sendMessage(eventName, message) {
    assert.ok((typeof message === 'object') && (message !== null), 'You must provide an object message');
    assert.ok(typeof eventName === 'string', 'You must provide a valid event name');

    var payload = {
      date: new Date(),
      realm: this.serviceName,
      event: eventName,
      value: message.value
    };

    return this.connectionPromise
    .then((channel) => {
      return channel.publish(this.rootExchange, eventName, Buffer.from(JSON.stringify(payload), 'utf8'), {
        contentType: 'application/json',
        mandatory: true,
        persistent: true,
        headers: {
          sentFromService: this.serviceName,
          originalRoutingKey: eventName,
          messageId: uuid.v4()
        }
      });
    });
  }

  /**
     * Process each element in the queue, one at a time.
     *
     * @param {Function(message):Promise<DeadletterStatus>} onEvent
     */
  listenDeadLetterQueue(onEvent) {
    return this.connectionPromise.then((channel) => {
      const consumerTag = uuid.v4();

      const consumeDeadletterEvent = (message) => {
        const { originalRoutingKey, sentFromService, messageId } = message.properties.headers;
        this.logger.info(`Processing messageId: ${messageId}`);

        this.runEventHandler(onEvent, message)
        .then((response) => {
          if (response === DeadletterActions.DELETE_MESSAGE) {
            this.logger.info(`Deleting: ${messageId} from the queue`);
            channel.ack(message);

          } else if (response === DeadletterActions.REENQUEUE_MESSAGE) {
            channel.ack(message);

            channel.publish(this.rootExchange, this.generateQueueName(originalRoutingKey), message.content, {
              contentType: 'application/json',
              mandatory: true,
              persistent: true,
              headers: {
                sentFromService,
                originalRoutingKey,
                messageId
              }
            });

            this.logger.info(`Re-enqueued message: ${messageId}`);
            return true;
          } else if (response === DeadletterActions.SEND_TO_BACK) {
            channel.ack(message);

            channel.publish(this.generateDeadLetterExchangeName(), this.generateDeadLetterQueueName(), message.content, {
              contentType: 'application/json',
              mandatory: true,
              persistent: true,
              headers: {
                sentFromService,
                originalRoutingKey,
                messageId
              }
            });
          } else {
            return Q.reject(new Error('Shutting down consumer'));
          }
        })
        .catch(function() {
          return channel.cancel(consumerTag);
        });
      };

      return channel.consume(this.generateDeadLetterQueueName(), consumeDeadletterEvent, {
        consumerTag
      });
    });
  }

  runEventHandler(onEvent, message) {
    return new Promise(function(resolve, reject) {
      Q.when(onEvent(message)).then(resolve, reject);
    });
  }

  /**
     * @alias bindEvent
     * @param {string} eventName the event name to send.
     * @param {Function(message,callback)} handler function handler to bind to the event.
     */
  on(eventName, handler) {
    return this.bindEvent(eventName, handler);
  }

  /**
     *
     * @alias sendMessage
     * @param {string} eventName the event name to send.
     * @param {Object} message a message object.
     */
  emit(eventName, message) {
    return this.sendMessage(eventName, message);
  }

  generateQueueName(eventName) {
    return `${this.environment}.${this.serviceName}.${eventName}`;
  }

  generateDeadLetterExchangeName() {
    return `${this.environment}.${this.serviceName}`;
  }

  generateDeadLetterQueueName() {
    return this.generateDeadLetterExchangeName();
  }
}

module.exports = Bus;
