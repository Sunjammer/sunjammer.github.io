---
layout: post
title: "ServiceNow: Dynamic form graphics in 2021"
date: 2021-06-10 09:29:39 +0200
categories:
  - update
  - servicenow
---

Quite often I find myself wanting to supplement a UI16 form with graphics in one way or another. A picture is worth a thousand words, especially in the context-switching hellscape that a complex ServiceNow application can be. If you can clarify with imagery or formatted text and offer simpler tools to understand content and context, why not do it?

The use cases are seemingly endless, but the challenge seems to be rarely undertaken, I presume due to perceived technical hurdles. How do we transform our data into something completely custom that a user can view and interact with side by side with other data in a form? 

Service Portal aside, as of UI16 we have the following options:

* **Read-only HTML fields**
* **UI Macros & Formatters**

This article outlines some findings and techniques I've used with success so far.

# What is reasonable?
----

Your options are defined by your ambition. Given workarounds I'll present below, there are few if any _practical_ limits beyond what a modern browser can do, but it's also important to reason about maintainability and accessibility: A whole lot of SN admins work within employer parameters when it comes to the browser they can use and the hardware they run it on. 

I like to think designing for Chrome on a machine with a GPU manufactured after 2010 is relatively safe, but I encountered a completely whipped Internet Explorer requirement as recently as 2019. 

There's also actual UI16 to consider. UI16 may look straightforward but it's fairly meticulously built for accessibility, and comes with a lot of functionality behind the scenes. Live form updates in particular are invaluable for collaboration and your users may be taking them for granted. 

To narrow the scope, this article assumes that you want to embellish an existing form with a static, read-only visualization of the record state. In some cases you can get live updates "for free", such as in the read-only HTML field approach described below, but for UI Macros the implementation is left for you to reimplement.

To keep things relatively painless, keep the following in mind

* "It works on my computer" may not cut it. Test in the real world (your computer is not the real world)
* If it can be done in a read-only HTML field you get UI16 extras for free
* Keep things read-only -- Note that read-only doesn't necessarily mean non-interactive

So let's get our hands dirty and look at our two paths in practical terms. 

For the purpose of these examples, I've made a table with two fields: 
* `html`, which is a read-only HTML field, and 
* `image`, an Image attachment field with an image in it.

# Hello HTML
----

HTML fields are the most straight forward, since much of the presentation layer is handled for us by UI16. The task is "simply" to generate HTML and write it to the field at the appropriate time.

We can...

* ...use a display business rule to populate the field it _in a draft state_ every time the form is loaded. There is much finesse to this approach, so see the caching strategies section for details.
* ...use update/insert rules to populate it when a relevant record changes. This more aligns us with leaning on live field updates to present our content. This allows records from different contexts to interact in real time; Say an HTML field in a form displays a list of "active objects" in another table. One of them goes inactive, a business rule fires, the HTML is updated, and the form field updates in real time. 

In either case, as long as we've updated our HTML field with plain, ServiceNow-renderable, good-times HTML, we have done both data and view in one motion. 

As an excellent example of redundancy, here's a display business rule grabbing an image URL from our image attachment field and using it to drive the HTML field:

```js
(function executeRule(current, previous /*null when async*/) {
	var imageID = current.getValue('image');
	var url = '/' + imageID + '.iix';
	var HTML = gs.getMessage('<img src="{0}"/>', url); 
	
	current.setValue('html', HTML);
})(current, previous);
```

## HTML limitations

The HTML field is intended to display static content, and as such supports nothing dynamic at all (though you might be able to get away with some CSS magic I'm not aware of). Tables, image tags, divs, paragraphs, headers and lists are the name of the game here. You *do* however have access to the UI16 CSS, so [Bootstrap3](https://www.w3schools.com/bootstrap/default.asp) is available to use and abuse, including its suite of [glyphicons](https://www.w3schools.com/bootstrap/bootstrap_ref_comp_glyphs.asp). You can get quite far with creative use of fundamental HTML, glyphicons and [unicode](https://unicode-table.com/en/).

> Quick tip: `GlideRecord.getLink` is super useful if you're making lots of references to records in your HTML!

# Hello UI Macro
----

UI Macros are a different commitment and may present a more complex data marshalling problem depending on your ambition. The UI Macro Jelly script supports arbitrary HTML content, so there is technically nothing stopping us from doing full WebGL applications in our Jelly XML, but traversing the server/client data boundary quickly becomes a puzzle simply because Jelly is actually an embedded _puzzle game_ ServiceNow added to the platform for our entertainment. Let's all be appreciative of this great favor and move right along!

> A quick digression: If you're not already aware of this, Client script and Server script are completely different beasts. Conflating the two may seem worth it for the sake of "consistency" but this is going to hurt you both ways and you'll reap fewer benefits of either side. 
>
> The sooner you embrace the fact that JS in ServiceNow has nothing at all to do with web development your life will become much simpler, because you can now reason about JS on the client as _actual_ web development with every modern benefit and tool that implies, and JS on the server as database scripting with every benefit of the GlideSystem and ServiceNow data model. 

For our purposes my suggestion would be to ignore the majority of the Jelly syntax and focus on this snippet, which achieves exactly the same result as the HTML example above.

```xml
<?xml version="1.0" encoding="utf-8" ?>
<j:jelly trim="true" xmlns:j="jelly:core" xmlns:g="glide" xmlns:j2="null" xmlns:g2="null">
	<!-- Use the g2 evaluate tag to build some data without caching -->
	<g2:evaluate var="jvar_html">
		var imageID = current.getValue('image');
		var url = '/' + imageID + '.iix';
		gs.getMessage('<img src="{0}"/>', url); // The final statement is our assigned value
	</g2:evaluate>

	<!-- Boilerplate to make our macro sit right in the form -->
	<div>
		<label class="col-xs-12 col-md-1_5 col-lg-2 control-label">
			<span class="label-text">Our macro name</span>
		</label>
	</div>
	<div class="col-xs-10 col-md-9 col-lg-8 form-field" style="padding-top:7px; padding-bottom:7px;">
		<!-- Simply render our HTML -->
		<g2:no_escape>$[jvar_html]</g2:no_escape>
	</div>
</j:jelly>
```

Here, we generate our image tag in the `g2:evaluate` tag and put it on screen in the `g2:no_escape` tag. 

>  The data we read is assumed to already exist on the current record being displayed, so if the `image` field was empty we would need a guard. 

It may seem silly to go through all this complexity of Jelly and setting up a macro/formatter pair just for the same visual we get with an HTML field, but here's the big difference: Whereas HTML fields are limited in what features they can use, *this* HTML is unshackled! You can display SVGs, use WebGL, or use any other modern HTML feature you can think of!

# Advanced UI Macros
----

## UI Scripts

## Data attribute vector

# Caching strategies
----

## Forms run at _user speeds_

There may be a better word for this, but I reference the concept of user speed or user _tempo_ a lot. By this, I mean subsystems being triggered by _user interactions_, as opposed to massive bulk jobs in a scheduled job or integration. This may be controversial, but I maintain that if code is fired at user speeds, performance can be planned around a relatively low rate of execution and is _much_ less of a concern in the big instance picture. A user can't click 50k buttons every split second, so prematurely optimizing for bigdata performance becomes a massive waste of time.

For this reason, don't feel too bad if you choose to go with a display business rule for the data generation step and rebuild your model whenever a form is viewed.
