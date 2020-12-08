import * as mathl from './mathl.js'
import * as util from '../path.ux/scripts/util/util.js';

let test = `
float val;
in vec3 point;
in vec3 normal;

out float value;

uniform float factor;
uniform float size;
uniform vec3 uColor;

void main(int a, float b) {
  value = fract(1.0 - point[0]*point[1] + 0.5);
}
`

let r = (s) => util.termColor(s, "red");
let g = (s) => util.termColor(s, "green");
let b = (s) => util.termColor(s, "blue");


//console.log(util.termColor("test", "pink"));
//let s = util.termColor("string " + util.termColor("sub", "green") + " right", "pink");
let s = r('one' + g('two' + b('three') + 'four') + 'five');

//console.log(util.termPrint(s));
//let ret = mathl.parse('(a*3**4 * (b - 4)) / (5*3 + 2)**5');
//let ret = mathl.parse('(a*3 * (b - 4)) / (5*3**4 + call(1/2, 3) / 2)');

let ret = mathl.parse(test);
console.log("RET:", ret);
console.log("\n\n"+ret);
console.log(mathl.printcode(ret));

//mathl.parse(test);

