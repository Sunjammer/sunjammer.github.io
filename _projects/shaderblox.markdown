---
title: Shaderblox
description: Compile-time GLSL tools that generate typed shader bindings for Haxe and Lime.
order: 6
thumbnail: /assets/images/projects/shaderblox.svg
thumbnail_alt: A wireframe triangle beside abstract shader source
source_url: https://github.com/furusystems/shaderblox
---

Shaderblox brings shader source and application code into the same type system. Haxe macros parse GLSL declarations at compile time and generate typed fields for uniforms and vertex attributes.

If a renderer expects a value the shader does not provide—or provides with the wrong type—the build fails before the program reaches the GPU. Generated methods handle uniform uploads and attribute pointers without duplicating declarations by hand.

## Composing shaders

Shaders can inherit declarations and include external source through pragmas. The experiment also explored runtime constants, recompiling the shader when a generated property changed.

Shaderblox was my experiment in making shaders a first-class part of a typed Haxe codebase. George Corney later contributed improvements through pull requests.
