---
layout: entry
title: Organizing node.js and Express web applications
---
I remember back when I was moving from Python to node.js, I had a culture shock because node.js didn't impose any strict file system structure on you. With Python, file and directory structure just sort of fell into place without much effort. With node.js though, this didn't seem to really come for free. node.js felt more like PHP to me, in regards to being sort of willy-nilly whatever.

As any programmer would, I tried my hardest to mimic Python directory, file and class structure in my node.js applications - web applications, most commonly. I used [Express](http://expressjs.com/) and still prefer it over the other alternatives, like the Flatiron offerings. I like what I see from the Flairon projects but I actually had performance issues with their modules, so I stuck with Express. This probably isn't the case anymore though, so don't take my word for it. I urge you to experiment with the different modules. Regardless, I went through many iterations of my Python-esque organizational decisions. I finally found one that I really enjoyed and it allowed me to be flexible in how I added new features to it. I sort of consider it my version of [David's awesome job](http://37signals.com/svn/posts/3389-your-lifes-work) ... except it's not a job and it doesn't really provide me any company or friends or fun or money. I'd be happy if it were the last web toolkit I use, though.

## The directory structure

The following sequence of commands became burned into my mind.

{% highlight bash %}
$ mkdir next-big-site; cd next-big-site
$ mkdir src; mkdir bin; mkdir src/routes
$ touch bin/next-big-site.js; touch src/server.js; src/routes/index.js
$ mkdir src/routes/posts; touch src/routes/posts/index.js
{% endhighlight %}

I'd totally take a screenshot to show you what that structure looks like graphically but I don't know of a good way to do that, and for that I am sorry. I will gladly explain it, though.

I really love designing my projects around my data entities. This can be tricky as your project grows because you may not know all of your data up front. So, it's important to me to be able to scale that as the project grows. My project structure hopefully reflects that.

With these commands, you end up with a project directory that contains a `bin` and `src` directory. I reserve the `bin` directory for scripts that might do things like instanciate the server and begin listening of requests, or other scripts that might bootstrap a database schema or something. The `src` directory will hold all of the main source code for the project. The structure of the `src` directory is straight forward. In the root `src`, I create a `server.js` file which will hold the code for creating and exporting a function that setups up Express for me. Even though this web project will probably never be re-used, at least this way it's sort of modular. I really think that [substack](http://twitter.com/substack) would totally love that.

Now, back to the data entity thing. The `src` directory contains a directory specifically for route handlers, named `routes`. In this directory would go directories and files containing code for handling routes, organized by endpoint. For example, a blog app would have posts, and so I've created a directory named `posts` in this example, with an `index.js` file inside of it. `posts/index.js` will export a single function that attaches its' route handlers to the main Express server instance, which is created in the `server.js` file. `server.js` will import these route files and call this exported function so that the route handlers within it can handle their routes! Elementary.

## Web apps don't run on hope and empty files

No, they run on a lot of hope, dreams, money, gambles, friendships, talent and files full of code, so let us fill these files with code.

Lets start with the `server.js` file in the root of the `src` directory. This is the heart of the whole thing.

{% highlight javascript %}
var express = require('express');
var routes = require('./routes');

exports.createServer = function createServer () {
    
    var server = express();
    
    // specify middleware
    server.use(express.bodyParser());
    
    // attach router handlers
    routes.attachHandlers(server);
    
    return server;
    
};
{% endhighlight %}

Literally, all this file does is create the Express web server, specify the middleware that needs to be used, attaches the route handlers and finally returns the web server object. The `routes` are imported from the `routes` directory's `index.js` file. This file simply aggregates all of the route handlers in the `routes` directory's sub-directories. This part can be tweaked to just straight up include files instead of directories, but I felt like that poluted the main `server.js` file with a lot of imports. To each their own. Lets take a look at that `routes/index.js` file.

{% highlight javascript %}
exports.attachHandlers = function attachHandlers (server) {
    
    require('./posts')(server);
    
};
{% endhighlight %}

This file, [it's so simple](http://www.youtube.com/watch?v=WEOeIom1vq4). It's basically just a proxy function to the individual route handler files. Mostly for keeping `server.js` clean. Now, the individual route handler files in each directory, such as the example `posts` directory, contain files with code like this.

{% highlight javascript %}
module.exports = function attachHandlers (router) {
    
    // get requests
    router.get('/post', listPosts);
    
    // post requests
    router.post('/post', createPost);
    
};

function listPosts (req, res) {
    
    return res.json([ ... ]);
    
};

function createPost (req, res) {
    
    return res.send(201);
    
};
{% endhighlight %}

Simply attach the desired route handler methods to the passed-in Express server instance. It's so straighforward that adding new routes is probably obvious to you, now. New endpoints get their own `index.js` file in their own happily named directory. No fuss about it. You'll spend more time thinking of a domain name. Domain names are the best part, though, so choose one wisely.

## Push it to production

Now you're ready to push this baby to production and watch her handle millions of requests per second. First though, we have to make that `bin/next-big-site.js` do some stuff. This file will be responsible for importing the server object we created, in `server.js`, and begin listening for incoming requests.

{% highlight javascript %}
var server = require('../src/server').createServer();

server.listen(8080, function () {
    
    console.log('Accepting incoming requests: ' + server.settings.env);
    
});
{% endhighlight %}

With this file, you can tie it into whatever monitoring service you like to make sure it's always running. You'd also throw any command-line params into here, etc. This is pretty much the basis that I use for any simple web site that I start, with Express and node.js. I've found that this layout gives me a ton of flexibility without needing any additional modules for URL handle namespacing, etc. It "just works", like I loved about Python.

## But where would my database connection go

A site is not much without a database these days. Really, sites are just front-ends to databases it seems like. Anyway, it's just as simple to add your database connection to this layout. Might I suggest following the footsteps of the route handler directory.

{% highlight bash %}
$ cd next-big-site
$ mkdir models; mkdir models/posts
$ touch models/index.js; touch models/posts/index.js
{% endhighlight %}

If you use a database that requires a persistant connection, such as MongoDB or some SQL database, then this structure will work well for you. In the `models/index.js` file, you can instanciate and export your database connection. I like to keep my route handlers as clean as possible, so I would hate to import the database client in them and do your logic there. Nope. That's what the `models/posts/index.js` file is for. Just like the route handlers, create something that you can export that will help you elsewhere. For models, I favored creating `Objects` so that I could store state information.

{% highlight javascript %}
var Post = module.exports = function (db) {
    
    this.posts = db.get('posts');
    
};

Post.prototype.find = function (query, callback) {
    
    this.posts.find(query, function (err, documents) {
        
        return callback(null, documents);
        
    });
    
};
{% endhighlight %}

Now, all the `models/index.js` file has to to is import this `Object`, and export an instance of it, given the database connection. It all meshes really well, since the database connection is being created in that file already. Now, you're free to include these data model objects in your route handlers and do whatever you need.

With that said, I really love CouchDB. CouchDB speaks HTTP and does not require an active connection to the database. This really frees you up to do a lot of awesome stuff, code-wise. For example, you can basically get rid of `models/index.js`, move all your `models/posts/index.js` files to `models/index.js` and just export functions for dealing with posts right from there. CouchDB really rocks for a lot of reasons and it'd make me happy to know you've played around with it. I'm not affiliated with the project at all, so that should say something.

## More Express features!

Express has a lot more features that might deserve their own sub-directories, such as middleware and extensions to `Objects`, like `request`. For these items, I simply make directories named `extensions` and `middleware` in the `src` root, right next to `routes` and `models`. Follow the convention.

Almost forgot about view templates. I favor Jade templates, but regardless of your template module of choice, you should just place them in a directory named `templates` in the `src` root, right next to `routes` and `server.js`.

For anything else that really doesn't fit elsewhere, such as functions for dealing with Amazon's S3 or something, I create a directory named `utilities` and place them in files in there.

Hopefully this helps you to understand how I format my project directory structure, and hopefully it helps you to just settle on one way of doing it and focus on coding!

For an example of a project that I created, with this layout, [check it out on my github](https://github.com/ryancole/foundry).
