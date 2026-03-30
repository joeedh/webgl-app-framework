

<!-- toc -->

- [Code Style and Standard Practices Guide](#code-style-and-standard-practices-guide)
  * [Prettier](#prettier)
  * [Type assumptions](#type-assumptions)
  * [Static properties should come first in classes](#static-properties-should-come-first-in-classes)
  * [Imports](#imports)
  * [nstructjs pattern](#nstructjs-pattern)
<!-- regenerate with pnpm markdown-toc -->

<!-- tocstop -->

# Code Style and Standard Practices Guide

## Prettier

We use a fork of prettier for code formatting (it formats
object literals a bit nicer).

## Type assumption tags

Optimization often leads us to break the type system by assigning undefined to non-optional properties (e.g. a pooled object in the 'dead' state):

```typescript
class Bleh {
  bleh2: Bleh

  constructor(b: Bleh) {
    this.bleh2 = b
  }
  onDead() {
    this.bleh2 = undefined as unknown as typeof['bleh2']
  }
}
```

We can make this a lot nicer with an "assumptions" pattern:

```typescript
// adds `| undefined` to T if a condition is met
type OptionalIf<T, D extends true | false | undefined> = D extends true ? T | undefined : T

class Bleh<OPT extends {dead?: true | false} = {}> {
  bleh2: OptionalIf<Bleh2, OPT['dead']>

  constructor(b: Bleh2) {
    this.bleh2 = b
  }
  
  // note: you can restrict methods to certain tags
  onDead = function(this: Bleh<OPT & {dead: true}>) {
    this.bleh2 = undefined
  }
}
```

This cleans up external users of the class:

```typescript
const freedBlehs = [] as Bleh<{dead: true}>[]

function freeBleh(bleh: Bleh) {
  const deadBleh = bleh as Bleh<{dead: true}>
  deadBleh.bleh2 = undefined
  freedBlehs.push(deadBleh)
}

function allocateBleh(bleh2: Bleh2) {
  const bleh = freedBlehs.pop()

  if (bleh) {
    bleh.bleh2 = bleh2
    return bleh as Bleh
  }
  return new Bleh(bleh2)
}

```

## Static properties should come first in classes

Static properties should come first in classes.

## Imports

Imports to typescript packages should never have a file extension,
e.g. `import {} from 'my-test-module'`.  Imports to non-TS JS modules however should have an extension, e.g
`import {} from 'my-js-module.js'`.

## nstructjs pattern

Use the inline nstructjs pattern, e.g.

```\typescript
class MyClass {
  static STRUCT = nstructjs.inlineRegister(this, `
  MyClass {
    property: int;
  }  
  `)

  property: int
}
```

Do not use:

```\typescript
class MyClass {
  property: int
}
MyClass.STRUCT = `
MyClass {
  property: int;
}
nstructjs.register(MyClass);
`
