var logger = require('logfmt');
var Promise = require('promise');
var uuid = require('node-uuid');
var EventEmitter = require('events').EventEmitter;

var connections = require('./connections');
var ArticleModel = require('./article-model');

var SCRAPE_QUEUE = 'jobs.scrape';
var VOTE_QUEUE = 'jobs.vote';

function App(config) {
  EventEmitter.call(this);

  this.connections = connections(config.mongo_url, config.redis_url);
  this.connections.once('ready', this.onConnected.bind(this));
  this.connections.once('lost', this.onLost.bind(this));
}

module.exports = function createApp(config) {
  return new App(config);
};

App.prototype = Object.create(EventEmitter.prototype);

App.prototype.onConnected = function() {
  this.Article = ArticleModel(this.connections.db);
  this.scrapeQueue = this.connections.queueBroker.createQueue(SCRAPE_QUEUE);
  this.voteQueue = this.connections.queueBroker.createQueue(VOTE_QUEUE);
  logger.log({ type: 'info', msg: 'app.ready' });
  this.emit('ready');
};

App.prototype.onLost = function() {
  logger.log({ type: 'info', msg: 'app.lost' });
  this.emit('lost');
};

App.prototype.addArticle = function(userId, url) {
  logger.log({type: 'info', msg: 'enqueuing', url: url, userId: userId});
  var id = uuid.v1();
  this.scrapeQueue.send({ id: id, url: url, userId: userId });
  return Promise.resolve(id);
};

App.prototype.scrapeArticle = function(userId, id, url) {
  logger.log({type: 'info', msg: 'scraping', url: url, userId: userId});
  return this.Article.scrape(userId, id, url);
};

App.prototype.addUpvote = function(userId, articleId) {
  logger.log({type: 'info', msg: 'upvoting', articleId: articleId, userId: userId});
  this.voteQueue.send({ userId: userId, articleId: articleId });
  return Promise.resolve(articleId);
};

App.prototype.upvoteArticle = function(userId, articleId) {
  logger.log({type: 'info', msg: 'upvoted', articleId: articleId, userId: userId});
  return this.Article.voteFor(userId, articleId);
};

App.prototype.purgePendingArticles = function() {
  logger.log({ type: 'info', msg: 'app.purgePendingArticles' });
  return new Promise(function(resolve, reject) {
    this.scrapeQueue.clear(onPurge);

    function onPurge(err, count) {
      if (err) return reject(err);
      resolve(count);
    }
  }.bind(this));
};

App.prototype.purgePendingVotes = function() {
  logger.log({ type: 'info', msg: 'app.purgePendingVotes' });
  return new Promise(function(resolve, reject) {
    this.voteQueue.clear(onPurge);

    function onPurge(err, count) {
      if (err) return reject(err);
      resolve(count);
    }
  }.bind(this));
};

App.prototype.getArticle = function(id) {
  return this.Article.get(id);
};

App.prototype.listArticles = function(userId, n) {
  return this.Article.list(userId, n);
};

App.prototype.startScraping = function() {
  this.scrapeQueue.consume(this.handleScrapeJob.bind(this));
  this.voteQueue.consume(this.handleVoteJob.bind(this));
  return this;
};

App.prototype.handleScrapeJob = function(job, ack) {
  logger.log({ type: 'info', msg: 'handling job', queue: SCRAPE_QUEUE, url: job.url });

  this
    .scrapeArticle(job.userId, job.id, job.url)
    .then(onSuccess, onError);

  function onSuccess() {
    logger.log({ type: 'info', msg: 'job complete', status: 'success', url: job.url });
    ack();
  }

  function onError() {
    logger.log({ type: 'info', msg: 'job complete', status: 'failure', url: job.url });
    ack();
  }
};

App.prototype.handleVoteJob = function(job, ack) {
  logger.log({ type: 'info', msg: 'handling job', queue: VOTE_QUEUE, articleId: job.articleId });

  this
    .upvoteArticle(job.userId, job.articleId)
    .then(onSuccess, onError);

  function onSuccess() {
    logger.log({ type: 'info', msg: 'job complete', queue: VOTE_QUEUE, status: 'success' });
    ack();
  }

  function onError(err) {
    logger.log({ type: 'info', msg: 'job complete', queue: VOTE_QUEUE, status: 'failure', error: err });
    ack();
  }
};

App.prototype.stopScraping = function() {
  this.connections.queueBroker.destroyQueue(SCRAPE_QUEUE);
  this.connections.queueBroker.destroyQueue(VOTE_QUEUE);
  return this;
};

App.prototype.deleteAllArticles = function() {
  logger.log({ type: 'info', msg: 'app.deleteAllArticles' });
  return this.Article.deleteAll();
};
