## Bugs

[x]: If you draw a sharp brush stroke with dyntopo off, then again with dyntopo on
     the nwjs app crashes.
     FIXED: interpAttrs/snapshot/restore in sculptcore attr_interp.h wrote through
     unmaterialized lazy attr pages (.brush.orig.*) when a split's new vert landed
     outside the brush-stamped pages; now safe_get on reads + materialize on writes.
     Regression test: sculptcore test_edge_split "lazy-attr" case.
