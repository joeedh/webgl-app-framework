export * from '../path.ux/scripts/vectormath.js';

export function Matrix4ToTHREE(mat) {
  let m2 = new THREE.Matrix4();

  m2.fromArray(mat.getAsArray());

  return m2;
}