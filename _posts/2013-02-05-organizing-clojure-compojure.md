---
layout: entry
title: Organizing Clojure and Compojure web applications
---
I'm still very new to Clojure. When tackling new languages I always try to take inspiration from other projects, in regards to directory structure and general organization. This rings especially true with web application because they're pretty clear-cut in how they should be organized, in my opinion. They should be organized somewhat loosely around your main data entities. So if you have a data entity named "message", you'd probably have a directory for models, routes and views containing code for that message entity. That's the organizational structure that I tend to aim for, anyway.

## Getting that structure with Clojure

It's actually extremely straight-forward to do this in Clojure. It's very similar to how I do it in Python or Node.js. First, start a new Compojure project, using Leiningen.

{% highlight bash %}
$ lein new compojure super-tidy
{% endhighlight %}

Go into the generated `src\super-tidy` directory and you will see your `handler.clj` file. We'll register all of our routes in this `handler.clj` file. But first, make a directory right next to the `handler.clj` file, named `routes`. Inside of the `routes` directory, create a new Clojure file named `messages.clj`, for example. All of the URL endpoints handling message-data-related requests can cleanly be placed in this file.

## Compojure!

Lets start with the `messages.clj` code. Because Compojure allows nesting of routes, all we need to do in this file is define our routes.

{% highlight clojure %}
(ns super-tidy.routes.messages
  (:require [compojure.core :refer [GET POST defroutes]]))

(defroutes routes
  (GET "/message" [] "messages index")
  (GET "/message/:id" [] "specific message"))
{% endhighlight %}

With that, we have a few routes that we can mess with. Next, we need to register these routes with the main Compojure application. So, step out a directory level and add the following code to `handler.clj`.

{% highlight clojure %}
(ns super-tidy.handler
  (:use compojure.core)
  (:require [compojure.handler :as handler]
            [compojure.route :as route]
            [super-tidy.routes.messages :as messages]
            [super-tidy.routes.posts :as posts]
            [super-tidy.routes.users :as users]))

(defroutes app-routes
  messages/routes
  posts/routes
  users/routes)

(def app (handler/site app-routes))
{% endhighlight %}

Here we call `defroutes` and pass in our various defined route handlers. I included a few more to show how multiple handlers can be registered.

Now you should be able to start up the web server and hit these various routes! Good luck!