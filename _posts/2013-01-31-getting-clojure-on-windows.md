---
layout: entry
title: Getting Clojure up and running on Windows
---
I recently saw a posting to the Clojure mailing list in which people were having difficulty getting Clojure up and running on Windows. Having just gone through the process of setting up Clojure on my Windows machine, I figured I'd document how I did so. It's actually extremely simple and I don't really think it leaves much room for error. So, perhaps there are compatibility issues that would prevent this setup from working, but at least for me it worked without any issues.

## You need the JDK

Step number one is to [download the JDK](http://www.oracle.com/technetwork/java/javase/downloads/index.html). I've used both version `1.6` and `1.7` with success. Install the JDK, but when it asks if you'd also like to install the JRE you can say no. You can install the JRE if you like, but you'll have to adjust your `$PATH` variable to account for that. So, install the JDK and then put the path to the `bin` directory, inside of the directory where you installed the JDK, on your `$PATH`.

{% highlight bat %}
$PATH;E:\Programs\Java\jdk1.6.0_37\bin
{% endhighlight %}

If you don't know how to edit your environment variables, all you have to do is open up the control panel and search for `environment` in the search bar. You'll see a result with two options: edit your account's variables or the system-wide variables. I prefer to put these paths in my account's variables. Create the `PATH` variable if it does not exist.

You should now be able to open a command prompt and type `javac -version` and `java -version`. If neither of those commands work then you probably need to adjust your `$PATH`.

## Leiningen to the rescue

Package managers really help to make things easy. [Leiningen](http://leiningen.org/) is no exception. Leiningen will even take care of downloading Clojure for you. So, to "install" Leiningen, download the `.bat` script from [the website](http://leiningen.org/) and put it in a directory on your `$PATH`.

{% highlight bat %}
$PATH;E:\Programs\Java\jdk1.6.0_37\bin;E:\Programs\Leiningen
{% endhighlight %}

Leiningen also depends on `wget` or `curl`. I prefer `curl`, but regardless, [download](http://curl.haxx.se/download.html) one or the other and also place it on a directory on your `$PATH`.

{% highlight bat %}
$PATH;E:\Programs\Java\jdk1.6.0_37\bin;E:\Programs\Leiningen;E:\Programs\Curl
{% endhighlight %}

That's the end of the `$PATH` configuration. You should be able to open a command prompt and run Leiningen's self install process.

{% highlight bat %}
> lein self-install
{% endhighlight %}

You should now have a full functional Leiningen install at your disposal.

## Clojure REPL and Light Table

To mess around inside a Clojure REPL, you can use Leiningen to set one up for you.

{% highlight bat %}
> lein repl
{% endhighlight %}

Leiningen can also be used to created new projects and compile them into JAR files.

An editor that I've been enjoying lately is [Light Table](http://www.lighttable.com/). With all of the previous steps we took, you should be able to download Light Table and it should work out-of-the-box. If you get any errors about not being able to find Java then this might come back to why I mentioned the JDK, but not the JRE, earlier. Make sure that you provide the JDK to Light Table, via your `$PATH`.