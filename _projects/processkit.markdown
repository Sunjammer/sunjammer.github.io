---
title: ProcessKit
description: A dependency-driven processing engine built inside ServiceNow.
order: 5
thumbnail: /assets/images/projects/processkit.svg
thumbnail_alt: An abstract dependency graph flowing into a result
---

A recurring problem in ServiceNow looks like this: start with a few known values, retrieve several more, transform them, and combine the results. The individual steps may be simple, but coordinating them becomes difficult when they depend on one another, run asynchronously, or obtain data from different systems.

ProcessKit expresses this work as a dependency graph. A process declares the result it needs. Resolvers declare which values they can produce and which other values they require. From those declarations, ProcessKit builds the graph and works backward until it reaches values it already has or knows how to obtain.

For example, a process generating a report might require customer, contract, and usage data. One resolver can read the customer from ServiceNow, another can request the contract through a REST API, and a third can ask a MID Server for usage data. ProcessKit resolves their dependencies, runs independent work in parallel, and supplies the completed inputs to the final process.

![Customer, contract, and usage data resolved in parallel and combined into a report](/assets/images/projects/processkit/dependency-graph.svg)

The result is a ServiceNow-native visual programming model built from standard tables, business rules, and events. Processes can also be invoked from ServiceNow Flows. Values supplied by the caller propagate through the graph, making it possible to provide arguments, override a resolver, or inject test data while debugging.

## Resolving and inspecting work

A resolver can perform a REST request, run a MID Server process, execute JavaScript or a Flow, or look up records in the database. ProcessKit treats work as asynchronous by default and only waits where dependencies require it, allowing unrelated branches of the graph to proceed independently.

Because every intermediate value and dependency is explicit, the graph can be inspected while it runs. Visualizers show which resolvers are active and where a process is spending its time. Real-time validation detects invalid field references, unused values, missing dependencies, and cycles before they become harder runtime failures.

## The Haxe difference

ProcessKit gave me an opportunity to build a substantial ServiceNow application in Haxe. Its type system made the framework's contracts explicit while still compiling to JavaScript that could run on the platform.

Haxe abstract types were particularly useful for adding table-specific rules to native ServiceNow objects such as `GlideRecord`. For example, `final foo:ResolverRecord = ResolverRecord.fromSysId('xyz')` produces a type-safe record reference whose available fields retain their types. That brought compile-time checking to code which would otherwise rely on field names and conventions discovered only at runtime.

Apart from a post-processing step needed to accommodate ServiceNow's field-name restrictions, developing the application in Haxe was an absolute pleasure.
