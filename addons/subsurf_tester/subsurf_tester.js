export const addonDefine = {
  name : "Subsurf Tester"
};

import {registerToolMode} from './subsurf_tangent_test.js';

export function register(api) {
  registerToolMode(api);
}

export function unregister() {

}
