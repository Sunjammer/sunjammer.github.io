---
layout: post
title: Learn to code enough
tagline: Why UX designers should learn just enough code to extend their visual practice.
date: 2017-11-21 14:02:00 +0100
categories:
  - development
  - design
---

*Originally published on [Medium](https://medium.com/@fengslende/learn-to-code-enough-f1a31002270a) on November 21, 2017.*

At this point, I have been a developer for 15 years, and before that I was a designer for 2. My chosen medium was the web and Macromedia Flash, so the transition was blissfully gradual. Elements of my work still involves design: As a developer, having experience with designer tools and terminology has been hugely important to me. I’ve created tools, I’ve built wireframes and prototypes, I’ve “pair-programmed” with designers in implementing their vision, value by value.

Developers and designers share the same concern: The user experience. If I couldn’t speak the same language as designers I’ve worked with, I wouldn’t be half the developer I am.

## The reemergence of the UX developer

When Flash was presumed guilty before its innocence could be asserted, and summarily executed by the industry because a man with a beard thought the web was the way forward, we lost thousands of thousands of front end developers. Not the modern interpretation, which is really just a full stack web developer (with the scars to prove it), but a playful, light footed programmer with a great capacity for visual thinking and user experience intuition. In the late Flash days the front-end developer was the specialist that made sure the user experience would shine. Those *designing developers* who could not stomach the transition to HTML/JS/CSS were cast before the winds: Video games, arts, management, pure design, pure development, perhaps even leaving the industry altogether.

It’s been fascinating to see the rise of the UX design scene, because it is so obviously a discipline that straddles the stretch of land between design and implementation. The tools on the UX end are gradually pushing more and more in the direction of generating production code with simpler tools that enable creativity where pure code is a worse environment. More and more, UX designers establish navigation, look and feel, with tools that allow hooks for real world data rather than the lorem ipsum of yore. The thing is, this is what Flash did for us too, back in the day.

So with that, as a veteran of an industry that grew and caved in on itself trying to make the world a more interesting place, I’d like to formally welcome UX designers. Welcome to a reality in which, within a year or so, you will be writing production code and owning the product in its final state.

![If you thought you weren’t going to be a coder, Framer disagrees.](/assets/images/articles/learn-to-code-enough/framer.png)

*If you thought you weren’t going to be a coder, Framer disagrees.*

The future for UX design is UX *development*. This is a good thing.

## Don’t learn to code.

One of the more inspiring moments of the past few years for me was watching [halfcoordinated](https://www.twitch.tv/halfcoordinated) complete a game in record time *one-handed* that I struggle to play casually with both hands. If you’ve the time and inclination, I strongly recommend watching this [speedrun](https://en.wikipedia.org/wiki/Speedrun). It’s impressive, funny and gets surprisingly emotional.

[Watch halfcoordinated's speedrun on YouTube](https://www.youtube.com/watch?v=JXtUwIW7cL8)

At the end, halfcoordinated urges viewers with disabilities the following:

> “I’m not going to say that anyone can be able to do anything, that’s just empty words, but I will say that your limits are probably way farther out than you expect, and if you push yourself, you’ll probably be really happy and pleased with the results.”

In contrast with groan-inducing idioms like “you’re going to miss every shot you don’t take”, I think this is condensed wisdom as frank and true as it comes for *anyone* working in *any field.*

![Facebook Origami: Definitely, positively not code (it totally is)](/assets/images/articles/learn-to-code-enough/origami.jpeg)

*Facebook Origami: Definitely, positively not code (it totally is)*

Confession time: It took me *ages* to really understand fundamental programming concepts. In particular lists and thinking in terms of objects that do not exist as part of an on-screen layout was a huge hurdle for me as an attention-deficit visual thinker. Programming is a commitment to abstract mental gymnastics, and writing code at anything resembling production scale *will* mess you up as you learn.

I will never tell someone who didn’t go down a career path to be a developer, or who didn’t make a conscious choice to become one, that they should just “learn to code”. That is not useful advice, it comes with tremendous baggage, and if you’re a designer your goal is to *design*. You should obviously focus on what you love. “Learn to code” ignores scope.

However…

## Learn to code enough.

Learning anything is predicated on interest, and as a designer, any code you might be interested in writing is going to relate to visual expression. Count your lucky stars: The amount of code you *should* learn is practically nothing but the fun stuff. You’re free to ignore almost all the things “real” programmers take on out of sheer grit. You’re paid to make beautiful things, and so it follows you should learn enough code to aid you in that task.

Here’s what you’ll *actually* need, and apologies in advance of these are insultingly simple or obvious.

**Learn dot notation:** In most languages you’ll encounter, relationships between objects are expressed in dot notation, where the owning object is separated from its owned object by a period. If you wanted to access the handle of the front door of your house:

```javascript
house.frontdoor.handle
```

In dot notation, objects are indistinguishable from their properties: You use the same notation. Here’s a couple of examples.

```javascript
house.frontdoor.isOpen
```

```javascript
house.frontdoor.handle.rotation
```

The important thing is that the last word is the name of the exact thing you want to access.

**Learn to write a function:** Welcome to the most extreme mathematical principle you may ever have to deal with: Writing and using (or ‘calling’) functions. A function is simply a piece of code that takes some variable data as input and produces some output as a result. Here’s a ludicrously simple function in JavaScript:

```javascript
function add(a, b) { return a + b }
```

This is a function that takes two variables as **arguments**, ‘a’ and ‘b’, and it will **return** their sum. function is the first word, telling us that the next word will be the name of our function. Opening and closing parens begins and ends our list of argument names, and the opening and closing { curly braces } tells us where the actual code that the function is going to execute lives. return tells us that the following code is going to produce what will become the ultimate result of our function. This allows us to make functions that do lots of things in separate steps, but still have simple results:

```javascript
function sillyAdd(a, b) 
{ 
  a += b 
  return a
}
```

Notice that for the most part it doesn’t really matter what line we put each bit of code on, giving us some freedom to format our text in whatever way is pleasing to us. This style of function definition is very common among languages.

**Learn to call a function:** Thankfully, calling a function should be way more common to you than writing them. This is the *Dark Secret of Programming*: Most code is just using other people’s code.

To call a function and get its result, we use the 2nd part of the function definition notation we explored above, but we replace the argument names with the values we want those arguments to contain.

```javascript
definitelyTen = add(8, 2)
```

And that’s it! Call the function with the things and get the result. This stuff composes, so you can do things like this as well:

```javascript
definitelyPositivelyTen = add(add(2.5, 2.5), add(2, 3))
```

Bananas! Don’t worry, this stuff will settle with you and in the real world there are few if any actual bonus points for this kind of bonkers “cleverness”.

**Learn 0-indexed array access notation:** A concept you will encounter often is lists of things, and in lists items are indexed. A common kind of list in programming is the **array**, and to access the n-th element of an array, you use something called *array notation*, which looks like this:

```javascript
myArray[index]
```

If you were writing a list by hand you might say the first element had an index of 1. If you were accessing an item in an array, this would be wrong. Arrays are commonly called 0-indexed, because the index of their first element is 0.

```javascript
firstItem = myArray[0]
```

You will often combine array access notation with the dot notation we described above. Let’s say you have a neighbourhood of houses and you want to get at the doorknob of the 2nd one:

```javascript
neighbourhood.houses[1].frontdoor.handle
```

**Learn to calculate and work with ratios**: *Everything* makes sense between 0 and 1. Your work will live in a world defined by moving boundaries. Stop thinking in set values and imagine things in ratios to one another: A is half the height of B. C half the width of A.

**Forget percentages and other dumb roman inventions**: 1.00 is 100%. 0.50 is 50%. Percentages are a ratio expressed in an arbitrary range. Throw it in the sea. All you need is between 0 and 1.

**Forget expressing directions and angles in degrees**. We [don’t actually know](https://en.wikipedia.org/wiki/Degree_(angle)#History) why degrees were chosen as a working unit. Radians are numbers on the range of 0 to 2 times PI. *PI is divine*. Memorise multiples and divisions of PI: **1.57**, **3.14** and **6.28** are incredibly useful constants, as they are quarter, half and whole circles in radians. If you must get radians from degrees:

```javascript
radians = 3.14 / 180 * degrees.
```

To get degrees from radians, do the reverse:

```javascript
degrees = 180 / 3.14 * radians.
```

Think in ratios of *radians*. A circle is 1. Half a circle is 1. A quarter circle is 1. These are all up to you because you decide what 1 is by defining what it is a multiple of.

![Illustration from the original article](/assets/images/articles/learn-to-code-enough/ratios.png)

**Learn basic trigonometry.** The relationships between sines, cosines, triangles and PI. This is how you get angles between things, distances between things and tons more. It is absolutely foundational in a way that will never stop being useful: For starters, realize that sines and cosines exist to take a radian and return a value between negative and positive 1, and as long as you feed sin and cos functions predictable values that fall between 0 and 6.24, you have the perfect way to generate smoothly interpolated ratios.

**Learn linear interpolation.** Getting a value between A and B by a ratio from 0 to 1 lets you do all kinds of things. Linear interpolation is colloquially (and bizarrely) known as ‘lerp’.

```javascript
result = lerp(from, to, ratio)
```

If you don’t have access to a lerp function, write your own:

```javascript
function lerp(from, to, ratio) { return from + (to - from) * ratio }
```

Here’s a wheel rolling a full revolution across the screen based on its position relative to the screen width.

```javascript
wheel.rotation = lerp(0, 6.28, wheel.x / window.width)
```

The linear part means there is a stiffness to this result, where animating the ratio from 0 to 1 will be a completely stiff and linear transition. Through our new knowledge of radians and cosines, we can smooth this out:

```javascript
ratio = cos(wheel.x / window.width * 3.14) * 0.5 + 0.5
wheel.rotation = lerp(0, 6.28, ratio)
```

For an extended look at the power of deriving smoothing and other behaviors from linear interpolations, [this lecture](https://www.youtube.com/watch?v=mr5xkf6zSzk) gives you a colossal head start.

These are the fundamental building blocks of calculating layouts and animation, and acquiring a solid understanding of these principles is by far the most significant hurdle you will have to cross as a UX developer.

## There has never been a better time to do anything in tech

There are incredible tools everywhere, for cheap or for free. I grew up with batch files, QBasic and living in terror at the prospect of having to pick up C, just to get some pixels on a screen. Today you have a ludicrously expansive palette of tools to choose from, from the simplest most mundane to the most bafflingly expansive, and you are generally able to choose your own level of complexity.

Don’t believe the bizarro myth that programming is some hard unachievable thing that only a specific kind of human being can do. Most programmers are idiots at best, bungling together borrowed code or desperately trying to understand why the thing they built worked at all. It’s a human art, filled with mysteries, accidents, excitement, stupidity and play, and while working up the muscle memory for curly braces and brackets might feel clumsy at first I promise you it is one of the most rewarding things you could possibly do.

Just learn *enough.* It can take you unbelievably far.
