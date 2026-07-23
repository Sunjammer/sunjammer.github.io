---
layout: post
title: Custom routing of REST requests through a MID server
tagline: Wretched ServiceNow MID server hackery
date: 2022-9-9 12:00:00 +0200
categories:
  - development
  - servicenow
  - serviceportal
kind: field-note
---

It's been a while since I last wrote at length about any abominable ServiceNow hacks, but I've recently done something that feels truly absurd, so I figured it was about time. I've had a generally bad feeling about this ever since I implemented it, so the hope is that you either think I'm a clever pragmatist or a ridiculous fool, and in the latter case that you'll take the time to correct me 😎

In building a custom Event Connector, our problem was that outbound REST-calls with `HTTPRequest` from MID-server scripts did not respect the server's proxy settings: `mid.proxy.host` and `mid.proxy.port`. Documentation for `HTTPRequest` and MID-server scripting in general is painfully scarce. So scarce it seems to have become some sort of weird specialist trade where people don't want to share what they know, so I felt I had to roll up my sleeves here and just get to hacking something together.

### Hack 1: Fuzzing HTTPRequest and exploiting Java exceptions in the scripting layer

The MID-server scripting layer is much thinner than GlideSystem as a whole: JS types are in many cases extremely thin wrappers around Java APIs with few safety measures and hardly any silent failures. Coming to MID-scripting thinking you are writing JavaScript is a mistake. The fact that packages are imported in a Java style (ie `var HTTPRequest = Packages.com.glide.communications.HTTPRequest` rather than any kind of require or other nice modernity) means you both need to know where to find the API you want and also exactly how you can use it. With zero documentation other than "read the OOB code" (which is full of weird junk), deducing how to configure `HTTPRequest` was a bit fiddly.

Fist, to get an immediate overview of what an`HTTPRequest` object instance contains, I iterated over all its fields and their types

```JavaScript
for(var k in myRequestObject)
    log(k+": " + (typeof myRequestObject[k]))
```

This revealed a heaving mass of fields and methods, one of which was called `setupProxy`. Hmm! Printing`myRequestObject.setupProxy.length` gave an argument count of 2, but with no type information or argument names I found the best way to get information about this method was to naively fuzz it and look at its errors.

Broadly speaking, fuzzing is simply the act of throwing arbitrary data at a thing and observing how it behaves, and since the MID scripting layer is so thin trying to call `setupProxy` with incompatible argument data types should throw exceptions. This is about as much help as I was going to get.

```JavaScript
function pickRandom(set){
    var idx = Math.floor(Math.random() * set.length);
    return set[idx];
}
var args = [1, "", {}, [], true]; // number, string, object, array, boolean
var start = new Date().getTime();
while(true){
    // Make a random pair of arguments
    var randomArgs = [pickRandom(args), pickRandom(args)];
    try{
        // Try setupProxy with them
        req.setupProxy.apply(req, randomArgs);
        // If no exception was caused, log the args and break
        log("Successful args: "+typeof(randomArgs[0])+","+typeof(randomArgs[1]));
        break;
    }catch(e){
        // If we've gone for a while with no success, end
        var now = Date.now();
        if(now - start > 250){
            log("Timed out");
            break;
        }
        // Swallow the exception and keep rolling
    }
}
```

There's an obvious way you can make this more effective by precomputing all possible argument combinations and making the loop fixed length, but at the time I was max lazy and randomizing the args did the trick. This quickly showed `setupProxy` accepts two string arguments. With some educated guesswork I surmised this would be a hostname and a port, which turned out to be correct. The final HTTPRequest configuration became the following:

```JavaScript
var req = new HTTPRequest(url);
req.setupProxy(ms.getConfigParameter("mid.proxy.host"), ms.getConfigParameter("mid.proxy.port"));
req.get();
```

Score!

> Sidenote: The Java-ness of MID-scripting comes with some really insidious traps. For instance, an Array returned from an API may or may not be a fixed-length Java array. Popping off such an array in a while loop does not alter the array's length!

while(stack.length>0) stack.pop()

````plaintext

>This is a pretty common way to consume a stack, and had me sending the server into infinite loops for a good hour before I figured out just what was going on.

### Hack 2: Marshalling outbound REST calls through the MID-server ECC queue.

Most of this application would run on MID-server(s), but a large blob of reusable metadata from the same API we pulled events and metrics from would need to be cached to a ServiceNow table as part of a scheduled job. I was under the impression that configuring HTTP methods in ServiceNow to use a specific MID-server would use that MID-server's proxy settings. Instead I was experiencing the same timeouts I had encountered earlier in MID-scripts. This is either me misunderstanding why you'd want to route outbound REST through the MID, or a trick to the customer's infrastructure. Either way my outbound REST calls were blocked, and I needed to find a way.

A moment to soapbox here: A huge part of this job is designing elegant, easily understood and automatable processes. It would have been so easy for me at this point to just say "fine, whatever, it's broken", and use a quick fix to solve the problem in a one-off fashion and move on. A fix could have been to manually pull that data and paste a massive blob of JSON into a background script, but this approach creates a huge splash of technical debt. A hacky scheduled job can be rewritten, but its existence expresses *intent*. I think it's hugely important that an overall design exists even if its implementation details are not optimal.

ServiceNow has a mechanism for executing arbitrary JavaScript on MID-servers using JavaScripted discovery probes. This is a global script include called `JavascriptProbe`. I was working in a scoped application, and many of the APIs used in JavascriptProbe are not permitted in scoped apps. This led me to create a scoped clone of `JavascriptProbe` imaginatively called `JSProbe`, reimplementing methods with scoped variants. The way this works is by adding a record to the MID-server's ECC queue containing the JavaScript to run as a string, and then putting a business rule on the ECC queue to read the response. Whew!

Here's the script include...

```JavaScript
function JSProbe(mid_server) {
    this.midServer = mid_server;
    this.source = "";
    this.name = "JSProbe";
    this.params = [];
    this.toXML = function (arr) {
        var str = "<parameters>";
        for (var i = 0; i < arr.length; i++) {
            var ob = arr[i];
            str += '<parameter name="' + ob.name + '" value="' + ob.value + '"></parameter>';
        }
        return str + "</parameters>";
    };

    this.setName = function (name) {
        this.name = name;
    };

    this.setSource = function (s) {
        this.source = s;
    };

    this.addParameter = function (name, value) {
        this.params.push({ name: name, value: value });
    };

    this.setJavascript = function (script) {
        this.addParameter("script", script);
    };

    this.create = function () {
        var egr = new GlideRecord("ecc_queue");
        egr.agent = "mid.server." + this.midServer;
        egr.queue = "output";
        egr.state = "ready";
        egr.topic = "JavascriptProbe";
        egr.name = this.name;
        egr.source = this.source;
        egr.payload = this.toXML(this.params);
        return egr.insert();
    };
}

var MIDServerHacks = Class.create();
MIDServerHacks.prototype = {

    query: function (name, midserver, url) {
        var js = "var request = new Packages.com.glide.communications.HTTPRequest(probe.getParameter('url')); request.addHeader('Accept', 'application/json'); request.setupProxy(''+ms.getConfigParameter('mid.proxy.host'), ''+ms.getConfigParameter('mid.proxy.port')); var response = request.get(); response.getBody();";
        var jspr = new JSProbe(midserver);
        jspr.setName(name);
        jspr.addParameter('url', url);
        jspr.setJavascript(js);
        jspr.create();
    },

    getTextFromECCPayload: function (gliderecord) {
        var xmlstr = gliderecord.payload.toString();
        return xmlstr.slice(xmlstr.indexOf("<output>") + "<output>".length, xmlstr.indexOf("</output>"));
    },

    type: 'MIDServerHacks'
};
````

...and its use in (an anonymized) scheduled job

```JavaScript
new global.MIDServerHacks().query('MyMethod',
        'MidServerName',
        'https://service.com/api/someApi?arg'
        );
```

The first argument, `name`, becomes the identifier you can match with in the ECC queue, so in this case to get the result I would create an advanced after-insert business rule on the `ecc_queue` table constrained to a `Name` of "MyMethod" and a `Queue` of "input":

```JavaScript
(function executeRule(current, previous) {
    try{
		var payloadText = new MIDServerHacks().getTextFromECCPayload(current);
        var resultData = JSON.parse(payloadText);
        // Process the result here
    }catch(e){
        gs.error('Error: '+e);
    }
})(current, previous);
```

Through this franken-solution I was able to at the very least establish a scoped app with a readable design that circumvented infrastructure an edge case in a technically reasonable way.
