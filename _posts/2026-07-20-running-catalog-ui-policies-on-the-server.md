---
layout: post
title: Making ServiceNow catalog requests behave over REST
tagline: Simulating Catalog UI Policies so integrations obey the same rules as users.
date: 2026-07-20 19:00:00 +0200
categories:
  - development
  - servicenow
  - serviceportal
---

ServiceNow’s Service Catalog presents itself as a system for defining requests. You create variables, arrange them into a form, establish UI Policies, and end up with something that appears to describe what a valid request looks like.

Then you try to order the same item over REST and discover you have mostly described what a valid request *looks like in a browser*.

The distinction is subtle enough to be missed and severe enough to make integrations dangerous. A Catalog UI Policy might make a variable mandatory when a particular delivery method is selected. It might reveal a set of follow-up questions, or make a field read-only once another choice has been made. A user ordering through the portal experiences those rules as characteristics of the catalog item itself.

They aren’t. They are a client-side performance.

Send variable data from an integration and the server does not naturally reconstruct that performance for you. It receives an object and lets your code decide how much of the catalog item’s supposed contract was real.

I wanted REST requests to obey the rules we had already established instead of creating a separate, vestigial catalog made out of validation scripts. The result was [UIPolicyValidator and VariableValidationUtils](https://gist.github.com/Sunjammer/f6c64e6250b05d484700c0957f2085b7): a pair of server-side utilities that simulate the relevant Catalog UI Policies against incoming data before allowing that data to become a request.

This is old code, written in 2020, and it should be treated as a working argument rather than scripture. The point is not that these files account for every strange thing ServiceNow can emit. The point is that a REST integration can ask the same question the form asks:

> Given these variable values, what state would the catalog item be in?

Once the server can answer that, it can enforce the answer.

## The REST-shaped hole in the catalog

Imagine a catalog item with two variables:

- `hardware_required`
- `hardware_model`

The second variable is hidden and optional until the first is set to `Yes`. A UI Policy then makes `hardware_model` visible and mandatory.

In the portal this is perfectly ordinary. The user selects `Yes`, the form changes, and the missing model prevents submission. Over REST, however, this is just as easy to send:

```json
{
  "hardware_required": "Yes"
}
```

The browser would reject it. The server may not.

You could add an explicit check to the REST resource:

```javascript
if (input.hardware_required == "Yes" && !input.hardware_model) {
  throw new Error("hardware_model is required");
}
```

Do this enough times and you have two catalogs. One is maintained by catalog administrators through variables and UI Policies. The other is distributed across Script Includes, REST resources, Flow actions, import scripts and the fading memories of whoever last touched the integration.

These two catalogs will diverge. This is not cynicism. It is the natural conclusion of asking humans to keep duplicated logic synchronized without a machine checking their work.

The alternative is to take the UI Policy configuration seriously as a source of rules and simulate it on the server.

## Build a virtual catalog item

The simulator first gathers the pieces ServiceNow normally hands to the client:

- variables defined directly on the catalog item
- variables included through variable sets
- the item’s Catalog UI Policies
- policies attached through variable sets
- each policy’s ordered actions

This is reduced to a plain object describing the item:

```javascript
{
  sysId: "CATALOG_ITEM_SYS_ID",
  variables: {
    hardware_required: {
      sysId: "VARIABLE_SYS_ID",
      mandatory: false,
      visible: true,
      disabled: false
    },
    hardware_model: {
      sysId: "ANOTHER_VARIABLE_SYS_ID",
      mandatory: false,
      visible: false,
      disabled: false
    }
  },
  policies: [
    // Conditions, order, reverse-if-false and variable actions
  ]
}
```

I call this a validation item. It is a portable description of the parts of the catalog item relevant to the request, shorn of GlideRecord behavior and ready to be passed through ordinary functions.

This separation is important. Trying to evaluate the whole thing while walking records would turn the implementation into the sort of GlideRecord séance where data access, parsing and validation all hold hands in the dark and insist they can hear each other.

Once the records have become data, the rest is a simulation.

## UI Policy conditions are executable ideas hiding in strings

A Catalog UI Policy condition can look like this:

```text
IO:16f88b31dbc62410bb877b47f49619cf=Yes^EQ
```

This is an encoded query, but it is more useful to think of it as a tiny program:

```text
[variable] [operator] [value]
```

The `IO:` portion points at a catalog variable by sys_id. The simulator resolves that ID to its variable name, reads the corresponding value from the REST input, selects an implementation for the operator, and executes the comparison.

Conceptually, the condition above becomes:

```javascript
stringOperators["="](variables.hardware_required, "Yes")
```

The operator table is intentionally dull:

```javascript
const stringOperators = {
  STARTSWITH: (a, b) => a.startsWith(b),
  LIKE: (a, b) => a.includes(b),
  NOTLIKE: (a, b) => !a.includes(b),
  "=": (a, b) => a == b,
  "!=": (a, b) => a != b,
  ISEMPTY: (a) => a == null || a === "",
  ISNOTEMPTY: (a) => !(a == null || a === "")
};
```

The parser divides the encoded condition into `AND`, `OR` and `NQ` groups, producing a small expression tree. Evaluating that tree tells us whether the policy would run for the supplied variable values.

There is no `eval`, because constructing executable JavaScript from strings stored in a database would be a flamboyant way to turn a validation tool into an incident report. Known operators are mapped to known functions. Unknown operators fail rather than acquiring meaning through optimism.

## Simulate all the policies, not just one

Matching a policy is not enough. Real catalog items accumulate policies, and those policies frequently overlap. Two actions may affect the same variable. An action may change only one property and ignore the others. Policy order establishes precedence. “Reverse if false” means a policy that did not match may still participate with its Boolean actions inverted.

This means we cannot validate the input against each policy independently. We need to know the final state a user would encounter after the client has run all of them.

The simulator reduces every participating policy into a master policy. Its actions represent the effective state of each variable:

```javascript
{
  hardware_model: {
    mandatory: true,
    visible: true,
    disabled: false
  }
}
```

When actions collide, they are folded according to policy order. Concrete values override earlier values while `ignore` preserves the state already established. Policies with “Reverse if false” are reversed before entering the reduction.

This master policy is the useful result of the whole exercise. It is not a list of things the form might do. It is what the form *would have done for this request*.

Apply it to the incoming variable object and every value gains its simulated UI state:

```javascript
{
  hardware_required: {
    value: "Yes",
    mandatory: false,
    visible: true,
    disabled: false
  },
  hardware_model: {
    value: null,
    mandatory: true,
    visible: true,
    disabled: false
  }
}
```

The missing model is no longer an endpoint-specific special case. It is a violation of the catalog item’s own simulated state.

## A value is not valid merely because it exists

UI Policy simulation tells us whether variables are mandatory, visible or read-only. REST data has another problem: JavaScript will let callers provide almost any shape imaginable, while catalog variables ultimately expect particular string representations.

`VariableValidationUtils` handles that boundary. It finds each variable’s type and attempts to normalize the supplied value into something the catalog can actually use.

The utility accounts for the common variable types: Yes/No values and checkboxes, multiple-choice variables, numeric scales, references, dates, date-times, durations, email addresses, URLs, IP addresses and list collectors. Choice values can be checked against their available options. Reference values can be checked against the expected table and qualifier. List collectors can accept an array without requiring every caller to know ServiceNow wants a comma-separated string at the end of the process.

It also rejects unknown input keys. Quietly ignoring a misspelled variable name in an automated request is a beautiful way to produce a valid request for the wrong thing.

The two utilities meet in one operation:

```javascript
var result = VariableValidationUtils.validateVariables(
  catalogItemSysId,
  input,
  true // Simulate and apply Catalog UI Policies
);

if (result.errors.length) {
  // Reject the REST request and return the errors.
} else {
  // result.variables contains normalized values ready for the cart.
}
```

With policy simulation enabled, validation can reject a value supplied for a read-only variable and report a missing mandatory variable. Without it, the utility still casts values and checks their compatibility with the catalog variable definitions.

This gives a REST resource a clean boundary. Everything outside may speak JSON with the usual abandon. Everything crossing into the catalog has been converted to known variable names, known representations and a state permitted by the same declarative policies that govern the form.

## Manipulating requests becomes less frightening

Validation is the immediate purpose, but a simulated variable state is also useful when manipulating requests.

An integration can load the variables from an existing Requested Item, modify a subset, rerun the policies, and determine whether the new combination is coherent before applying it. A transformation can discover that changing one answer has made another variable mandatory. A migration can identify values that are now read-only or choices that no longer exist. A REST API can return a structured explanation instead of allowing a malformed request to travel several stages into a workflow before exploding somewhere expensive.

The important property is that every manipulation is evaluated as a complete proposed state. We are not merely checking whether the changed field looks reasonable in isolation. We are asking the catalog item what the consequences of that change would have been in the interface where its rules normally live.

This still does not make the server a browser. Catalog Client Scripts and scripted UI Policy behavior can be arbitrary programs, and executing arbitrary client code on the server is neither practical nor desirable. The simulator handles the declarative portion: conditions, ordering, reverse-if-false and actions affecting mandatory, visible and disabled states.

That covers a useful amount of real catalog behavior without attempting to reproduce the entire Service Portal in a Script Include, a project whose only credible ending is a change of career.

## The code has edges because the platform has edges

The gist supports the operators and variable types required by the system it came from. It is not a complete implementation of every encoded-query operator or every catalog eccentricity ServiceNow has produced.

Dynamic reference qualifiers are rejected rather than guessed at. Layout-only variables do not represent useful submitted data. UI Policy scripts are collected but not executed. Conditions produced by your instance should be tested against the parser before you trust it with production requests.

`VariableValidationUtils` also contains an example preprocessing hook using an `x_foo_rest_rule` table. This represents an instance-specific extension point where a value could be transformed before type validation. Replace it with a mechanism that belongs to your application or remove it entirely. Do not build a mystery table simply because old code mentions one. We have enough mystery tables.

The implementation should be extended by making its supported behavior explicit: add an operator function, add a variable-type handler, add a test. Avoid the temptation to create a universal fallback that passes unfamiliar input. Validation code that assumes unknown things are probably fine is just ceremonial code.

## One catalog, not two

ServiceNow encourages us to build surprisingly sophisticated request interfaces and then makes it easy to treat REST ordering as if it were inserting values into a questionnaire.

It isn’t. A catalog item is a set of variables plus the relationships between them. If those relationships only exist while a browser is open, integrations are interacting with a diminished and misleading version of the item.

Simulating Catalog UI Policies does not reproduce every twitch of the client, nor should it. It takes the declarative rules administrators already maintain, evaluates them against the proposed REST payload, combines them into the form state they imply, and applies that state before the request is allowed to proceed.

The browser remains responsible for interaction. The server becomes responsible for truth.
