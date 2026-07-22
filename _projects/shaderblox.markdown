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

## First class shaders

Shaders can inherit declarations and include external source through pragmas. The framework also explores runtime constants, dynamically recompiling the shader when a generated property is changed.

Mostly intended as a demotool, the desire was to be able to write Haxe code and GLSL side by side and use the compiler and type system to ensure both were in concert and avoid regressions and drift as complexity grew. George Corney later contributed significant improvements through pull requests.

His work can be seen [here](https://github.com/haxiomic/GPU-Fluid-Experiments)
