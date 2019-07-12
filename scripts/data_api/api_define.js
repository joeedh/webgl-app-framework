import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

import {DataAPI} from '../path.ux/scripts/controller.js';
import * as toolprop from '../path.ux/scripts/toolprop.js';

let api = new DataAPI();

export function getDataAPI() {
  return api;
}
