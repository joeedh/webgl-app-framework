import fs from 'fs';

import {rebuildParser} from './parser/parser.js';

import('./util/jscc.js').then((jscc) => {
//console.log(""+mathl.parse(test));
  let parser = rebuildParser();
  let data = parser.save();

  data = `/* WARNING: auto-generated file! */
export const parsetable = "${data}";
`;

  //console.log(parser.compressPopTab());
  //console.log((data.length/1024).toFixed(2) + "kb");

  fs.writeFileSync("parser/parsetab.js", data);
});