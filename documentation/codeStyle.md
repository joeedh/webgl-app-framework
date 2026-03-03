# Code Style and Standard Practices Guide

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
