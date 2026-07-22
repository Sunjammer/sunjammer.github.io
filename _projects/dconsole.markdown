---
title: DConsole
description: A runtime console and developer-tool layer for Flash and AIR
order: 2
thumbnail: /assets/images/projects/dconsole.svg
thumbnail_alt: An abstract command console
source_url: https://github.com/furusystems/DConsole
---

DConsole began in 2006 with a simple wish: while an application is running, its developer should be able to inspect it and change it.

It combined structured logging, a command line, object introspection, and visual inspection in one overlay. Commands could call application functions; scopes exposed live properties and methods; plugins added tools for performance, screenshots, remote consoles, display-tree inspection, and more.

With a rich API and batch script support, it also allowed a kind of runtime monkeypatching.

## A toolbox that travels with the product

The important choice was to make DConsole part of the application rather than a separate debugger. It could inspect the same objects, run the same code, and travel with work installed on another machine.

That mattered for games, exhibits, and AIR applications where the useful question was often not “where did this line fail?” but “what is this thing doing right now?”

## After Flash

The original ActionScript code remains available as an archive. The core is portable, though runtime developer tools are more common now than they used to be. I wrote an experimental Godot 4 gdscript port but Godot is itself a big developer console so it's much less useful there. The source remains interesting as an archeological artifact.
