---
title: Fuse
description: An open-source toolchain that brings design, prototyping, and native mobile development into one workflow.
order: 4
thumbnail: /assets/images/projects/fuse/fuse-tools-preview-upscaled.webp
thumbnail_alt: A developer previewing a Fuse application on a phone beside the development tools
project_url: https://fuseopen.com/
source_url: https://github.com/fuse-open
---

Fuse is an open-source development toolchain for building native iOS and Android applications. It was designed to bring interface design, prototyping, and production development into the same workflow rather than treating them as separate stages.

At its center is UX Markup, a declarative and reactive XML-based language for describing responsive interfaces. The same component model covers layout, animation, interaction, navigation, and reusable controls, with JavaScript available for application logic. Changes to markup, scripts, and assets appear in the running application through live reload, creating a fast feedback loop between an idea and its behavior on screen.

Fuse combines several approaches to native interface development. UX components can use platform-native controls, GPU-accelerated graphics, and vector drawing through the same declarative model. Uno, a C#-like language and compiler, provides the framework beneath it and generates native code for mobile platforms. When an application needs to reach beyond the shared framework, it can call into Objective-C, Swift, Java, or C# and can be exported to Xcode or Android Studio for conventional debugging and extension.

The result is a system in which a prototype and a production application do not have to be different artifacts. Designers can work directly with layout, motion, and assets, while developers can connect those interfaces to application logic and native platform APIs.

## Across the toolchain

I worked on Fuse from 2015 to 2018. My work moved between desktop tooling, framework code, documentation, native integrations, and the many languages underneath it: C#, C++, Objective-C, Java, JavaScript, TypeScript, Uno, and UX Markup.

I also demonstrated and taught Fuse internationally, helping designers and developers understand a model intended to give both groups meaningful access to the finished application. Fuse continues today as an open-source project at [Fuse Open](https://fuseopen.com/).
