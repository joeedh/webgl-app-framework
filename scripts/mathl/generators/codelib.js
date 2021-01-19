export const CodeLib = `
vec2 add_v2_fl(vec2 a, float f) {
  return vec2(a[0]+f, a[1]+f);
}
vec2 sub_v2_fl(vec2 a, float f) {
  return vec2(a[0]-f, a[1]-f);
}
vec2 mul_v2_fl(vec2 a, float f) {
  return vec2(a[0]*f, a[1]*f);
}
vec2 div_v2_fl(vec2 a, float f) {
  return vec2(a[0]/f, a[1]/f);
}

vec3 add_v3_fl(vec3 a, float f) {
  return vec3(a[0]+f, a[1]+f, a[2]+f);
}
vec3 sub_v3_fl(vec3 a, float f) {
  return vec3(a[0]-f, a[1]-f, a[2]-f);
}
vec3 mul_v3_fl(vec3 a, float f) {
  return vec3(a[0]*f, a[1]*f, a[2]*f);
}
vec3 div_v3_fl(vec3 a, float f) {
  return vec3(a[0]/f, a[1]/f, a[2]/f);
}

vec2 add_v2_v2(vec2 a, vec2 b) {
  return vec2(a[0]+b[0], a[1]+b[1]);
}
vec2 sub_v2_v2(vec2 a, vec2 b) {
  return vec2(a[0]-b[0], a[1]-b[1]);
}
vec2 mul_v2_v2(vec2 a, vec2 b) {
  return vec2(a[0]*b[0], a[1]*b[1]);
}
vec2 div_v2_v2(vec2 a, vec2 b) {
  return vec2(a[0]/b[0], a[1]/b[1]);
}

vec3 add_v3_v3(vec3 a, vec3 b) {
  return vec3(a[0]+b[0], a[1]+b[1], a[2]+b[2]);
}
vec3 sub_v3_v3(vec3 a, vec3 b) {
  return vec3(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
}
vec3 mul_v3_v3(vec3 a, vec3 b) {
  return vec3(a[0]*b[0], a[1]*b[1], a[2]*b[2]);
}
vec3 div_v3_v3(vec3 a, vec3 b) {
  return vec3(a[0]/b[0], a[1]/b[1], a[2]/b[2]);
}

vec4 add_v4_v4(vec4 a, vec4 b) {
  return vec4(a[0]+b[0], a[1]+b[1], a[2]+b[2], a[3]+b[3]);
}
vec4 sub_v4_v4(vec4 a, vec4 b) {
  return vec4(a[0]-b[0], a[1]-b[1], a[2]-b[2], a[3]-b[3]);
}
vec4 mul_v4_v4(vec4 a, vec4 b) {
  return vec4(a[0]*b[0], a[1]*b[1], a[2]*b[2], a[3]*b[3]);
}
vec4 div_v4_v4(vec4 a, vec4 b) {
  return vec4(a[0]/b[0], a[1]/b[1], a[2]/b[2], a[3]/b[3]);
}
  
`;
