---
layout: entry
title: Unreal Engine x Visual Studio = Painful
---

I've experienced quite a bit of different development environment configurations over the years. Everything from nodejs web projects using webpack and babel, which most people loathe when it comes to configuration, to dotnet projects requiring nuget packages from the official repo and private packages. I've worked on javascript projects that were not within any nodejs / npm environment whatsoever.

I guess my point is that I've seen projects with effectively zero editor integration and I've seen projects with superb editor integration. I'd say a typical C# project has a great developer experience. I'd say a well configured javascript / node / webpack / babel project has a great developer experience so long as the configuration files are setup well.

A great developer experience goes a long way ...

Do you want to know what the absolute worst developer experience that I've seen is? That's right ...

### Unreal Engine x Visual Studio

Unreal Engine is a hugely popular game engine. An absolute boat load of people use it.

Visual Studio is probably the most popular Windows-based C++ IDE. Visual Studio is known for its superb C++ integration, debugging and intellisense. Visual Studio is the recommended product and *user experience* for Unreal.

So why on earth is it that when you try to use Visual Studio to edit an Unreal Engine project you're met with the absolute worst developer experience in existance? These two huge titans of their domain combine to create the worst thing I've ever seen.

Visual Studio is wholely incapable of parsing and providing meaningful intellisense from an Unreal project. Visual Studio also displays false error squiggly lines all over the place. Most, if not all, of these issues seem to stem from Unreal's overzealous use of macros, which seem to absolutely confuse Visual Studio. If you compile and debug your project, everything works fine - Visual Studio is simply confused and is showing you incorrect or phantom errors.

It's common knowledge that if you're doing Unreal and Visual Studio then you absolutely need to purchase and use a plugin called Visual Assist. VAX is great, but even VAX sometimes can't understand Unreal. There are times where VAX sees certain method as unresolved, etc. VAX is merely a syntax-understander and it cannot get the same level of deep code comprehension that proper intellisense can. It's inferior in ever way. VAX is just more popular because it has some Unreal-specific features and seems to do a better job at syntax highlighting, useage popups, etc. These are all things that Visual Studio should absolutely dominate at - at the very least be able to accomomdate, which it can't.

It absolutely shocks me that if you go onto any Unreal community, everybody is just content with buying VAX. It's like the community has been beaten into submission and no longer hopes for a proper Visual Studio x Unreal dream.

## Sad :(

I've actually never seen a community of developers put up with such a terrible developer experience as I have when trying to get into Unreal Engine. The Visual Studio + Unreal Engine experience is absolutely trash.

You're told to buy a plugin that is only slightly as good as what stock Visual Studio should be. You're told to "just ignore errors." You're told to disable intellisense.

Without these features you might as well just code in notepad.

# VSCode

With notepad in mind, it's actually ideal to just uninstall Visual Studio and instal Visual Studio Code. You can use the Visual C++ Build Tools installer to avoid having to install Visual Studio IDE. Code seems to do just as good at the auto complete as VAX or Visual Studio. Code doesn't seem to have the false error messages, etc.

I'm absolutely annoyed and sad that Visual Studio x Unreal Engine doesn't have a flawless developer experience.
