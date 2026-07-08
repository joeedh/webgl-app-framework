export enum DrawModes {
  BOUNDS = 1, // draw object's AABB only
  WIRE = 2, // draw wireframe, respect xray mode (or object's DrawFlags's FORCE_XRAY flag)
  SOLID = 4, // draw solid
  TEXTURED = 8, // move into DrawFlags
}

export enum DrawFlags {
  FORCE_XRAY = 1 << 0,
  WIREFRAME = 1 << 1,
  TEXTURED = 1 << 2,
}
