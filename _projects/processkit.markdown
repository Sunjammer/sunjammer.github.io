---
title: ProcessKit
description: A dependency-driven processing engine built inside ServiceNow.
order: 5
thumbnail: /assets/images/projects/processkit.svg
thumbnail_alt: An abstract dependency graph flowing into a result
---

ProcessKit describes work in terms of data. A process asks for an output type; resolvers declare what they can produce and which inputs they require. The engine builds the dependency graph and works backward until it reaches values it already has or knows how to obtain.

## Work as a graph

The model makes intermediate results explicit. Jobs can be staged, cached, retried, inspected, or resumed, while graph analysis catches missing producers and circular dependencies before execution.

The application lives inside ServiceNow, but most of its server logic was written in typed Haxe and compiled to JavaScript. That made the data model and execution machinery easier to reason about without giving up the platform’s records, events, flows, and administration tools.
