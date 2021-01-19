
let f = (x, b) => {
  return x % (b*x*x);
}

let f2 = (x, b) => {
  return Math.abs(x);
  return Math.abs(x*x);
}

Math.fract = (f) => f - Math.floor(f);

let _i = 0;
let rand = () => {
  _i++;
  let f = Math.fract(_i*0.14234);

  f = Math.fract(1.0 / (f*0.00001 + 0.000001));
  return f;
}

for (let i=0; i<5; i++) {
  let x = -rand()*15.0;
  let b = rand()*15.0;

  let df = 0.0000001;

  let r1 = f2(x, b);
  let r2 = f2(x+df, b);
  let dv = (r2 - r1) / df;

  console.log(x.toFixed(4), b.toFixed(4), dv.toFixed(4));
}