# Database Library

The application is stored in a library as a collection of datablocks, objects
that inherit from DataBlock.  DataBlocks must follow a number of rules:

- Datablocks must never store references to non-datablocks objects that isn't "owned" by that datablocks.
- Datablocks may store references to other datablocks, including references from owned subobjects to
  other datablocks, but must go through a few API hoops.
  
Datablocks all inherit from graph.Node, and as such can participate in the dependency graph.

# Struct scripts

Datablocks must save references to other datablocks as DataRefs; for example:

```
SomeDataBlock.STRUCT = STRUCT.inherit(SomeDataBlock, DataBlock, "SomeDataBlock") + `
  anotherBlock : DataRef | DataRef.fromBlock(obj.anotherBlock);
}
`
```

Additionally, datablocks must implement the dataLink method to re-link DataRefs at load time.  And they must
call the .afterSTRUCT method inside fromSTRUCT (this behavior is inherited from graph.Node and may become automatic
in the future).  Here's a complete example:

```
class SomeDataBlock extends DataBlock {
  dataLink(getblock, getblock_add_user) {
    this.anotherBlock = getblock_add_user(this.anotherBlock);
  }
  
  static fromSTRUCT(reader) {
    reader(ret);
    ret.afterSTRUCT();
  }
}
SomeDataBlock.STRUCT = STRUCT.inherit(SomeDataBlock, DataBlock, "SomeDataBlock") + `
  anotherBlock : DataRef | DataRef.fromBlock(obj.anotherBlock);
}
`
```
