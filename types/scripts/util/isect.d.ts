export function planeBoxOverlap(normal: any, vert: any, maxbox: any): 0 | 1;
export function triBoxOverlap(boxcenter: any, boxhalfsize: any, triverts: any): 0 | 1;
export function tri_aabb_isect(v1: any, v2: any, v3: any, min: any, max: any): 0 | 1;
export function ray_tri_isect(orig: any, dir: any, vert0: any, vert1: any, vert2: any): Vector3;
export function tri_cone_isect(p1: any, p2: any, radius1: any, radius2: any, v1: any, v2: any, v3: any, clip?: boolean): boolean;
export function aabb_cone_isect(co: any, vector: any, radius1: any, radius2: any, min: any, max: any): boolean;
export function aabb_ray_isect(co: any, indir: any, min: any, max: any): boolean;
export const license_attribe: "\n********************************************************\n* AABB-triangle overlap test code *\n* by Tomas Akenine-Möller *\n* Function: int triBoxOverlap(float boxcenter[3], *\n* float boxhalfsize[3],float triverts[3][3]); *\n* History: *\n* 2001-03-05: released the code in its first version *\n* 2001-06-18: changed the order of the tests, faster *\n* *\n* Acknowledgement: Many thanks to Pierre Terdiman for *\n* suggestions and discussions on how to optimize code. *\n* Thanks to David Hunt for finding a \">=\"-bug! *\n********************************************************\n";
import { Vector3 } from './vectormath.js';
