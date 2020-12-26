import {Matrix4} from '../util/vectormath.js';
import {ShaderProgram} from "../core/webgl.js";

export let PolygonOffset = {
  //pre : '',
  //vertex : (posname) => {return '';},
  pre  : `uniform float polygonOffset;`,
  vertex : (posname, nearname, farname) => {
    if (nearname && farname) {
      return `
  {
    float z = ${posname}[2];
    float near = ${nearname};
    float far = ${farname};
    float w = ${posname}[3];
    
    float off = 5.0*polygonOffset/(far - near + 0.00001);
    
    z -= off;
    
    ${posname}[2] = z;
  }`;
    } else {
      return `
  {
    float z = ${posname}[2];
    z -= polygonOffset*0.00001;
    
    ${posname}[2] = z;
  }`;

    }
  },
  fragment : `
  `
};

export let SmoothLine = {
  pre : `
#ifdef SMOOTH_LINE
    attribute vec2 _strip_uv;
    attribute vec4 _strip_dir;
    varying vec2 vStripUv;
#endif
  `,
  fragmentPre: `
#ifdef SMOOTH_LINE
    varying vec2 vStripUv;
#endif
  `,
  vertex : (pname) => {
    let p = pname;

    return `
#ifdef SMOOTH_LINE
    {
      float width = _strip_dir[3];
      vec4 dir = objectMatrix * vec4(_strip_dir.xyz, 0.0);
      
      dir = projectionMatrix * dir;
      dir = vec4(dir.xy, 0.0, 0.0);
      dir = normalize(dir);
      
      ${p}.xyz /= ${p}.w;
      
      float s = width/size[1];
      
      ${p}[0] += dir[1]*_strip_uv[0]*s;
      ${p}[1] += -dir[0]*_strip_uv[0]*s;

      vStripUv = vec2(_strip_uv[0], width); 

      ${p}.xyz *= ${p}.w;
    }
#endif
    `
  },
  fragment : (alphaname) => {
    if (!alphaname) {
      return '';
    }

    return `
#ifdef SMOOTH_LINE
{   
  float f = abs(vStripUv[0]);
  float t = vStripUv[1] - 1.5;
  
  f *= vStripUv[1];
  f = f > t ? 1.0 - (f - t) / (vStripUv[1] - t) : 1.0;
  
  ${alphaname} *= f;
}
#endif
    
    `;
  }
}

export let BasicLineShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;

attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;

varying vec4 vColor;
varying vec2 vUv;

uniform float aspect, near, far;
uniform vec2 size;
${PolygonOffset.pre}

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p", "near", "far", "size")}
  
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

uniform float aspect, near, far;
uniform vec2 size;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p", "near", "far", "size")}
  
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
  
  f = no[1]*0.333 + no[2]*0.333 + no[0]*0.333;
  f = f < 0.0 ? -f*0.2 : f;
  
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

export let BasicLitMeshTexture = {
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

uniform sampler2D texture;

void main() {
  float f;
  vec3 no = normalize(vNormal);
  
  f = no[1]*0.333 + no[2]*0.333 + no[0]*0.333;
  f = f < 0.0 ? -f*0.2 : f;
  
  f = f*0.8 + 0.2;
  
  vec4 c = vec4(f, f, f, 1.0);
  
  c *= texture2D(texture, vUv);
  
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

export let FlatMeshTexture = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;

attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;

varying vec4 vColor;
varying vec2 vUv;

void main() {
  vec4 p = projectionMatrix * vec4(position, 1.0);
  
  gl_Position = p;
  
  vUv = uv;
  vColor = color;
}

  `,

  fragment : `precision mediump float;
uniform float alpha;

varying vec4 vColor;
varying vec2 vUv;

uniform sampler2D texture;

void main() {
  vec4 c = texture2D(texture, vUv) * vColor;
  
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

export let SculptShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;
attribute vec2 primUV;

attribute vec4 primc1;
attribute vec4 primc2;
attribute vec4 primc3;

varying vec4 vColor;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vPrimUV;

varying vec4 vPrimC1;
varying vec4 vPrimC2;
varying vec4 vPrimC3;
${PolygonOffset.pre}

uniform float aspect, near, far;
uniform vec2 size;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  vec4 n = normalMatrix * vec4(normal, 0.0);

  ${PolygonOffset.vertex("p", "near", "far", "size")}
  
  gl_Position = p;
  
  vUv = uv;
  vNormal = n.xyz;
  vColor = color;
  vPrimUV = primUV;
  
  vPrimC1 = primc1;
  vPrimC2 = primc2;
  vPrimC3 = primc3;
}

  `,

  /*
  on factor;

  p1 := u*k1 + v*k2 + (1.0-u-v)*k3;
  p2 := sub(k1=k3, k2=k4, k3=k5, p1);
  p3 := sub(k1=k5, k2=k6, k3=k7, p1);

  w := 1.0-u-v;

  p := a*u*k1 + a*u**2*k2 + a*u**3*k3 +
       b*v*k4 + b*v**2*k5 + b*v**3*k6 +
       c*w*k7 + c*w**2*k8 + c*w**3*k9;

  f1 := sub(u=0, v=0, df(p, u)) = 0;
  f2 := sub(u=1, v=0, df(p, u)) = 0;
  f3 := sub(u=0, v=1, df(p, u)) = 0;
  f4 := sub(u=0, v=0, df(p, v)) = 0;
  f5 := sub(u=1, v=0, df(p, v)) = 0;
  f6 := sub(u=0, v=1, df(p, v)) = 0;
  f7 := sub(u=0, v=0, p) = c;
  f8 := sub(u=1, v=0, p) = a;
  f9 := sub(u=0, v=1, p) = b;

  ff := solve({f1, f2, f3, f4, f5, f6, f7, f8, f9}, {k1, k2, k3, k4, k5, k6, k7, k8, k9});

  fk1 := part(ff, 1, 1, 2);
  fk2 := part(ff, 1, 2, 2);
  fk3 := part(ff, 1, 3, 2);
  fk4 := part(ff, 1, 4, 2);
  fk5 := part(ff, 1, 5, 2);
  fk6 := part(ff, 1, 6, 2);
  fk7 := part(ff, 1, 7, 2);
  fk8 := part(ff, 1, 8, 2);
  fk9 := part(ff, 1, 9, 2);

  fp := sub(k1=fk1, k2=fk2, k3=fk3, k4=fk4, k5=fk5, k6=fk6, k7=fk7, k8=fk8, k9=fk9, p);

  * */
  fragment : `precision mediump float;
uniform float alpha;

varying vec4 vColor;
varying vec3 vNormal;
varying vec2 vUv;

varying vec2 vPrimUV;
varying vec4 vPrimC1;
varying vec4 vPrimC2;
varying vec4 vPrimC3;

uniform sampler2D texture;
uniform float hasTexture;

uniform vec4 uColor;
${PolygonOffset.pre}

uniform float aspect, near, far;
uniform vec2 size;

void main() {
  float f;
  vec3 no = normalize(vNormal);
  
  f = no[1]*0.333 + no[2]*0.333 + no[0]*0.333;
  f = f < 0.0 ? -f*0.5 : f;
  f = f*0.8 + 0.2;
  
  vec3 uvw = vec3(vPrimUV, 1.0-vPrimUV[0]-vPrimUV[1]);
  vec4 vcol;

  vec4 tex = texture2D(texture, vUv);
  tex += (vec4(1.0, 1.0, 1.0, 1.0) - tex) * (1.0 - hasTexture);
  
//make sure to uncomment primc1/c2/c3 layer stuff in pbvh.c
//#define VCOL_PATCH
#ifdef VCOL_PATCH
  {
    vec4 a = vPrimC1;
    vec4 b = vPrimC2;
    vec4 c = vPrimC3;
      
    float u = uvw[0], u2 = u*u, u3 = u*u*u;
    float v = uvw[1], v2=v*v, v3=v*v*v;
    float ac1 = 1.0;
    
    vcol = ((ac1*c-a)*(2.0*u-3.0)*u+ac1*c)*u+
           ((ac1*c-b)*(2.0*v-3.0)*v+ac1*c)*v-(2.0*
           (v-1.0+u)*(v-1.0+u)*(ac1-1.0)+3.0*(v-1.0+u)*(ac1-1.0)+ac1)*(v-1.0+u)*c;
    
    //vcol -= vPrimC1*uvw[0] + vPrimC2*uvw[1] + vPrimC3*uvw[2];
    //vcol = abs(vcol);
    //vcol[3] = 1.0;
  }
#else
  //vcol = vPrimC1*uvw[0] + vPrimC2*uvw[1] + vPrimC3*uvw[2];
  vcol = vColor;
#endif
  //vec4 vcol = vPrimC1*uvw[0] + vPrimC2*uvw[1] + vPrimC3*uvw[2];
  vec4 c = vec4(f, f, f, 1.0)*uColor*vcol;
  
  c[3] *= alpha;

  ${PolygonOffset.fragment}
  
  gl_FragColor = c * tex;
}
  `,

  uniforms : {
    alpha : 1.0,
    hasTexture : 0.0,
    uColor : [1, 1, 1, 1],
    objectMatrix : new Matrix4()
  },

  attributes : [
    "position", "normal", "uv", "color", "primUV", "primc1", "primc2", "primc3"
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

${SmoothLine.pre}

uniform float near, far, aspect;
uniform vec2 size;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p", "near", "far", "size")}
  
  ${SmoothLine.vertex("p")}
  
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
${SmoothLine.fragmentPre}

void main() {
  vec4 c = vColor;
  float alpha2 = alpha;
  
  ${PolygonOffset.fragment}
  ${SmoothLine.fragment("alpha2")};
  
  gl_FragColor = c * vec4(1.0, 1.0, 1.0, alpha2);
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

uniform float aspect, near, far;
uniform vec2 size;

varying float vId;

${PolygonOffset.pre}
${SmoothLine.pre}

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p", "near", "far", "size")}
  ${SmoothLine.vertex("p")}
  
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
${SmoothLine.fragmentPre}

void main() {
  gl_FragColor = vec4(object_id+1.0, vId, 0.0, 1.0);
  ${PolygonOffset.fragment}
  ${SmoothLine.fragment()}
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

uniform float aspect, near, far;
uniform vec2 size;

${PolygonOffset.pre}

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p", "near", "far", "size")}
  
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


export let CellularNoiseFragment = {
  fragment : `
// Cellular noise ("Worley noise") in 3D in GLSL.
// Copyright (c) Stefan Gustavson 2011-04-19. All rights reserved.
// This code is released under the conditions of the MIT license.
// See LICENSE file for details.
// https://github.com/stegu/webgl-noise

// Modulo 289 without a division (only multiplications)
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

// Modulo 7 without a division
vec3 mod7(vec3 x) {
  return x - floor(x * (1.0 / 7.0)) * 7.0;
}

// Permutation polynomial: (34x^2 + x) mod 289
vec3 permute(vec3 x) {
  return mod289((34.0 * x + 1.0) * x);
}

// Cellular noise, returning F1 and F2 in a vec2.
// 3x3x3 search region for good F2 everywhere, but a lot
// slower than the 2x2x2 version.
// The code below is a bit scary even to its author,
// but it has at least half decent performance on a
// modern GPU. In any case, it beats any software
// implementation of Worley noise hands down.

vec2 cellular(vec3 P) {
#define K 0.142857142857 // 1/7
#define Ko 0.428571428571 // 1/2-K/2
#define K2 0.020408163265306 // 1/(7*7)
#define Kz 0.166666666667 // 1/6
#define Kzo 0.416666666667 // 1/2-1/6*2
#define jitter 1.0 // smaller jitter gives more regular pattern

  vec3 Pi = mod289(floor(P));
   vec3 Pf = fract(P) - 0.5;

  vec3 Pfx = Pf.x + vec3(1.0, 0.0, -1.0);
  vec3 Pfy = Pf.y + vec3(1.0, 0.0, -1.0);
  vec3 Pfz = Pf.z + vec3(1.0, 0.0, -1.0);

  vec3 p = permute(Pi.x + vec3(-1.0, 0.0, 1.0));
  vec3 p1 = permute(p + Pi.y - 1.0);
  vec3 p2 = permute(p + Pi.y);
  vec3 p3 = permute(p + Pi.y + 1.0);

  vec3 p11 = permute(p1 + Pi.z - 1.0);
  vec3 p12 = permute(p1 + Pi.z);
  vec3 p13 = permute(p1 + Pi.z + 1.0);

  vec3 p21 = permute(p2 + Pi.z - 1.0);
  vec3 p22 = permute(p2 + Pi.z);
  vec3 p23 = permute(p2 + Pi.z + 1.0);

  vec3 p31 = permute(p3 + Pi.z - 1.0);
  vec3 p32 = permute(p3 + Pi.z);
  vec3 p33 = permute(p3 + Pi.z + 1.0);

  vec3 ox11 = fract(p11*K) - Ko;
  vec3 oy11 = mod7(floor(p11*K))*K - Ko;
  vec3 oz11 = floor(p11*K2)*Kz - Kzo; // p11 < 289 guaranteed

  vec3 ox12 = fract(p12*K) - Ko;
  vec3 oy12 = mod7(floor(p12*K))*K - Ko;
  vec3 oz12 = floor(p12*K2)*Kz - Kzo;

  vec3 ox13 = fract(p13*K) - Ko;
  vec3 oy13 = mod7(floor(p13*K))*K - Ko;
  vec3 oz13 = floor(p13*K2)*Kz - Kzo;

  vec3 ox21 = fract(p21*K) - Ko;
  vec3 oy21 = mod7(floor(p21*K))*K - Ko;
  vec3 oz21 = floor(p21*K2)*Kz - Kzo;

  vec3 ox22 = fract(p22*K) - Ko;
  vec3 oy22 = mod7(floor(p22*K))*K - Ko;
  vec3 oz22 = floor(p22*K2)*Kz - Kzo;

  vec3 ox23 = fract(p23*K) - Ko;
  vec3 oy23 = mod7(floor(p23*K))*K - Ko;
  vec3 oz23 = floor(p23*K2)*Kz - Kzo;

  vec3 ox31 = fract(p31*K) - Ko;
  vec3 oy31 = mod7(floor(p31*K))*K - Ko;
  vec3 oz31 = floor(p31*K2)*Kz - Kzo;

  vec3 ox32 = fract(p32*K) - Ko;
  vec3 oy32 = mod7(floor(p32*K))*K - Ko;
  vec3 oz32 = floor(p32*K2)*Kz - Kzo;

  vec3 ox33 = fract(p33*K) - Ko;
  vec3 oy33 = mod7(floor(p33*K))*K - Ko;
  vec3 oz33 = floor(p33*K2)*Kz - Kzo;

  vec3 dx11 = Pfx + jitter*ox11;
  vec3 dy11 = Pfy.x + jitter*oy11;
  vec3 dz11 = Pfz.x + jitter*oz11;

  vec3 dx12 = Pfx + jitter*ox12;
  vec3 dy12 = Pfy.x + jitter*oy12;
  vec3 dz12 = Pfz.y + jitter*oz12;

  vec3 dx13 = Pfx + jitter*ox13;
  vec3 dy13 = Pfy.x + jitter*oy13;
  vec3 dz13 = Pfz.z + jitter*oz13;

  vec3 dx21 = Pfx + jitter*ox21;
  vec3 dy21 = Pfy.y + jitter*oy21;
  vec3 dz21 = Pfz.x + jitter*oz21;

  vec3 dx22 = Pfx + jitter*ox22;
  vec3 dy22 = Pfy.y + jitter*oy22;
  vec3 dz22 = Pfz.y + jitter*oz22;

  vec3 dx23 = Pfx + jitter*ox23;
  vec3 dy23 = Pfy.y + jitter*oy23;
  vec3 dz23 = Pfz.z + jitter*oz23;

  vec3 dx31 = Pfx + jitter*ox31;
  vec3 dy31 = Pfy.z + jitter*oy31;
  vec3 dz31 = Pfz.x + jitter*oz31;

  vec3 dx32 = Pfx + jitter*ox32;
  vec3 dy32 = Pfy.z + jitter*oy32;
  vec3 dz32 = Pfz.y + jitter*oz32;

  vec3 dx33 = Pfx + jitter*ox33;
  vec3 dy33 = Pfy.z + jitter*oy33;
  vec3 dz33 = Pfz.z + jitter*oz33;

  vec3 d11 = dx11 * dx11 + dy11 * dy11 + dz11 * dz11;
  vec3 d12 = dx12 * dx12 + dy12 * dy12 + dz12 * dz12;
  vec3 d13 = dx13 * dx13 + dy13 * dy13 + dz13 * dz13;
  vec3 d21 = dx21 * dx21 + dy21 * dy21 + dz21 * dz21;
  vec3 d22 = dx22 * dx22 + dy22 * dy22 + dz22 * dz22;
  vec3 d23 = dx23 * dx23 + dy23 * dy23 + dz23 * dz23;
  vec3 d31 = dx31 * dx31 + dy31 * dy31 + dz31 * dz31;
  vec3 d32 = dx32 * dx32 + dy32 * dy32 + dz32 * dz32;
  vec3 d33 = dx33 * dx33 + dy33 * dy33 + dz33 * dz33;

  // Sort out the two smallest distances (F1, F2)
#if 0
  // Cheat and sort out only F1
  vec3 d1 = min(min(d11,d12), d13);
  vec3 d2 = min(min(d21,d22), d23);
  vec3 d3 = min(min(d31,d32), d33);
  vec3 d = min(min(d1,d2), d3);
  d.x = min(min(d.x,d.y),d.z);
  return vec2(sqrt(d.x)); // F1 duplicated, no F2 computed
#else
  // Do it right and sort out both F1 and F2
  vec3 d1a = min(d11, d12);
  d12 = max(d11, d12);
  d11 = min(d1a, d13); // Smallest now not in d12 or d13
  d13 = max(d1a, d13);
  d12 = min(d12, d13); // 2nd smallest now not in d13
  vec3 d2a = min(d21, d22);
  d22 = max(d21, d22);
  d21 = min(d2a, d23); // Smallest now not in d22 or d23
  d23 = max(d2a, d23);
  d22 = min(d22, d23); // 2nd smallest now not in d23
  vec3 d3a = min(d31, d32);
  d32 = max(d31, d32);
  d31 = min(d3a, d33); // Smallest now not in d32 or d33
  d33 = max(d3a, d33);
  d32 = min(d32, d33); // 2nd smallest now not in d33
  vec3 da = min(d11, d21);
  d21 = max(d11, d21);
  d11 = min(da, d31); // Smallest now in d11
  d31 = max(da, d31); // 2nd smallest now not in d31
  d11.xy = (d11.x < d11.y) ? d11.xy : d11.yx;
  d11.xz = (d11.x < d11.z) ? d11.xz : d11.zx; // d11.x now smallest
  d12 = min(d12, d21); // 2nd smallest now not in d21
  d12 = min(d12, d22); // nor in d22
  d12 = min(d12, d31); // nor in d31
  d12 = min(d12, d32); // nor in d32
  d11.yz = min(d11.yz,d12.xy); // nor in d12.yz
  d11.y = min(d11.y,d12.z); // Only two more to go
  d11.y = min(d11.y,d11.z); // Done! (Phew!)
  return sqrt(d11.xy); // F1, F2
#endif
}
`
};

export let SimplexGradientNoise = {
  fragment : `
//
// Description : Array and textureless GLSL 2D/3D/4D simplex 
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
// 

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v, out vec3 gradient)
{
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdotx = vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3));

// Determine noise gradient
  vec4 temp = m2 * m * pdotx;
  gradient = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gradient += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  gradient *= 105.0;

  return 105.0 * dot(m4, pdotx)*0.5 + 0.5;
}
  `
}
export let TexturePaintShader = {
  vertex : `precision mediump float;
  
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;
attribute vec4 sm_loc;
attribute vec2 sm_params;

uniform vec4 uColor;
//uniform float pointSize;

uniform mat4 projectionMatrix;

//uniform float aspect, near, far;
//uniform vec2 size;

varying vec2 vUv;
varying vec4 vColor;
varying vec3 vNormal;
varying vec2 vParams;

//{PolygonOffset.pre}
//{BRUSH_TEX_PRE}

void main() {
  vec4 p = vec4(position, 1.0);
  //{PolygonOffset.vertex("p", "near", "far", "size")}
  
  p = projectionMatrix * p;
  
  vColor = vec4((sm_loc.xyz*sm_loc.w), sm_loc.w);
  vUv = uv;
  vNormal = normal;
   
  vParams = sm_params;
  
  gl_Position = p;
  //gl_PointSize = pointSize;
}
`,
  fragment : `precision mediump float;
uniform vec4 uColor;

varying vec2 vUv;
varying vec4 vColor;
varying vec3 vNormal;
varying vec2 vParams;

uniform float radius;
uniform vec3 brushCo;
uniform float angle;

//{PolygonOffset.pre}

vec2 rot2d(vec2 p, float th) {
  return vec2(cos(th)*p[0] + sin(th)*p[1], cos(th)*p[1] - sin(th)*p[0]);
}

//{CellularNoiseFragment.fragment}
${SimplexGradientNoise.fragment}

void main() {
  //{PolygonOffset.fragment}
  vec4 c;
  
  c = vColor;
  c = vec4(0.0, 0.0, 0.0, 1.0);
  
  float dis = length(brushCo.xy - vColor.xy/vColor.w) / radius;
  dis = 1.0 - min(max(dis, 0.0), 1.0);
  
  c = uColor;
  
  //normal fade
  float fade = vParams[0];
  
  c[3] *= dis*fade;
  
#if 0
  vec2 cell = cellular(0.1*vColor.xyz/vColor.w);
  c[3] *= cell[0];
  c.rgb *= cell[1];
#endif
  
#ifdef BRUSH_TEX
{
  float inP = vColor.xyz/vColor.w;
  vec4 outC;

{  
  BRUSH_TEX
}
 
  c *= outC;
}
#endif

#if 0
{
  vec3 p = vColor.xyz/vColor.w*0.0875;
  vec2 p2 = rot2d(p.xy, angle);
  
  float dx1 = 1.0 - abs(fract(p2.x)-0.5)*2.0;
  float dy1 = 1.0 - abs(fract(p2.y)-0.5)*2.0;
  float dx2 = 1.0 - abs(fract(p.x)-0.5)*2.0;
  float dy2 = 1.0 - abs(fract(p.y)-0.5)*2.0;
 
  
  //float f = pow(dx1*dy1*dx2*dy2, 1.0/4.0);
  float f = (dx1+dx2+dy1+dy2)*0.25;
  
  f = cos(f*13.11432)*0.5 + 0.5;
  
  c.rgb *= f;
  //c[3] *= f;
} 
#endif

#if 0
{
  vec3 p = vColor.xyz/vColor.w*0.045;
  vec3 grad;
  
  float f = snoise(p, grad);
  
  for (int i=0; i<3; i++) {
    p *= 2.3;
    f *= snoise(p, grad);
  }
  
  f = pow(f, 1.0 / 4.0);
  
  //p += -grad*0.1;
  //p += vec3(grad.y, -grad.x, 0.0)*0.15;
  //f = snoise(p, grad)*0.5 + 0.5;
  
  //c[3] *= f;
  c.rgb *= f;
}
#endif
  //c[1] = fract(brushCo.x*0.01);
  //c[2] = fract(brushCo.y*0.01);
  
  //c[3] = 1.0 - min(max(c[0], 0.0), 1.0);
  
  gl_FragColor = c;
}
  `,

  uniforms : {
    pointSize : 10.0,
    objectMatrix : new Matrix4(),
    projectionMatrix: new Matrix4(),
    color : [0, 0, 0, 1]
  },

  attributes : [
    "position", "color", "uv", "normal", "sm_loc", "sm_params"
  ]
};
export let LineTriStripShader = {
  vertex : `precision mediump float;
  
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 _strip_dir;
attribute vec2 _strip_uv;

uniform vec4 color;
uniform float pointSize;

uniform float aspect, near, far;
uniform vec2 size;

varying vec2 vStripUv;
varying vec4 vColor;

${PolygonOffset.pre}

void main() {
  float width = _strip_dir[3];

  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p", "near", "far", "size")}
  
  {
    vec4 dir = objectMatrix * vec4(_strip_dir.xyz, 0.0);
    dir = projectionMatrix * dir;
    dir = normalize(dir);
    
    p.xyz /= p.w;
    
    float s = width/size[1];
    
    p[0] += dir[1]*_strip_uv[0]*s;
    p[1] += -dir[0]*_strip_uv[0]*s;
    p.xyz *= p.w;
    
    vStripUv = vec2(_strip_uv[0], width);
  }
  
  vColor = color;
  
  gl_Position = p;
  gl_PointSize = pointSize;
}
`,
  fragment : `precision mediump float;
uniform vec4 color;

varying vec2 vStripUv;
varying vec4 vColor;

${PolygonOffset.pre}

void main() {
  ${PolygonOffset.fragment}
   
  float f = abs(vStripUv[0]);
  float t = vStripUv[1] - 1.5;
  
  f *= vStripUv[1];
  f = f > t ? 1.0 - (f - t) / (vStripUv[1] - t) : 1.0;
  
  //gl_FragColor = vec4(f, f, f, f);
  gl_FragColor = color*vColor*vec4(1.0, 1.0, 1.0, f);
}
  `,

  uniforms : {
    pointSize : 10.0,
    objectMatrix : new Matrix4(),
    color : [0, 0, 0, 1]
  },

  attributes : [
    "position", "color", "id", "_strip_uv", "_strip_dir"
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
  BasicLitMeshTexture  : BasicLitMeshTexture,
  MeshEditShader       : MeshEditShader,
  MeshIDShader         : MeshIDShader,
  WidgetMeshShader     : WidgetMeshShader,
  NormalPassShader     : NormalPassShader,
  MeshLinearZShader    : MeshLinearZShader,
  SculptShader         : SculptShader,
  LineTriStripShader   : LineTriStripShader,
  TexturePaintShader   : TexturePaintShader,
  FlatMeshTexture      : FlatMeshTexture
};

export let Shaders = {
};

//global for debugging purposes only
window._Shaders = Shaders;

export function loadShader(gl, sdef) {
  let shader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);

  shader.init(gl);

  for (let k in sdef.uniforms) {
    shader.uniforms[k] = sdef.uniforms[k];
  }

  return shader;
}
