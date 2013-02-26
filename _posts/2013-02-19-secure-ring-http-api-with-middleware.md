---
layout: entry
title: Securing a simple HTTP-based API with Ring middleware functions
---
Middleware functions are one of the main components of a Ring application. They provide additional functionality to your request handler functions. They do so in a way that allows you to take action based on the data in an incoming request, in a chainable fashion. If cars on a tollway were the incoming web requests and Ring were the tollway itself, then the tollway checkpoints could be thought of as the middleware functions. The middleware function for a tollway checkpoint might check the incoming request's license plate and respond with whether or not that request can continue through or if it will get rejected.

In the case of a simple HTTP-based API, one might want to check all incoming requests for a header key that contains an access token. If no access token is found in the headers then you might want to return an error HTTP code. You could do this in your code at the handler level, and repeat the logic in every handler function. You could also do this in a utility function, and then call that function from every handler function. Hold on! This is also a great use-case for a middleware function. Putting this logic in your middleware chain helps to avoid code repetition, which we all love.

## Requiring an access token

A Ring middleware function is simply a function that *returns* a handler function. Your main Ring routes are provided as a parameter to each middleware function. So, you have the option to halt the flow of the request in each middleware, and return an error code, or to allow the flow to continue by calling the given handler. Let's take a look at a middleware function that checks for an access token inside of an HTTP header.

{% highlight clojure %}
(defn wrap-require-token [handler]
  (fn [request]
    (if (get-in request [:headers "token"])
      (handler request)
      {:status 403
       :body "No access token provided"})))
{% endhighlight %}

This is a very simple middleware. It's a common convention to prefix your middleware names with `wrap-`. This function checks for a `token` key in the headers map, within the given request map. If `token` is present, it continues on to the next middleware. If `token` is not present, it returns an HTTP `403` error.

## Using middleware functions

In order for your Ring application to use this middleware function, you need to wrap your main route handlers in these middleware functions. You can use Clojure's `->` macro to do this.

{% highlight clojure %}
(def app
  (-> app-routes
      (wrap-require-token)
      (handler/api)))
{% endhighlight %}

The expansion result of that `->` macro would look like this.

{% highlight clojure %}
(handler/api (wrap-require-token app-routes))
{% endhighlight %}

Along that line of thought, this means that the order in which you specify the middleware functions matters.

If you run this Ring application, you'll see that you should get an HTTP `403` error if you make a request without a header named `token`. If you provide the `token` header then you will receive a response as expected.

## The next steps

Obviously this is not actually secured. You can easily build upon this and add more middleware that checks a database for the given access token and forwards an adjusted request map, containing the requesting users' data, to your request handlers.

{% highlight clojure %}
(defn append-user-data [handler]
  (fn [request]
    (clutch/with-db database-address
      (let [access-token (get-in request [:headers "token"])
            view-data (clutch/get-view "api" "users-by-token" {:keys [access-token]})]
        (if (= 1 (count view-data))
        	(handler (assoc request :api-user (:value (first view-data))))
          {:status 403
           :body "Invalid access token"})))))
{% endhighlight %}

This is just an example, but from here you can hopefully begin to see how an authorization implementation would begin to take shape.