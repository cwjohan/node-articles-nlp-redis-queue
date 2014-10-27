# Node-Articles-NLP

Running Node all the way from development to production on Heroku.

Check it out at [http://node-articles-nlp-redis-queue.herokuapp.com/](http://node-articles-nlp-redis-queue.herokuapp.com/).

[![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/cwjohan/node-articles-nlp-redis-queue)

## Local dependencies

- [Redis](http://redis.io/) for sessions
- [MongoDB](http://www.mongodb.org/) for data
- [node-redis-queue](https://github.com/cwjohan/node-articles-nlp-redis-queue) for job queueing

## Installing

```
$ brew install redis mongodb
$ brew services start mongodb
$ brew services start redis
$ npm install
```

## Running

1. `npm start`
2. [http://localhost:5000](http://localhost:5000)

## Deploying

Deploying is easy - just use the Heroku Button:

[![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/cwjohan/node-articles-nlp-redis-queue)

If you'd rather clone locally and then deploy through the CLI, you can do that too:

```
git clone https://github.com/cwjohan/node-articles-nlp-redis-queue.git
cd node-articles-nlp

heroku create

heroku addons:add mongohq
heroku addons:add rediscloud

heroku config:set NODE_ENV=production
heroku config:set VIEW_CACHE=true
heroku config:set THRIFTY=true
heroku config:set QUEUE_CONFIG_FILE=/app/redis-queue-config.json

git push heroku master
heroku open
```

## Config

Environment variables are mapped to a config object in [lib/config.js](https://github.com/cwjohan/node-articles-nlp-redis-queue/blob/master/lib/config.js).
This provides reasonable defaults as well as a layer of generalization
(`process.env.REDISCLOUD_URL` => `config.redis_url`).

You can locally override the defaults by
[adding variables to a .env file](https://github.com/strongloop/node-foreman#environmental-variables).

## Scaling

The app is separated into two tiers:

- the web tier ([server.js](https://github.com/cwjohan/node-articles-nlp-redis-queue/blob/master/lib/server.js))
- the worker tier ([worker.js](https://github.com/cwjohan/node-articles-nlp-redis-queue/blob/master/lib/worker.js))

This enables horizontally scaling both web traffic and long-running jobs.

#### On Heroku

The default deploy configuration includes `THRIFTY=true`, which starts the app in single-dyno mode (free!).
With `THRIFTY=true`, the web process handles both http requests and queued jobs.

Similarly, the default configuration does not include a `CONCURRENCY` value, which means only one Cluster
worker will be created per process. This is to keep under free levels of addon connection limits (like redis).

Of course, a production app should never run in a single instance or make users wait for worker processes.
Additionally, allowing Cluster to take advantage of all the CPUs on a dyno can improve performance.
When you're ready to test in staging or deploy to production, you can scale beyond single-dyno mode:

```
heroku config:unset THRIFTY
heroku config:set CONCURRENCY=4
heroku ps:scale web=2X:2 worker=2X:1
```

**note:** You'll need to upgrade your addons in order to scale your processes.
The free addons from this app restrict the number of concurrent connections you can maintain.

#### Locally

`npm start` runs [node-foreman](http://strongloop.github.io/node-foreman/),
which will check the [Procfile](https://github.com/cwjohan/node-articles-nlp-redis-queue/blob/master/Procfile)
and start a single web process and a single worker process.

To test that your app behaves correctly when clustered in multiple processes,
you can [specify process scales](https://github.com/strongloop/node-foreman#advanced-usage) to node-forman
and [set `CONCURRENCY=4`](https://github.com/strongloop/node-foreman#environmental-variables) in a local .env file.

## Architecture

Writing maintainable Node apps is all about separating concerns into small, well-defined modules.
This barebones app has three distinct components with their own responsibilities:

#### App

The business logic is all in [lib/app](https://github.com/cwjohan/node-articles-nlp-redis-queue/tree/master/lib/app).
This module orchestrates and provides a facade for the underlying
MongoDB database and the node-redis-queue job queue.

#### Web

The user-facing portion of the project lies in [lib/web](https://github.com/cwjohan/node-articles-nlp-redis-queue/tree/master/lib/web).
This module is responsible for providing an http interface and routing requests.
It *shows* things and relies on an App instance to *do* things.

#### Worker

The background processes run through [lib/worker](https://github.com/cwjohan/node-articles-nlp-redis-queue/blob/master/lib/worker.js).
This module is tiny - it just instantiates an App instance to process the job queue.

## Change Log

**v0.0.3**: First cut at replacing amqp with node-redis-queue, but with vote queue disabled, due to
a queue stall issue when the vote queue is empty upon starting the app.

**v0.0.7**: Fixes the stall issue; vote queue no longer disabled; works fine in local test environment;
not working properly when deployed to Heroku; reason unknown but under investigation.  

**v0.0.8**: Appears to fix issue with RedisCloud queues not working, but requires a separate worker process. Not working
properly in single process thrifty mode when using remote RedisCloud. Works fine in a local test environment with
a local instance of redis-server.

**v0.0.9**: Works in thrifty mode by using node-foreman to run separate web and worker sub-processes in a single Heroku web process.

