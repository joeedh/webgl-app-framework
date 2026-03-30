---
name: tagmethod
description: Convert a standard class method to a form with a constrained 'this' type, for use with a tagged assumption for
---

`Assumption Tags` are a type
in the form `{name?: true|false}`
`Tags` refers to the valid set
of assumption tags.
`DefaultTags` refers to the default
set of tags.
`MethodToChange` is the method in the class to change.
`Arguments` are the method's arguments
`NewTags` refer to the set of new tags
the user wants.  Tags are strings that
map to booleans.

Convert ```ts
class Class<OPT extends {Tags} = DefaultTags> {
    MethodToChange(Arguments) {
    }
}
```

To 

```typescript
class Class<OPT extends {Tags} = DefaultTags> {
    MethodToChange(this: Class<OPT & {NewTags}>, Arguments) {
    }
}
```
