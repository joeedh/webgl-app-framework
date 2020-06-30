import {Matrix4} from '../../util/vectormath.js';
import {ShaderProgram} from "../../core/webgl.js";

export let PolygonOffset = {
  //pre : '',
  //vertex : (posname) => {return '';},
  pre  : `uniform float polygonOffset;`,
  vertex : (posname) => `
  {
    float z = ${posname}[2];
    z -= polygonOffset*0.00001;
    
    ${posname}[2] = z;
  }
  `,
  fragment : `
  `
};

export let BasicLineShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;

attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;

varying vec4 vColor;
varying vec2 vUv;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
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
    alpha : 1.0,
    objectMatrix : new Matrix4()
  },
  
  attributes : [
    "position", "uv", "color"
  ]
};

export let ObjectLineShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;

attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;

${PolygonOffset.pre}

//varying vec4 vColor;
varying vec2 vUv;
uniform vec2 shift;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p")}
  
  p.xy += shift*p.w;  
  gl_Position = p;
  //vColor = color;
  vUv = uv;
}

  `,

  fragment : `precision mediump float;
uniform float alpha;

//varying vec4 vColor;
varying vec2 vUv;
uniform vec4 uColor;

void main() {
  gl_FragColor = uColor * vec4(1.0, 1.0, 1.0, alpha);
}
  `,

  uniforms : {
    alpha : 1.0,
    uColor : [1, 1, 1, 1],
    shift : [0, 0],
    objectMatrix : new Matrix4()
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
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
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
  float f;
  vec3 no = normalize(vNormal);
  
  f = abs(no[1]*0.333 + no[2]*0.333 + no[0]*0.333);
  f = f*0.8 + 0.2;
  vec4 c = vec4(f, f, f, 1.0);
  
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
attribute vec2 uv;
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
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
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
attribute vec2 uv;
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

varying float vId;
${PolygonOffset.pre}

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p")}
  
  gl_Position = p;
  gl_PointSize = pointSize;
  
  vId = id + 1.0; // + id_offset;
}
`,
  fragment : `precision mediump float;

uniform float id_offset;
uniform float object_id;

varying float vId;
${PolygonOffset.pre}

void main() {
  gl_FragColor = vec4(object_id+1.0, vId, 0.0, 1.0);
  ${PolygonOffset.fragment}
}
  `,

  uniforms : {
    objectMatrix : new Matrix4(),
    pointSize : 5
  },

  attributes : [
    "position", "uv", "color", "id"
  ]
};

export let MeshLinearZShader = {
  vertex : `#version 300 es
  
precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 cameraMatrix;

uniform mat4 objectMatrix;
uniform mat4 normalMatrix;

in vec3 position;
//in vec3 normal;
//in vec2 uv;
in vec4 color;
in float id;

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

out vec4 vColor;
out float vId;
out vec3 vLightCo;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  vec3 lp = (objectMatrix * vec4(position, 1.0)).xyz;
  lp = (cameraMatrix * vec4(lp, 1.0)).xyz;
  
  vLightCo = lp;
  
  gl_Position = p;
  gl_PointSize = pointSize;
  
  vId = id;// + id_offset;
  
  vec4 c;
  
  c[0] = vId;
  c[1] = object_id;
  
  vColor = c;
}
`,
  fragment : `#version 300 es

precision mediump float;

uniform float id_offset;
uniform float object_id;
uniform float near;
uniform float far;

in vec4 vColor;
in float vId;
in vec3 vLightCo;

out vec4 fragColor;

void main() {
  //fragColor = vec4(vId+1.0, object_id, 0.0, 1.0);
  fragColor = vec4(0.5, 0.5, 0.5, 1.0);
  
  //gl_FragDepth = (vLightCo.z - near) / (far - near);
  gl_FragDepth = vLightCo.z / far;
  
  //gl_FragDepth = gl_FragCoord[2]/gl_FragCoord[3];
}
  `,

  uniforms : {
    objectMatrix : new Matrix4()
  },

  attributes : [
    "position", "color", "id"
  ]
};

export let NormalPassShader = {
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
varying vec3 vCameraNormal;
varying vec2 vUv;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  vec4 n = normalMatrix * vec4(normal, 0.0);
  
  n = normalize(projectionMatrix * objectMatrix * vec4(normal, 0.0));
  
  gl_Position = p;
  
  vUv = uv;
  vNormal = normal;
  vCameraNormal = n.xyz;
  vColor = color;
}

  `,

  fragment : `precision mediump float;
uniform float alpha;

varying vec4 vColor;
varying vec3 vCameraNormal;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  float f;
  
  vec3 no = normalize(vNormal);
  //flip normal towards camera
  if (vCameraNormal[2] > 0.0) {
    no = -no;
  }
  
  gl_FragColor = vec4(no*0.5 + 0.5, 1.0);
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



export let BasicLineShader2D = {
  vertex : `precision mediump float;
  
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;

uniform vec2 size;

varying vec4 vColor;
varying vec2 vUv;

void main() {
  gl_Position = vec4((position.xy/size)*2.0-1.0, position.z, 1.0);
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

export let WidgetMeshShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform vec4 color;
uniform float pointSize;

${PolygonOffset.pre}

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p")}
  
  gl_Position = p;
  gl_PointSize = pointSize;
}
`,
  fragment : `precision mediump float;
uniform vec4 color;

${PolygonOffset.pre}

void main() {
  ${PolygonOffset.fragment}
  gl_FragColor = color;
}
  `,

  uniforms : {
    pointSize : 10.0,
    objectMatrix : new Matrix4(),
    color : [0, 0, 0, 1]
  },

  attributes : [
    "position", "color", "id"
  ]
};


export let SubSurfPatchShader = {
  vertex : `precision mediump float;
  `
}
export const ShaderDef = {
  BasicLineShader      : BasicLineShader,
  ObjectLineShader     : ObjectLineShader,
  BasicLineShader2D    : BasicLineShader2D,
  BasicLitMesh         : BasicLitMesh,
  MeshEditShader       : MeshEditShader,
  MeshIDShader         : MeshIDShader,
  WidgetMeshShader     : WidgetMeshShader,
  NormalPassShader     : NormalPassShader,
  MeshLinearZShader    : MeshLinearZShader
};

export let Shaders = {
};

//global for debugging purposes only
window._Shaders = Shaders;

//see view3d_shaders.js
export function loadShader(gl, sdef) {
  let shader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);

  shader.init(gl);

  for (let k in sdef.uniforms) {
    shader.uniforms[k] = sdef.uniforms[k];
  }

  return shader;
}
