import {Matrix4} from '../../util/vectormath.js';

export let PolygonOffset = {
  pre  : `uniform float polygonOffset;`,
  vertex : (posname) => `
  {
    float z = ${posname}[2];
    z -= polygonOffset*0.0001;
    
    ${posname}[2] = z;
  }
  `,
  fragment : `
  `
};

export let BasicLineShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 normalMatrix;

attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;

varying vec4 vColor;
varying vec2 vUv;

void main() {
  vec4 p = projectionMatrix * vec4(position, 1.0);
  
  gl_Position = p;
  vColor = color;
  vUv = uv;
}

  `,
  
  fragment : `precision mediump float;
uniform float alpha;

varying vec4 vColor;
varying vec2 vUv;

void main() {
  gl_FragColor = vColor * vec4(1.0, 1.0, 1.0, alpha);
}
  `,
  
  uniforms : {
    alpha : 1.0
  },
  
  attributes : [
    "position", "uv", "color"
  ]
};

export let BasicLitMesh = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;

varying vec4 vColor;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  //vec4 p = objectMatrix * vec4(position, 1.0);
  
  vec4 p = projectionMatrix * vec4(position.xyz, 1.0);
  vec4 n = normalMatrix * vec4(normal, 0.0);
  
  gl_Position = p;
  
  vUv = uv;
  vNormal = n.xyz;
  vColor = color;
}

  `,
  
  fragment : `precision mediump float;
uniform float alpha;

varying vec4 vColor;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vec4 c = vec4(1.0,1.0,1.0,1.0);//vColor;
  
  float f;
  
  f = abs(vNormal[1]*0.4 + vNormal[2]*0.6);
  c.rgb = vec3(f, f, f)*1.5;//*vColor.rgb;
  
  gl_FragColor = c;
}
  `,
  
  uniforms : {
    alpha : 1.0,
    objectMatrix : new Matrix4()
  },
  
  attributes : [
    "position", "normal", "uv", "color"
  ]
};

export let MeshEditShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;

attribute vec3 position;
//attribute vec3 normal;
//attribute vec2 uv;
attribute vec4 color;
attribute float id;

uniform float alpha;
uniform float active_id;
uniform float highlight_id;
uniform float last_id;
uniform vec4 active_color;
uniform vec4 last_color;
uniform vec4 highlight_color;
uniform float pointSize;

varying vec4 vColor;
varying float vId;
${PolygonOffset.pre}

void main() {
  //vec4 p = objectMatrix * vec4(position, 1.0);
  
  vec4 p = projectionMatrix * vec4(position.xyz, 1.0);
  
  ${PolygonOffset.vertex("p")}
  
  gl_Position = p;
  gl_PointSize = pointSize;
  
  vId = id;
  
  if (highlight_id == id) {
    vColor = highlight_color;
  } else if (last_id == id) {
    vColor = last_color;
  } else if (active_id == id) {
    vColor = active_color;
  } else {
    vColor = color;
  } 
}
`,
  fragment : `precision mediump float;
uniform float alpha;
varying vec4 vColor;
varying float vId;
${PolygonOffset.pre}

void main() {
  vec4 c = vColor;
  
  ${PolygonOffset.fragment}
  gl_FragColor = c * vec4(1.0, 1.0, 1.0, alpha);
}
  `,

  uniforms : {
    alpha : 1.0,
    objectMatrix : new Matrix4()
  },

  attributes : [
    "position", "color", "id"
  ]
};

export let MeshIDShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;

attribute vec3 position;
//attribute vec3 normal;
//attribute vec2 uv;
attribute vec4 color;
attribute float id;

uniform float id_offset;
uniform float object_id;
uniform float alpha;
uniform float active_id;
uniform float highlight_id;
uniform float last_id;
uniform vec4 active_color;
uniform vec4 last_color;
uniform vec4 highlight_color;
uniform float pointSize;

varying vec4 vColor;
varying float vId;
${PolygonOffset.pre}

void main() {
  //vec4 p = objectMatrix * vec4(position, 1.0);
  
  vec4 p = projectionMatrix * vec4(position.xyz, 1.0);
  
  ${PolygonOffset.vertex("p")}
  
  gl_Position = p;
  gl_PointSize = pointSize;
  
  vId = id + id_offset;
  
  vec4 c;
  
  c[0] = vId;
  c[1] = object_id;
  
  vColor = c;
}
`,
  fragment : `precision mediump float;

uniform float id_offset;
uniform float object_id;

varying vec4 vColor;
varying float vId;
${PolygonOffset.pre}

void main() {
  gl_FragColor = vec4(vId+1.0, object_id, 0.0, 1.0);
  ${PolygonOffset.fragment}
}
  `,

  uniforms : {
    objectMatrix : new Matrix4()
  },

  attributes : [
    "position", "color", "id"
  ]
};

export const ShaderDef = {
  BasicLineShader : BasicLineShader,
  BasicLitMesh    : BasicLitMesh,
  MeshEditShader  : MeshEditShader,
  MeshIDShader    : MeshIDShader
};

export let Shaders = {
};

//global for debugging purposes only
window._Shaders = Shaders;
