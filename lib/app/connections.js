var config = require('../config');
var mongoose = require('mongoose');
var WorkQueueMgr = require('node-redis-queue').WorkQueueMgr;
var logger = require('logfmt');
var EventEmitter = require('events').EventEmitter;

function Connector(mongoUrl, redisUrl) {
  EventEmitter.call(this);

  var self = this;
  var readyCount = 0;

  this.db = mongoose.createConnection(mongoUrl)
    .on('connected', function() {
      logger.log({ type: 'info', msg: 'connected', service: 'mongodb' });
      ready();
    })
    .on('error', function(err) {
      logger.log({ type: 'error', msg: err, service: 'mongodb' });
    })
    .on('close', function(str) {
      logger.log({ type: 'error', msg: 'closed', service: 'mongodb' });
    })
    .on('disconnected', function() {
      logger.log({ type: 'error', msg: 'disconnected', service: 'mongodb' });
      lost();
    });

  var qmgr = this.qmgr = new WorkQueueMgr('../redis-queue-config.json');
  if (config.thrifty) qmgr.connect2(onQmgrConnected); // 'full-duplex' mode.
  else qmgr.connect(onQmgrConnected); // 'half-duplex' mode.
  
  function onQmgrConnected() {
    logger.log({ type: 'info', msg: 'connected', service: 'node-redis-queue' });
    qmgr.on('error', function(err) {
      logger.log({ type: 'error', msg: err, service: 'node-redis-queue' });
    });
    qmgr.on('end', function() {
      logger.log({ type: 'error', msg: 'disconnected', service: 'node-redis-queue' });
      lost();
    });
    ready();
  }

  function ready() {
    if (++readyCount === 2) {
      self.emit('ready');
    }
  }

  function lost() {
    self.emit('lost');
  }
};

Connector.prototype = Object.create(EventEmitter.prototype);

module.exports = function(mongoUrl, redisUrl) {
  return new Connector(mongoUrl, redisUrl);
};
