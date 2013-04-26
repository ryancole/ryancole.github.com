---
layout: entry
title: "Note to self: How to add an Ubuntu user to sudoers"
---
Some server hosting providers, such as Linode, start you out with a root account when choosing to use Ubuntu. I think the standard Ubuntu server installer does not create a root account, but instead does the following for you. Anyway, it is noted here that in order to add a user, on Ubuntu, to the sudoers list, all you have to do is the following:

{% highlight %}
adduser <username> sudo
{% endhighlight %}

You do not have to directly edit `/etc/sudoers`. The `/etc/sudoers` file is already configured to allow anybody in the `sudo` group to use the `sudo` command. Just be sure to make the above adjustment while logged in as root and everything should go smoothly.