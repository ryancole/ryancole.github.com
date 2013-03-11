---
layout: entry
title: A web-design approach for non-designers
---
What's the first thing you do when you sit down with the intention of writing the first bits of code for your shiny new website idea? If you're a programmer, like myself, then you might do what I have been doing for years; I start off by opening up my code editor and I write back-end code. I write back-end code first because I think that it's a logical place to start for a website. Once I have the back-end doing things like user authentication and serving up some data that I can toy around with in my template engine of choice, I will then be free to move on to the front-end and design my layout! It all just makes so much sense.

## </sarcasm>

I recently realized that 99% of the websites I write, in this back-end-first fashion, usually lose my interest at the point where I try to migrate from back-end thinking to front-end thinking. I'll mess around with customizing Bootstrap or something else for a few days and then get bored because I'm terrible at design and it looks like every other site I've ever written. The funny thing is that at this stage in my cycle, I'd be left with a website that does literally the same thing as every other website that I have written, in terms of back-end code. I'd code the site to the point where I was serving up some data and doing maybe 1 thing that I intended the site to do, before moving on to front-end on which I'd quit. This would leave me with essentially the same code as the last site I wrote. The same code as the last 100 sites I wrote. Probably the same front-end designs too, since I have been using Bootstrap for awhile. I'd like to see a diff of all my site repos side by side because there probably wouldn't be much of a difference.

## Eliminate the excess step

I'm pretty sure I read the back side of Eric Ries' book about being lean at some point, so I definitely know a thing or two about failing fast. I don't think I was failing fast enough with my back-end-first approach.

I've actually been messing around with the front-end-first approach and I think it works out nicely. I find that I get to spend more quality time, without being frustrated about design, on the design up-front. Because I am not a designer, the design step is where I generally burn out the fastest, and if I leave that step until after I've already put in a good amount of coding time then I definitely burn out even faster. Taking the design head-on allows me to work on it for longer periods of time without getting frustrated and burning out. This has resulted in me actually reaching a design that I'm happy with, at which point I can then move to back-end coding. Take note of the following points.

1. You can get right to the design process, using static HTML, CSS and JS.
2. Forces you to focus on design without being distracted by back-end coding.
3. It gives you something visual to show to your non-coder friends who could care less about your awesome distributed and load balanced back-end that could handle up to a billion requests per second.
4. Something else, because the longer the list the better.

I have not proven this yet, but I have a feeling it might even promote a better workflow for growing into a JavaScript-heavy web application, using Backbone and stuff, if that's your thing.

Anyway, I suggest reversing your approach to web development if you read the opening of this post and it sounded familiar. Just see if it works for you, or not.