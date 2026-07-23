---
title: Mira
description: A visual authoring tool and server for orchestrating networked games and interactive installations.
order: 3
thumbnail: /assets/images/projects/mira/installation.jpg
thumbnail_alt: Mira running at a multi-screen interactive installation
---

Mira was built for interactive experiences involving many computers, screens, sensors, and players. It treats the experience as a state graph: nodes describe what a client should present, while edges describe where it may go next.

![The original Mira graph editor](/assets/images/projects/mira/editor.png)

The server owns the state. Clients receive a complete view, report interactions, and wait for the next one. A disconnected machine can return and be placed exactly where it belongs—important when twenty players are halfway through a shared, hour-long experience.

## Designing the whole

The graph gave designers and developers a shared view of an experience that would otherwise be scattered across client applications. Small scripts handled transitions, shared data, synchronized rendezvous, and different roles for player screens, projectors, audio, and hardware.

## A second life

The original editor was a Windows-only Adobe AIR application written in Haxe. It is now being ported to Electron while preserving its legacy project format, scripting behavior, runtime, and network protocol. The new version can open and export the old `.nwk` files without requiring Flash.
