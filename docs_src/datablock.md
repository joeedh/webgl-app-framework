# Database Library

![Datablock class diagrams](image/datablock_illustration.png)

The core abstract class is DataBlock (note that not everything subclasses from it).  DataBlocks are 
inspired by Blender's library blocks, and work in a similar way.  
Important types inherit from DataBlock (e.g. meshes, scenes, objects, lights).  
DataBlocks support (or will anyway) independently loading them from files,
so a DataBlock in one file can reference a DataBlock in another.  

In addition, DataBlocks are all graph nodes (they subclass from Node), which complicates things a bit because
graph.Graph serializes all of its nodes internally while DataBlocks are supposed to
be independently loadable.  For this reason, Graph has a special Proxy API that saves
dummy stand-ins inside Graph.nodes during serialization, which can be swapped out for real
DataBlocks on file load. 

## Rules

DataBlocks must follow a number of rules:

- Datablocks must never store references to non-datablocks objects that aren't "owned" by that datablocks.
- Datablocks may store references to other datablocks, including references from owned subobjects to
  other datablocks, but must go through a few API hoops.
  
Datablocks all inherit from graph.Node, and as such can participate in the dependency graph.

## Struct scripts

Datablocks must save references to other datablocks as DataRefs; for example:

```
SomeDataBlock.STRUCT = STRUCT.inherit(SomeDataBlock, DataBlock, "SomeDataBlock") + `
  anotherBlock : DataRef | DataRef.fromBlock(obj.anotherBlock);
}
`
```

## Linking

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
