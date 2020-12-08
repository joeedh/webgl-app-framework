if (typeof window === "undefined") {
  globalThis.window = globalThis;
}

export function float2half(f) {
  let exp = 15;
  let sign = f < 0.0;

  f = Math.abs(f);
  if (f < 1.0) {
    for (let i=0; i<15; i++) {
      exp++;
      f *= 2.0;

      if (f > 1.0) {
        break;
      }
    }
  } else {
    for (let i=0; i<15; i++) {
      if (f < 2.0) {
        break;
      }

      f *= 0.5;
      exp--;
    }
  }

  f -= 1.0;

  let mantissa = ~~(f * 1023);
  mantissa = mantissa & 1023;

  f = mantissa | (exp<<10);
  f |= sign<<15;

  return f;
}
window.float2half = float2half;

export function half2float(f) {
  let sign = f & (1<<15);
  let exp = (f & ~(1<<15)) >> 10;
  let mant = f & 1023;

  f = mant/1023 + 1.0;
  f *= sign ? -1.0 : 1.0;

  exp -= 15;
  f *= Math.pow(2.0, -exp);

  return f;
}
window.half2float = half2float;


function test() {
  let fract = (f) => f - Math.floor(f);

  for (let i = 0; i < 30; i++) {
    let f = fract(i * Math.sqrt(3.0) * 11.0);
    f = fract(1.0 / (0.00001 * f + 0.00001));
    f = (f - 0.5) * 4.0;

    let f2 = half2float(float2half(f));
    console.log("F", (f - f2).toFixed(5), f.toFixed(5), f2.toFixed(5));
  }
}