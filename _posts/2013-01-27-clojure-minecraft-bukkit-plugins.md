---
layout: entry
title: Minecraft and Clojure for fun and profit, without the profit
---
My approach to learning new languages is to find an interesting project to extend or build for. This gives me something tangible to work with and helps me stay interested. So, for Clojure I decided to try to write Bukkit plugins. Bukkit is an open-source Minecraft server, written in Java. Being my first Clojure project, I figured that since Clojure is a JVM language and Bukkit is also on the JVM, that it would be really straight forward to just whip up a simple plugin. This probably would have been the case if this weren't my first project with Clojure. But, since it was first my project, there was actually quite a bit of learning to do before my Clojure plugin would load up into Bukkit and actually do something.

My strategy was to write some Java classes in Clojure and compile them into a plugin jar file. My only option here was to use Clojure's `gen-class` macro, because these classes will need to be named, conform to interfaces, and inherit from sub-classes. There are other ways to create Java classes in Clojure, but `gen-class` is the only one that provides all of these features. But, I was surprised to find that these classes of mine were not being created in the jar file when I would run `lein jar`. This is because `gen-class` requires Ahead of Time Compiling, which goes a step further and turns your Clojure code into Java byte code. So, AOT? What the what?

## Problem 1: make my jars contain byte code

Luckily, it's totally possible, and very easy, to use Leiningen to compile my Clojure code into a jar that contains byte code. In regards to Leiningen, this process is called Ahead of Time Compiling. Using AOT in your project's project.clj file instructs Leiningen and the underlying compiling magic to take it a step farther and produce the byte code for you. In the case of my Bukkit plugin, I needed every namespace to be compiled using AOT, and I achieved this using the following project.clj.

```clj
(defproject com.rycole.bukkit.simple "0.1.0-SNAPSHOT"
  :repositories [["bukkit.release" "http://repo.bukkit.org/content/repositories/releases"]]
  :dependencies [[org.clojure/clojure "1.4.0"]
                 [org.bukkit/bukkit "1.4.7-R0.1"]]
  :filespecs [{:type :path :path "src\\plugin.yml"}]
  :aot :all)
```

The `:aot :all` keywords mean that it will apply to all of the namespaces in my project. Now, I could safely move forward knowing that my code will be usable by Bukkit. From where, it's just a matter of maximizing my usage of Clojure's Java-interop functionality, and porting the Java examples, from Bukkit's documentation, over to Clojure.

## Problem 2: extend JavaPlugin

With all of problem #1 in mind, I started a new Clojure project for my plugin, using Leiningen, by doing `lein new com.rycole.bukkit.simple.core`.

Part of why I'm using AOT is because to extend Bukkit's `JavaPlugin` class, which is the basis of a Bukkit plugin, I used Clojure's `gen-class` function. So, the definition of my `com.rycole.bukkit.simple.core` namespace looks like this.

```clj
(ns com.rycole.bukkit.simple.core
  (:require com.rycole.bukkit.simple.listeners)
  (:import [com.rycole.bukkit.simple.listeners PlayerLoginListener])
  (:gen-class :name com.rycole.bukkit.simple.core.Main
              :extends org.bukkit.plugin.java.JavaPlugin))
```

`gen-class` creates a `Main` class that extends `JavaPlugin`. This occurs at compile-time, into the jar file, and is usable from Java-land. The only remaining thing that this `Main` class needs to do is provide event handlers for the plugin enabled and disabled events. Adding functions to our `Main` class couldn't be easier.

```clj
(defn -onEnable [this]
  (.info (.getLogger this) "PLUGIN ENABLED")
  (.registerEvents (.getPluginManager (.getServer this)) (com.rycole.bukkit.simple.listeners.PlayerLoginListener.) this))

(defn -onDisable [this]
  (.info (.getLogger this) "PLUGIN DISABLED"))
```

Now, with what we have here, this plugin can be compiled and loaded up by Bukkit. A `plugin.yml` file is required to be in the output jar, and can be easily added in the `project.clj` file. Try it out. You should see Bukkit say that it has loaded and enabled your plugin.

## Problem 3: well that's boring, so lets make it do something

Once I had the pluging in this state, I was happy but I wasn't satisfied. I wanted the pluging to actually do something ... anything! So, the easiest thing that I could see to do was to handle player login events. When a player logs in to the server, I wanted my plugin to simply log a message to the Bukkit console.

For a Bukkit plugin to handle events, it has to create `Listener` classes that implement functions that accept the appropriate event parameters. Now, I needed to create this class and implement these necessary member functions. Again, `gen-class` is the plan of attack, but this time it needs to specify a Java function annotation as well as some hints as to what the variable types of the function arguments are. Once you've seen this once, it's pretty simple.

```clj
(ns com.rycole.bukkit.simple.listeners
  (:gen-class :name com.rycole.bukkit.simple.listeners.PlayerLoginListener
              :implements [org.bukkit.event.Listener]
              :methods [[^{org.bukkit.event.EventHandler true} onPlayerLoggedIn [org.bukkit.event.player.PlayerLoginEvent] void]]))
```

I made a new `listeners.clj` file, in which I an generating this class. This time, this class `:implements` instead of `:extends`. Also, the methods for which I needed to provide some meta data about are explicitly listed in the `:methods` parameter. In this case, I was only interested in implementing a single handler function for the `PlayerLoginEvent`.

```clj
[^{org.bukkit.event.EventHandler true} onPlayerLoggedIn [org.bukkit.event.player.PlayerLoginEvent] void]
```

The first item in this sequence is the annotation. This annotation is equivalent to `@EventHandler` in Java code. The `true` just means that it's desired. Second, the `onPlayerLoggedIn` specifies the name of the function. Third, the following sequence specifies the data type of the parameters. This function only has one parameter. Last, the function's return type is specified as `void`.

Now that the function has been all meta-data'ed up, the only thing left to do is to actually implement it.

```clj
(defn -onPlayerLoggedIn [this evnt]
  (.info (org.bukkit.Bukkit/getLogger) "PLAYER LOGGED IN"))
```

I don't actually do anything with the function parameters. I just simply log a message to Bukkit's console.

## Wrapping it up

With all of this in place, just `:require` and `:import` your listeners from inside `core.clj` and register them so that Bukkit knows about them. Compile the jar using Leiningen by doing `lein jar`. Place the jar file into Bukkit's plugins directory and run Bukkit in such a way that allows you to put Clojure and these plugins on the class path. A Windows batch file for doing this could look like this.

```bash
java -cp C:\Users\Ryan\.m2\repository\org\clojure\clojure\1.4.0\clojure-1.4.0.jar;E:\Games\Bukkit\plugins\*;craftbukkit-1.4.7-R0.1.jar org.bukkit.craftbukkit.Main
PAUSE
```

With any luck, you're now writing Bukkit plugins in Clojure without any elaborate hacks. The code for my plugin that I talked about in this write up is available on [github](https://github.com/ryancole/com.rycole.bukkit.simple).
