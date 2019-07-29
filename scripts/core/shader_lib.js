export let ShaderFragments = {
  SHADERLIB : `

Closure vec3toclosure(vec3 c) {
  Closure ret;
  
  ret.alpha = 1.0;
  ret.emission = c;
  
  return ret;
}

Closure floattoclosure(float c) {
  Closure ret;
  
  ret.alpha = 1.0;
  ret.emission = vec3(c, c, c);
  
  return ret;
}

`
};