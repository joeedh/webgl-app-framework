let fract = function(f) { return f - Math.floor(f);};
  let abs = Math.abs, sin = Math.sin, cos = Math.cos, log = Math.log, pow = Math.pow;
  let acos = Math.acos, asin = Math.asin, atan = Math.atan, atan2 = Math.atan2;
  let sqrt = Math.sqrt, exp = Math.exp, min = Math.min, max = Math.max, floor = Math.floor;
  let ceil = Math.ceil;

  function cachering(func, count) {
    this.list = new Array(count);
    this.length = count;
    
    for (let i=0; i<this.length; i++) {
      this.list[i] = func();
    }
    
    this.cur = 0;
  }
  
  cachering.prototype = Object.create(Object.prototype);
  cachering.prototype.next = function() {
      let ret = this.list[this.cur];
      
      this.cur = (this.cur + 1) % this.length;
      return ret;
  };
  cachering.prototype.push = function() {
    return this[this.cur++];
  };
  cachering.prototype.pop = function() {
    return [this.cur--];
  };
  
  let vec2cache = new cachering(() => [0, 0], 2048);
  
  let vec3cache = new cachering(() => [0, 0, 0], 2048);
  let vec4cache = new cachering(() => [0, 0, 0, 0], 2048);
  let mat3cache = new cachering(() => [[0,0,0], [0,0,0], [0,0,0]], 2048);
  let mat4cache = new cachering(() => [[0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]], 2048);

  let vec2stack = new cachering(() => [0, 0], 128);
  let vec3stack = new cachering(() => [0, 0, 0], 128);
  let vec4stack = new cachering(() => [0, 0, 0, 0], 128);
  let mat3stack = new cachering(() => [[0,0,0], [0,0,0], [0,0,0]], 128);
  let mat4stack = new cachering(() => [[0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]], 128);
    

    
    program = function() {
  let __outs;
  let point, normal;

  let factor = 0;
  function __setfactor(val) {
    factor = val;
  }

  let size = 0;
  function __setsize(val) {
    size = val;
  }

  let uColor = 0;
  function __setuColor(val) {
    uColor = val;
  }


  function _$_cos_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = cos(a[0]);
    r[1] = cos(a[1]);
            return r;
  }

  function _$_cos_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = cos(a[0]);
    r[1] = cos(a[1]);
    r[2] = cos(a[2]);
            return r;
  }

  function _$_cos_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = cos(a[0]);
    r[1] = cos(a[1]);
    r[2] = cos(a[2]);
    r[3] = cos(a[3]);
            return r;
  }

  function _$_sin_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = sin(a[0]);
    r[1] = sin(a[1]);
            return r;
  }

  function _$_sin_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = sin(a[0]);
    r[1] = sin(a[1]);
    r[2] = sin(a[2]);
            return r;
  }

  function _$_sin_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = sin(a[0]);
    r[1] = sin(a[1]);
    r[2] = sin(a[2]);
    r[3] = sin(a[3]);
            return r;
  }

  function _$_sqrt_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = sqrt(a[0]);
    r[1] = sqrt(a[1]);
            return r;
  }

  function _$_sqrt_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = sqrt(a[0]);
    r[1] = sqrt(a[1]);
    r[2] = sqrt(a[2]);
            return r;
  }

  function _$_sqrt_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = sqrt(a[0]);
    r[1] = sqrt(a[1]);
    r[2] = sqrt(a[2]);
    r[3] = sqrt(a[3]);
            return r;
  }

  function _$_exp_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = exp(a[0]);
    r[1] = exp(a[1]);
            return r;
  }

  function _$_exp_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = exp(a[0]);
    r[1] = exp(a[1]);
    r[2] = exp(a[2]);
            return r;
  }

  function _$_exp_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = exp(a[0]);
    r[1] = exp(a[1]);
    r[2] = exp(a[2]);
    r[3] = exp(a[3]);
            return r;
  }

  function _$_log_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = log(a[0]);
    r[1] = log(a[1]);
            return r;
  }

  function _$_log_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = log(a[0]);
    r[1] = log(a[1]);
    r[2] = log(a[2]);
            return r;
  }

  function _$_log_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = log(a[0]);
    r[1] = log(a[1]);
    r[2] = log(a[2]);
    r[3] = log(a[3]);
            return r;
  }

  function _$_floor_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = floor(a[0]);
    r[1] = floor(a[1]);
            return r;
  }

  function _$_floor_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = floor(a[0]);
    r[1] = floor(a[1]);
    r[2] = floor(a[2]);
            return r;
  }

  function _$_floor_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = floor(a[0]);
    r[1] = floor(a[1]);
    r[2] = floor(a[2]);
    r[3] = floor(a[3]);
            return r;
  }

  function _$_ceil_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = ceil(a[0]);
    r[1] = ceil(a[1]);
            return r;
  }

  function _$_ceil_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = ceil(a[0]);
    r[1] = ceil(a[1]);
    r[2] = ceil(a[2]);
            return r;
  }

  function _$_ceil_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = ceil(a[0]);
    r[1] = ceil(a[1]);
    r[2] = ceil(a[2]);
    r[3] = ceil(a[3]);
            return r;
  }

  function _$_abs_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = abs(a[0]);
    r[1] = abs(a[1]);
            return r;
  }

  function _$_abs_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = abs(a[0]);
    r[1] = abs(a[1]);
    r[2] = abs(a[2]);
            return r;
  }

  function _$_abs_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = abs(a[0]);
    r[1] = abs(a[1]);
    r[2] = abs(a[2]);
    r[3] = abs(a[3]);
            return r;
  }

  function _$_min_vec2_vec2vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = min(a[0], b[0]);
    r[1] = min(a[1], b[1]);
            return r;
  }

  function _$_min_vec3_vec3vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = min(a[0], b[0]);
    r[1] = min(a[1], b[1]);
    r[2] = min(a[2], b[2]);
            return r;
  }

  function _$_min_vec4_vec4vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = min(a[0], b[0]);
    r[1] = min(a[1], b[1]);
    r[2] = min(a[2], b[2]);
    r[3] = min(a[3], b[3]);
            return r;
  }

  function _$_max_vec2_vec2vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = max(a[0], b[0]);
    r[1] = max(a[1], b[1]);
            return r;
  }

  function _$_max_vec3_vec3vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = max(a[0], b[0]);
    r[1] = max(a[1], b[1]);
    r[2] = max(a[2], b[2]);
            return r;
  }

  function _$_max_vec4_vec4vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = max(a[0], b[0]);
    r[1] = max(a[1], b[1]);
    r[2] = max(a[2], b[2]);
    r[3] = max(a[3], b[3]);
            return r;
  }

  function _$_acos_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = acos(a[0]);
    r[1] = acos(a[1]);
            return r;
  }

  function _$_acos_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = acos(a[0]);
    r[1] = acos(a[1]);
    r[2] = acos(a[2]);
            return r;
  }

  function _$_acos_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = acos(a[0]);
    r[1] = acos(a[1]);
    r[2] = acos(a[2]);
    r[3] = acos(a[3]);
            return r;
  }

  function _$_asin_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = asin(a[0]);
    r[1] = asin(a[1]);
            return r;
  }

  function _$_asin_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = asin(a[0]);
    r[1] = asin(a[1]);
    r[2] = asin(a[2]);
            return r;
  }

  function _$_asin_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = asin(a[0]);
    r[1] = asin(a[1]);
    r[2] = asin(a[2]);
    r[3] = asin(a[3]);
            return r;
  }

  function _$_atan_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = atan(a[0]);
    r[1] = atan(a[1]);
            return r;
  }

  function _$_atan_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = atan(a[0]);
    r[1] = atan(a[1]);
    r[2] = atan(a[2]);
            return r;
  }

  function _$_atan_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = atan(a[0]);
    r[1] = atan(a[1]);
    r[2] = atan(a[2]);
    r[3] = atan(a[3]);
            return r;
  }

  function _$_fract_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = fract(a[0]);
    r[1] = fract(a[1]);
            return r;
  }

  function _$_fract_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = fract(a[0]);
    r[1] = fract(a[1]);
    r[2] = fract(a[2]);
            return r;
  }

  function _$_fract_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = fract(a[0]);
    r[1] = fract(a[1]);
    r[2] = fract(a[2]);
    r[3] = fract(a[3]);
            return r;
  }

  function _$_pow_vec2_vec2vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = pow(a[0], b[0]);
    r[1] = pow(a[1], b[1]);
            return r;
  }

  function _$_pow_vec2_floatvec2(a, b) {
        let r = vec2cache.next();;
    r[0] = pow(a, b[0]);
    r[1] = pow(a, b[1]);
            return r;
  }

  function _$_pow_vec2_vec2float(a, b) {
        let r = vec2cache.next();;
    r[0] = pow(a[0], b);
    r[1] = pow(a[1], b);
            return r;
  }

  function _$_step_vec2_vec2vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = step(a[0], b[0]);
    r[1] = step(a[1], b[1]);
            return r;
  }

  function _$_step_vec2_floatvec2(a, b) {
        let r = vec2cache.next();;
    r[0] = step(a, b[0]);
    r[1] = step(a, b[1]);
            return r;
  }

  function _$_step_vec2_vec2float(a, b) {
        let r = vec2cache.next();;
    r[0] = step(a[0], b);
    r[1] = step(a[1], b);
            return r;
  }

  function _$_pow_vec3_vec3vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = pow(a[0], b[0]);
    r[1] = pow(a[1], b[1]);
    r[2] = pow(a[2], b[2]);
            return r;
  }

  function _$_pow_vec3_floatvec3(a, b) {
        let r = vec3cache.next();;
    r[0] = pow(a, b[0]);
    r[1] = pow(a, b[1]);
    r[2] = pow(a, b[2]);
            return r;
  }

  function _$_pow_vec3_vec3float(a, b) {
        let r = vec3cache.next();;
    r[0] = pow(a[0], b);
    r[1] = pow(a[1], b);
    r[2] = pow(a[2], b);
            return r;
  }

  function _$_step_vec3_vec3vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = step(a[0], b[0]);
    r[1] = step(a[1], b[1]);
    r[2] = step(a[2], b[2]);
            return r;
  }

  function _$_step_vec3_floatvec3(a, b) {
        let r = vec3cache.next();;
    r[0] = step(a, b[0]);
    r[1] = step(a, b[1]);
    r[2] = step(a, b[2]);
            return r;
  }

  function _$_step_vec3_vec3float(a, b) {
        let r = vec3cache.next();;
    r[0] = step(a[0], b);
    r[1] = step(a[1], b);
    r[2] = step(a[2], b);
            return r;
  }

  function _$_pow_vec4_vec4vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = pow(a[0], b[0]);
    r[1] = pow(a[1], b[1]);
    r[2] = pow(a[2], b[2]);
    r[3] = pow(a[3], b[3]);
            return r;
  }

  function _$_pow_vec4_floatvec4(a, b) {
        let r = vec4cache.next();;
    r[0] = pow(a, b[0]);
    r[1] = pow(a, b[1]);
    r[2] = pow(a, b[2]);
    r[3] = pow(a, b[3]);
            return r;
  }

  function _$_pow_vec4_vec4float(a, b) {
        let r = vec4cache.next();;
    r[0] = pow(a[0], b);
    r[1] = pow(a[1], b);
    r[2] = pow(a[2], b);
    r[3] = pow(a[3], b);
            return r;
  }

  function _$_step_vec4_vec4vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = step(a[0], b[0]);
    r[1] = step(a[1], b[1]);
    r[2] = step(a[2], b[2]);
    r[3] = step(a[3], b[3]);
            return r;
  }

  function _$_step_vec4_floatvec4(a, b) {
        let r = vec4cache.next();;
    r[0] = step(a, b[0]);
    r[1] = step(a, b[1]);
    r[2] = step(a, b[2]);
    r[3] = step(a, b[3]);
            return r;
  }

  function _$_step_vec4_vec4float(a, b) {
        let r = vec4cache.next();;
    r[0] = step(a[0], b);
    r[1] = step(a[1], b);
    r[2] = step(a[2], b);
    r[3] = step(a[3], b);
            return r;
  }

  function _$_$_mul_vec2_vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = a[0] * b[0];
    r[1] = a[1] * b[1];
            return r;
  }

  function _$_$_div_vec2_vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = a[0] / b[0];
    r[1] = a[1] / b[1];
            return r;
  }

  function _$_$_sub_vec2_vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = a[0] - b[0];
    r[1] = a[1] - b[1];
            return r;
  }

  function _$_$_add_vec2_vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = a[0] + b[0];
    r[1] = a[1] + b[1];
            return r;
  }

  function _$_$_mul_vec2_float(a, b) {
        let r = vec2cache.next();;
    r[0] = a[0] * b;
    r[1] = a[1] * b;
            return r;
  }

  function _$_$_mul_float_vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = a * b[0];
    r[1] = a * b[1];
            return r;
  }

  function _$_$_div_vec2_float(a, b) {
        let r = vec2cache.next();;
    r[0] = a[0] / b;
    r[1] = a[1] / b;
            return r;
  }

  function _$_$_div_float_vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = a / b[0];
    r[1] = a / b[1];
            return r;
  }

  function _$_$_sub_vec2_float(a, b) {
        let r = vec2cache.next();;
    r[0] = a[0] - b;
    r[1] = a[1] - b;
            return r;
  }

  function _$_$_sub_float_vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = a - b[0];
    r[1] = a - b[1];
            return r;
  }

  function _$_$_add_vec2_float(a, b) {
        let r = vec2cache.next();;
    r[0] = a[0] + b;
    r[1] = a[1] + b;
            return r;
  }

  function _$_$_add_float_vec2(a, b) {
        let r = vec2cache.next();;
    r[0] = a + b[0];
    r[1] = a + b[1];
            return r;
  }

  function _$_$_mul_vec3_vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0] * b[0];
    r[1] = a[1] * b[1];
    r[2] = a[2] * b[2];
            return r;
  }

  function _$_$_div_vec3_vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0] / b[0];
    r[1] = a[1] / b[1];
    r[2] = a[2] / b[2];
            return r;
  }

  function _$_$_sub_vec3_vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0] - b[0];
    r[1] = a[1] - b[1];
    r[2] = a[2] - b[2];
            return r;
  }

  function _$_$_add_vec3_vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0] + b[0];
    r[1] = a[1] + b[1];
    r[2] = a[2] + b[2];
            return r;
  }

  function _$_$_mul_vec3_float(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0] * b;
    r[1] = a[1] * b;
    r[2] = a[2] * b;
            return r;
  }

  function _$_$_mul_float_vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = a * b[0];
    r[1] = a * b[1];
    r[2] = a * b[2];
            return r;
  }

  function _$_$_div_vec3_float(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0] / b;
    r[1] = a[1] / b;
    r[2] = a[2] / b;
            return r;
  }

  function _$_$_div_float_vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = a / b[0];
    r[1] = a / b[1];
    r[2] = a / b[2];
            return r;
  }

  function _$_$_sub_vec3_float(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0] - b;
    r[1] = a[1] - b;
    r[2] = a[2] - b;
            return r;
  }

  function _$_$_sub_float_vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = a - b[0];
    r[1] = a - b[1];
    r[2] = a - b[2];
            return r;
  }

  function _$_$_add_vec3_float(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0] + b;
    r[1] = a[1] + b;
    r[2] = a[2] + b;
            return r;
  }

  function _$_$_add_float_vec3(a, b) {
        let r = vec3cache.next();;
    r[0] = a + b[0];
    r[1] = a + b[1];
    r[2] = a + b[2];
            return r;
  }

  function _$_$_mul_vec4_vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0] * b[0];
    r[1] = a[1] * b[1];
    r[2] = a[2] * b[2];
    r[3] = a[3] * b[3];
            return r;
  }

  function _$_$_div_vec4_vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0] / b[0];
    r[1] = a[1] / b[1];
    r[2] = a[2] / b[2];
    r[3] = a[3] / b[3];
            return r;
  }

  function _$_$_sub_vec4_vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0] - b[0];
    r[1] = a[1] - b[1];
    r[2] = a[2] - b[2];
    r[3] = a[3] - b[3];
            return r;
  }

  function _$_$_add_vec4_vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0] + b[0];
    r[1] = a[1] + b[1];
    r[2] = a[2] + b[2];
    r[3] = a[3] + b[3];
            return r;
  }

  function _$_$_mul_vec4_float(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0] * b;
    r[1] = a[1] * b;
    r[2] = a[2] * b;
    r[3] = a[3] * b;
            return r;
  }

  function _$_$_mul_float_vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = a * b[0];
    r[1] = a * b[1];
    r[2] = a * b[2];
    r[3] = a * b[3];
            return r;
  }

  function _$_$_div_vec4_float(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0] / b;
    r[1] = a[1] / b;
    r[2] = a[2] / b;
    r[3] = a[3] / b;
            return r;
  }

  function _$_$_div_float_vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = a / b[0];
    r[1] = a / b[1];
    r[2] = a / b[2];
    r[3] = a / b[3];
            return r;
  }

  function _$_$_sub_vec4_float(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0] - b;
    r[1] = a[1] - b;
    r[2] = a[2] - b;
    r[3] = a[3] - b;
            return r;
  }

  function _$_$_sub_float_vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = a - b[0];
    r[1] = a - b[1];
    r[2] = a - b[2];
    r[3] = a - b[3];
            return r;
  }

  function _$_$_add_vec4_float(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0] + b;
    r[1] = a[1] + b;
    r[2] = a[2] + b;
    r[3] = a[3] + b;
            return r;
  }

  function _$_$_add_float_vec4(a, b) {
        let r = vec4cache.next();;
    r[0] = a + b[0];
    r[1] = a + b[1];
    r[2] = a + b[2];
    r[3] = a + b[3];
            return r;
  }

  function _$_float_float_float(a) {
        let r;
    r[0] = a;
            return r;
  }

  function _$_vec2_vec2_floatfloat(a, b) {
        let r = vec2cache.next();;
    r[0] = a;
    r[1] = b;
            return r;
  }

  function _$_vec2_vec2_vec2(a) {
        let r = vec2cache.next();;
    r[0] = a[0];
    r[1] = a[1];
            return r;
  }

  function _$_vec3_vec3_floatfloatfloat(a, b, c) {
        let r = vec3cache.next();;
    r[0] = a;
    r[1] = b;
    r[2] = c;
            return r;
  }

  function _$_vec3_vec3_floatvec2(a, b) {
        let r = vec3cache.next();;
    r[0] = a;
    r[1] = b[0];
    r[2] = b[1];
            return r;
  }

  function _$_vec3_vec3_vec2float(a, b) {
        let r = vec3cache.next();;
    r[0] = a[0];
    r[1] = a[1];
    r[2] = b;
            return r;
  }

  function _$_vec3_vec3_vec3(a) {
        let r = vec3cache.next();;
    r[0] = a[0];
    r[1] = a[1];
    r[2] = a[2];
            return r;
  }

  function _$_vec4_vec4_floatfloatfloatfloat(a, b, c, d) {
        let r = vec4cache.next();;
    r[0] = a;
    r[1] = b;
    r[2] = c;
    r[3] = d;
            return r;
  }

  function _$_vec4_vec4_floatfloatvec2(a, b, c) {
        let r = vec4cache.next();;
    r[0] = a;
    r[1] = b;
    r[2] = c[0];
    r[3] = c[1];
            return r;
  }

  function _$_vec4_vec4_floatvec2float(a, b, c) {
        let r = vec4cache.next();;
    r[0] = a;
    r[1] = b[0];
    r[2] = b[1];
    r[3] = c;
            return r;
  }

  function _$_vec4_vec4_floatvec3(a, b) {
        let r = vec4cache.next();;
    r[0] = a;
    r[1] = b[0];
    r[2] = b[1];
    r[3] = b[2];
            return r;
  }

  function _$_vec4_vec4_vec2floatfloat(a, b, c) {
        let r = vec4cache.next();;
    r[0] = a[0];
    r[1] = a[1];
    r[2] = b;
    r[3] = c;
            return r;
  }

  function _$_vec4_vec4_vec2vec2(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0];
    r[1] = a[1];
    r[2] = b[0];
    r[3] = b[1];
            return r;
  }

  function _$_vec4_vec4_vec3float(a, b) {
        let r = vec4cache.next();;
    r[0] = a[0];
    r[1] = a[1];
    r[2] = a[2];
    r[3] = b;
            return r;
  }

  function _$_vec4_vec4_vec4(a) {
        let r = vec4cache.next();;
    r[0] = a[0];
    r[1] = a[1];
    r[2] = a[2];
    r[3] = a[3];
            return r;
  }

  function _$_$_mul_mat4_vec4(m, v) {
        let r = vec4cache.next();;
    r[0] = m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2] + m[3][0] * v[3];
    r[1] = m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2] + m[3][1] * v[3];
    r[2] = m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2] + m[3][2] * v[3];
    r[3] = m[0][3] * v[0] + m[1][3] * v[1] + m[2][3] * v[2] + m[3][3] * v[3];
            return r;
  }

  function _$_mod289_vec3_vec3(x) {
            return _$_$_sub_vec3_vec3(x, _$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(x, 1.0000000 / 289.0000000)), 289.0000000));
  }

  function _$_mod7_vec3_vec3(x) {
            return _$_$_sub_vec3_vec3(x, _$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(x, 1.0000000 / 7.0000000)), 7.0000000));
  }

  function _$_permute_vec3_vec3(x) {
            return _$_mod289_vec3_vec3(_$_$_mul_vec3_vec3(_$_$_add_vec3_float(_$_$_mul_float_vec3(34.0000000, x), 1.0000000), x));
  }

  function _$_cellular_vec2_vec3(P) {
        let Pi = _$_mod289_vec3_vec3(_$_floor_vec3_vec3(P));
        let Pf = _$_$_sub_vec3_float(_$_fract_vec3_vec3(P), 0.5000000);
        let Pfx = _$_$_add_float_vec3(Pf[0], _$_vec3_vec3_floatfloatfloat(1.0000000, 0.0000000, 1.0000000));
        let Pfy = _$_$_add_float_vec3(Pf[1], _$_vec3_vec3_floatfloatfloat(1.0000000, 0.0000000, 1.0000000));
        let Pfz = _$_$_add_float_vec3(Pf[2], _$_vec3_vec3_floatfloatfloat(1.0000000, 0.0000000, 1.0000000));
        let p = _$_permute_vec3_vec3(_$_$_add_float_vec3(Pi[0], _$_vec3_vec3_floatfloatfloat(1.0000000, 0.0000000, 1.0000000)));
        let p1 = _$_permute_vec3_vec3(_$_$_sub_vec3_float(_$_$_add_vec3_float(p, Pi[1]), 1.0000000));
        let p2 = _$_permute_vec3_vec3(_$_$_add_vec3_float(p, Pi[1]));
        let p3 = _$_permute_vec3_vec3(_$_$_add_vec3_float(_$_$_add_vec3_float(p, Pi[1]), 1.0000000));
        let p11 = _$_permute_vec3_vec3(_$_$_sub_vec3_float(_$_$_add_vec3_float(p1, Pi[2]), 1.0000000));
        let p12 = _$_permute_vec3_vec3(_$_$_add_vec3_float(p1, Pi[2]));
        let p13 = _$_permute_vec3_vec3(_$_$_add_vec3_float(_$_$_add_vec3_float(p1, Pi[2]), 1.0000000));
        let p21 = _$_permute_vec3_vec3(_$_$_sub_vec3_float(_$_$_add_vec3_float(p2, Pi[2]), 1.0000000));
        let p22 = _$_permute_vec3_vec3(_$_$_add_vec3_float(p2, Pi[2]));
        let p23 = _$_permute_vec3_vec3(_$_$_add_vec3_float(_$_$_add_vec3_float(p2, Pi[2]), 1.0000000));
        let p31 = _$_permute_vec3_vec3(_$_$_sub_vec3_float(_$_$_add_vec3_float(p3, Pi[2]), 1.0000000));
        let p32 = _$_permute_vec3_vec3(_$_$_add_vec3_float(p3, Pi[2]));
        let p33 = _$_permute_vec3_vec3(_$_$_add_vec3_float(_$_$_add_vec3_float(p3, Pi[2]), 1.0000000));
        let ox11 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p11, 0.1428571)), 0.4285714);
        let oy11 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p11, 0.1428571))), 0.1428571), 0.4285714);
        let oz11 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p11, 0.0204082)), 0.1666667), 0.4166667);
        let ox12 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p12, 0.1428571)), 0.4285714);
        let oy12 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p12, 0.1428571))), 0.1428571), 0.4285714);
        let oz12 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p12, 0.0204082)), 0.1666667), 0.4166667);
        let ox13 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p13, 0.1428571)), 0.4285714);
        let oy13 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p13, 0.1428571))), 0.1428571), 0.4285714);
        let oz13 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p13, 0.0204082)), 0.1666667), 0.4166667);
        let ox21 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p21, 0.1428571)), 0.4285714);
        let oy21 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p21, 0.1428571))), 0.1428571), 0.4285714);
        let oz21 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p21, 0.0204082)), 0.1666667), 0.4166667);
        let ox22 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p22, 0.1428571)), 0.4285714);
        let oy22 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p22, 0.1428571))), 0.1428571), 0.4285714);
        let oz22 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p22, 0.0204082)), 0.1666667), 0.4166667);
        let ox23 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p23, 0.1428571)), 0.4285714);
        let oy23 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p23, 0.1428571))), 0.1428571), 0.4285714);
        let oz23 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p23, 0.0204082)), 0.1666667), 0.4166667);
        let ox31 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p31, 0.1428571)), 0.4285714);
        let oy31 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p31, 0.1428571))), 0.1428571), 0.4285714);
        let oz31 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p31, 0.0204082)), 0.1666667), 0.4166667);
        let ox32 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p32, 0.1428571)), 0.4285714);
        let oy32 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p32, 0.1428571))), 0.1428571), 0.4285714);
        let oz32 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p32, 0.0204082)), 0.1666667), 0.4166667);
        let ox33 = _$_$_sub_vec3_float(_$_fract_vec3_vec3(_$_$_mul_vec3_float(p33, 0.1428571)), 0.4285714);
        let oy33 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_mod7_vec3_vec3(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p33, 0.1428571))), 0.1428571), 0.4285714);
        let oz33 = _$_$_sub_vec3_float(_$_$_mul_vec3_float(_$_floor_vec3_vec3(_$_$_mul_vec3_float(p33, 0.0204082)), 0.1666667), 0.4166667);
        let dx11 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox11));
        let dy11 = _$_$_add_float_vec3(Pfy[0], _$_$_mul_float_vec3(1.0000000, oy11));
        let dz11 = _$_$_add_float_vec3(Pfz[0], _$_$_mul_float_vec3(1.0000000, oz11));
        let dx12 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox12));
        let dy12 = _$_$_add_float_vec3(Pfy[0], _$_$_mul_float_vec3(1.0000000, oy12));
        let dz12 = _$_$_add_float_vec3(Pfz[1], _$_$_mul_float_vec3(1.0000000, oz12));
        let dx13 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox13));
        let dy13 = _$_$_add_float_vec3(Pfy[0], _$_$_mul_float_vec3(1.0000000, oy13));
        let dz13 = _$_$_add_float_vec3(Pfz[2], _$_$_mul_float_vec3(1.0000000, oz13));
        let dx21 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox21));
        let dy21 = _$_$_add_float_vec3(Pfy[1], _$_$_mul_float_vec3(1.0000000, oy21));
        let dz21 = _$_$_add_float_vec3(Pfz[0], _$_$_mul_float_vec3(1.0000000, oz21));
        let dx22 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox22));
        let dy22 = _$_$_add_float_vec3(Pfy[1], _$_$_mul_float_vec3(1.0000000, oy22));
        let dz22 = _$_$_add_float_vec3(Pfz[1], _$_$_mul_float_vec3(1.0000000, oz22));
        let dx23 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox23));
        let dy23 = _$_$_add_float_vec3(Pfy[1], _$_$_mul_float_vec3(1.0000000, oy23));
        let dz23 = _$_$_add_float_vec3(Pfz[2], _$_$_mul_float_vec3(1.0000000, oz23));
        let dx31 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox31));
        let dy31 = _$_$_add_float_vec3(Pfy[2], _$_$_mul_float_vec3(1.0000000, oy31));
        let dz31 = _$_$_add_float_vec3(Pfz[0], _$_$_mul_float_vec3(1.0000000, oz31));
        let dx32 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox32));
        let dy32 = _$_$_add_float_vec3(Pfy[2], _$_$_mul_float_vec3(1.0000000, oy32));
        let dz32 = _$_$_add_float_vec3(Pfz[1], _$_$_mul_float_vec3(1.0000000, oz32));
        let dx33 = _$_$_add_vec3_vec3(Pfx, _$_$_mul_float_vec3(1.0000000, ox33));
        let dy33 = _$_$_add_float_vec3(Pfy[2], _$_$_mul_float_vec3(1.0000000, oy33));
        let dz33 = _$_$_add_float_vec3(Pfz[2], _$_$_mul_float_vec3(1.0000000, oz33));
        let d11 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx11, dx11), _$_$_mul_vec3_vec3(dy11, dy11)), _$_$_mul_vec3_vec3(dz11, dz11));
        let d12 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx12, dx12), _$_$_mul_vec3_vec3(dy12, dy12)), _$_$_mul_vec3_vec3(dz12, dz12));
        let d13 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx13, dx13), _$_$_mul_vec3_vec3(dy13, dy13)), _$_$_mul_vec3_vec3(dz13, dz13));
        let d21 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx21, dx21), _$_$_mul_vec3_vec3(dy21, dy21)), _$_$_mul_vec3_vec3(dz21, dz21));
        let d22 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx22, dx22), _$_$_mul_vec3_vec3(dy22, dy22)), _$_$_mul_vec3_vec3(dz22, dz22));
        let d23 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx23, dx23), _$_$_mul_vec3_vec3(dy23, dy23)), _$_$_mul_vec3_vec3(dz23, dz23));
        let d31 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx31, dx31), _$_$_mul_vec3_vec3(dy31, dy31)), _$_$_mul_vec3_vec3(dz31, dz31));
        let d32 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx32, dx32), _$_$_mul_vec3_vec3(dy32, dy32)), _$_$_mul_vec3_vec3(dz32, dz32));
        let d33 = _$_$_add_vec3_vec3(_$_$_add_vec3_vec3(_$_$_mul_vec3_vec3(dx33, dx33), _$_$_mul_vec3_vec3(dy33, dy33)), _$_$_mul_vec3_vec3(dz33, dz33));
        let d1a = _$_min_vec3_vec3vec3(d11, d12);
    d12 = _$_max_vec3_vec3vec3(d11, d12);
    d11 = _$_min_vec3_vec3vec3(d1a, d13);
    d13 = _$_max_vec3_vec3vec3(d1a, d13);
    d12 = _$_min_vec3_vec3vec3(d12, d13);
        let d2a = _$_min_vec3_vec3vec3(d21, d22);
    d22 = _$_max_vec3_vec3vec3(d21, d22);
    d21 = _$_min_vec3_vec3vec3(d2a, d23);
    d23 = _$_max_vec3_vec3vec3(d2a, d23);
    d22 = _$_min_vec3_vec3vec3(d22, d23);
        let d3a = _$_min_vec3_vec3vec3(d31, d32);
    d32 = _$_max_vec3_vec3vec3(d31, d32);
    d31 = _$_min_vec3_vec3vec3(d3a, d33);
    d33 = _$_max_vec3_vec3vec3(d3a, d33);
    d32 = _$_min_vec3_vec3vec3(d32, d33);
        let da = _$_min_vec3_vec3vec3(d11, d21);
    d21 = _$_max_vec3_vec3vec3(d11, d21);
    d11 = _$_min_vec3_vec3vec3(da, d31);
    d31 = _$_max_vec3_vec3vec3(da, d31);
    let $tmp0 = vec2cache.next();;
    $tmp0 = ((d11[0] < d11[1]) ? (_$_vec2_vec2_floatfloat(d11[0], d11[1])) : (_$_vec2_vec2_floatfloat(d11[1], d11[0]))), d11[0] = $tmp0[0], d11[1] = $tmp0[1];
    let $tmp1 = vec2cache.next();;
    $tmp1 = ((d11[0] < d11[2]) ? (_$_vec2_vec2_floatfloat(d11[0], d11[2])) : (_$_vec2_vec2_floatfloat(d11[2], d11[0]))), d11[0] = $tmp1[0], d11[2] = $tmp1[1];
    d12 = _$_min_vec3_vec3vec3(d12, d21);
    d12 = _$_min_vec3_vec3vec3(d12, d22);
    d12 = _$_min_vec3_vec3vec3(d12, d31);
    d12 = _$_min_vec3_vec3vec3(d12, d32);
    let $tmp2 = vec2cache.next();;
    $tmp2 = _$_min_vec2_vec2vec2(_$_vec2_vec2_floatfloat(d11[1], d11[2]), _$_vec2_vec2_floatfloat(d12[0], d12[1])), d11[1] = $tmp2[0], d11[2] = $tmp2[1];
    d11[1] = min(d11[1], d12[2]);
    d11[1] = min(d11[1], d11[2]);
    dx31 = _$_$_mul_vec3_vec3(_$_$_add_vec3_float(Pfx, 1.0000000), ox31);
            return _$_sqrt_vec2_vec2(_$_vec2_vec2_floatfloat(d11[0], d11[1]));
  }

  function tent(f) {
    f = 1.0000000 - abs(fract(f) - 0.5000000) * 2.0000000;
    f = f * f * (3.0000000 - 2.0000000 * f);
            return f;
  }

  function main() {
        let f;
        let dx = tent(point[0] * 10.0000000);
        let dy = tent(point[1] * 10.0000000);
    f = tent((dx + dy) * 0.7500000);
    __outs[0] = _$_cellular_vec2_vec3(_$_vec3_vec3_floatfloatfloat(point[0], point[1], 0.2500000));
  }
  let __$func = function(outs, $point, $normal) {
    __outs = outs;
    point = $point;
    normal = $normal;

    main();
  }
  return {
    call : __$func,
    get factor() {return factor},
    set factor(val) {__setfactor(val)},
    get size() {return size},
    set size(val) {__setsize(val)},
    get uColor() {return uColor},
    set uColor(val) {__setuColor(val)},
    outputs: {
      value : 0,
    },
    outputTypes: {
      value : "vec2",
    },
    outputCount: 1
  }
}