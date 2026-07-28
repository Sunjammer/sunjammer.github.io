---
title: Mira
description: A visual authoring tool and server for orchestrating networked games and interactive installations.
order: 3
thumbnail: /assets/images/projects/mira/installation.jpg
thumbnail_alt: Mira running at a multi-screen interactive installation
---

Written in Haxe and Java for Expology, Mira was a "multiplayer game engine" built for interactive experiences involving many computers, screens, sensors, and players. With an integrated, real-time visual editor, it treats the experience as a state graph: nodes describe what a client should present, while edges describe where it may go next.

![The original Mira graph editor](/assets/images/projects/mira/editor.png)

For stability the server owns the entire state. Clients receive a scoped state view, report interactions or desired mutations, and wait for the next one. A disconnected device can return and be placed exactly where it belongs: Important when twenty participant devices are halfway through a shared, hour-long experience.

## Designing the whole

The graph gave designers and developers a shared view of an experience that would otherwise be scattered across client applications. Small scripts handled transitions, shared data, synchronized rendezvous, and different roles for player screens, projectors, audio, and hardware.

## Real-time workflow

Since the server would report states to devices on demand, it was trivial for a designer to alter content in real time, watching devices respond. The classic example is walking around a show floor, seeing a text formatting error or spotting an undesired behavior, launching the editor on a laptop and quickly altering it: The installation would simply be corrected and continue as normal.
