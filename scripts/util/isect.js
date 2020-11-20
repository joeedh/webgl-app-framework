"use strict";

import {Vector2, Vector3, Vector4, Quat, Matrix4} from './vectormath.js';
import * as util from './util.js';
import {point_in_aabb} from './math.js';

export const license_attribe = `
********************************************************
* AABB-triangle overlap test code *
* by Tomas Akenine-Möller *
* Function: int triBoxOverlap(float boxcenter[3], *
* float boxhalfsize[3],float triverts[3][3]); *
* History: *
* 2001-03-05: released the code in its first version *
* 2001-06-18: changed the order of the tests, faster *
* *
* Acknowledgement: Many thanks to Pierre Terdiman for *
* suggestions and discussions on how to optimize code. *
* Thanks to David Hunt for finding a ">="-bug! *
********************************************************
`;


function CROSS(dest, v1, v2) {
    dest[0]=v1[1]*v2[2]-v1[2]*v2[1];
    dest[1]=v1[2]*v2[0]-v1[0]*v2[2];
    dest[2]=v1[0]*v2[1]-v1[1]*v2[0];
}


function DOT(v1, v2) {
  return v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
}

function SUB(dest, v1, v2) {
    dest[0] = v1[0]-v2[0];
    dest[1] = v1[1]-v2[1];
    dest[2] = v1[2]-v2[2];
}

let _vmin = new Vector3(), _vmax = new Vector3();

export function planeBoxOverlap(normal ,vert, maxbox) {
  let vmin = _vmin, vmax = _vmax;

  for(var q=0;q<=3;q++)
  {
    var v=vert[q]; // -NJMP-
    if(normal[q]>0.0) {
      vmin[q]=-maxbox[q] - v; // -NJMP-
      vmax[q]= maxbox[q] - v; // -NJMP-
    } else {
      vmin[q]= maxbox[q] - v; // -NJMP-
      vmax[q]=-maxbox[q] - v; // -NJMP-
    }
  }

  if(DOT(normal,vmin)>0.0) return 0; // -NJMP-
  if(DOT(normal,vmax)>=0.0) return 1; // -NJMP-

  return 0;
}

let v0 = new Vector3(), v1 = new Vector3(), v2 = new Vector3();
let normal = new Vector3(), e0 = new Vector3(), e1 = new Vector3(), e2 = new Vector3();

//boxcenter[3], boxhalfsize[3], triverts[3][3]
export function triBoxOverlap(boxcenter, boxhalfsize, triverts) {
  /*    use separating axis theorem to test overlap between triangle and box */
  /*    need to test for overlap in these directions: */
  /*    1) the {x,y,z}-directions (actually, since we use the AABB of the triangle */
  /*       we do not even need to test these) */
  /*    2) normal of the triangle */
  /*    3) crossproduct(edge from tri, {x,y,z}-directin) */
  /*       this gives 3x3=9 more tests */

   var min,max,p0,p1,p2,rad,fex,fey,fez; // -NJMP- "d" local variable removed


   /* This is the fastest branch on Sun */
   /* move everything so that the boxcenter is in (0,0,0) */

   SUB(v0,triverts[0],boxcenter);
   SUB(v1,triverts[1],boxcenter);
   SUB(v2,triverts[2],boxcenter);

   /* compute triangle edges */

   SUB(e0,v1,v0); /* tri edge 0 */
   SUB(e1,v2,v1); /* tri edge 1 */

   SUB(e2,v0,v2); /* tri edge 2 */


   /* Bullet 3:  */
   /*  test the 9 tests first (this was faster) */

   fex = Math.abs(e0[0]);
   fey = Math.abs(e0[1]);
   fez = Math.abs(e0[2]);

   p0 = e0[2]*v0[1] - e0[1]*v0[2]; p2 = e0[2]*v2[1] - e0[1]*v2[2]; if(p0<p2) {min=p0; max=p2;} else {min=p2; max=p0;} rad = fez * boxhalfsize[1] + fey * boxhalfsize[2]; if(min>rad || max<-rad) return 0;;
   p0 = -e0[2]*v0[0] + e0[0]*v0[2]; p2 = -e0[2]*v2[0] + e0[0]*v2[2]; if(p0<p2) {min=p0; max=p2;} else {min=p2; max=p0;} rad = fez * boxhalfsize[0] + fex * boxhalfsize[2]; if(min>rad || max<-rad) return 0;;
   p1 = e0[1]*v1[0] - e0[0]*v1[1]; p2 = e0[1]*v2[0] - e0[0]*v2[1]; if(p2<p1) {min=p2; max=p1;} else {min=p1; max=p2;} rad = fey * boxhalfsize[0] + fex * boxhalfsize[1]; if(min>rad || max<-rad) return 0;;


   fex = Math.abs(e1[0]);
   fey = Math.abs(e1[1]);
   fez = Math.abs(e1[2]);

   p0 = e1[2]*v0[1] - e1[1]*v0[2]; p2 = e1[2]*v2[1] - e1[1]*v2[2]; if(p0<p2) {min=p0; max=p2;} else {min=p2; max=p0;} rad = fez * boxhalfsize[1] + fey * boxhalfsize[2]; if(min>rad || max<-rad) return 0;;
   p0 = -e1[2]*v0[0] + e1[0]*v0[2]; p2 = -e1[2]*v2[0] + e1[0]*v2[2]; if(p0<p2) {min=p0; max=p2;} else {min=p2; max=p0;} rad = fez * boxhalfsize[0] + fex * boxhalfsize[2]; if(min>rad || max<-rad) return 0;;
   p0 = e1[1]*v0[0] - e1[0]*v0[1]; p1 = e1[1]*v1[0] - e1[0]*v1[1]; if(p0<p1) {min=p0; max=p1;} else {min=p1; max=p0;} rad = fey * boxhalfsize[0] + fex * boxhalfsize[1]; if(min>rad || max<-rad) return 0;;


   fex = Math.abs(e2[0]);
   fey = Math.abs(e2[1]);
   fez = Math.abs(e2[2]);

   p0 = e2[2]*v0[1] - e2[1]*v0[2]; p1 = e2[2]*v1[1] - e2[1]*v1[2]; if(p0<p1) {min=p0; max=p1;} else {min=p1; max=p0;} rad = fez * boxhalfsize[1] + fey * boxhalfsize[2]; if(min>rad || max<-rad) return 0;;
   p0 = -e2[2]*v0[0] + e2[0]*v0[2]; p1 = -e2[2]*v1[0] + e2[0]*v1[2]; if(p0<p1) {min=p0; max=p1;} else {min=p1; max=p0;} rad = fez * boxhalfsize[0] + fex * boxhalfsize[2]; if(min>rad || max<-rad) return 0;;
   p1 = e2[1]*v1[0] - e2[0]*v1[1]; p2 = e2[1]*v2[0] - e2[0]*v2[1]; if(p2<p1) {min=p2; max=p1;} else {min=p1; max=p2;} rad = fey * boxhalfsize[0] + fex * boxhalfsize[1]; if(min>rad || max<-rad) return 0;;


   /* Bullet 1: */
   /*  first test overlap in the {x,y,z}-directions */
   /*  find min, max of the triangle each direction, and test for overlap in */
   /*  that direction -- this is equivalent to testing a minimal AABB around */
   /*  the triangle against the AABB */



   /* test in X-direction */

   min = max = v0[0]; if(v1[0]<min) min=v1[0]; if(v1[0]>max) max=v1[0]; if(v2[0]<min) min=v2[0]; if(v2[0]>max) max=v2[0];;

   if(min>boxhalfsize[0] || max<-boxhalfsize[0]) return 0;


   /* test in Y-direction */

   min = max = v0[1]; if(v1[1]<min) min=v1[1]; if(v1[1]>max) max=v1[1]; if(v2[1]<min) min=v2[1]; if(v2[1]>max) max=v2[1];;

   if(min>boxhalfsize[1] || max<-boxhalfsize[1]) return 0;



   /* test in Z-direction */

   min = max = v0[2]; if(v1[2]<min) min=v1[2]; if(v1[2]>max) max=v1[2]; if(v2[2]<min) min=v2[2]; if(v2[2]>max) max=v2[2];;

   if(min>boxhalfsize[2] || max<-boxhalfsize[2]) return 0;


   /* Bullet 2: */
   /*  test if the box intersects the plane of the triangle */
   /*  compute plane equation of triangle: normal*x+d=0 */

   CROSS(normal,e0,e1);

   // -NJMP- (line removed here)

   if(!planeBoxOverlap(normal,v0,boxhalfsize)) return 0; // -NJMP-


   return 1; /* box and triangle overlaps */
}

let tsize = new Vector3(), tcent = new Vector3(), triverts = [0, 0, 0];

export function tri_aabb_isect(v1, v2, v3, min, max) {
    let cent = tcent, size = tsize;

    triverts[0] = v1; triverts[1] = v2; triverts[2] = v3;

    cent.load(max).add(min).mulScalar(0.5);
    size.load(max).sub(min).mulScalar(0.5);

    return triBoxOverlap(cent, size, triverts);
}

var ray_tri_attrib = `
* Ray-Triangle Intersection Test Routines *
* Different optimizations of my and Ben Trumbore's *
* code from journals of graphics tools (JGT) *
* http://www.acm.org/jgt/                          *
* by Tomas Moller, May 2000 *
`;



let edge1 = new Vector3(), edge2 = new Vector3(), tvec = new Vector3();
let qvec = new Vector3(), pvec = new Vector3();
let rti_ret = new Vector3();

/* the original jgt code */
export function ray_tri_isect(orig, dir, vert0, vert1, vert2) {
  var det, inv_det;

  /* find vectors for two edges sharing vert0 */
  SUB(edge1, vert1, vert0);
  SUB(edge2, vert2, vert0);

  /* begin calculating determinant - also used to calculate U parameter */
  CROSS(pvec, dir, edge2);

  /* if determinant is near zero, ray lies in plane of triangle */
  det = DOT(edge1, pvec);

  if (det > -0.000001 && det < 0.000001)
   return undefined;
  inv_det = 1.0 / det;

  /* calculate distance from vert0 to ray origin */
  SUB(tvec, orig, vert0);

  /* calculate U parameter and test bounds */
  var u = DOT(tvec, pvec) * inv_det;
  if (u < 0.0 || u > 1.0)
   return undefined;

  /* prepare to test V parameter */
  CROSS(qvec, tvec, edge1);

  /* calculate V parameter and test bounds */
  var v = DOT(dir, qvec) * inv_det;
  if (v < 0.0 || u + v > 1.0)
   return undefined;

  /* calculate t, ray intersects triangle */
  var t = DOT(edge2, qvec) * inv_det;

  let ret = rti_ret;

  ret[0] = u;
  ret[1] = v;
  ret[2] = t;

  return ret;
}



let dir = new Vector3();
let tmps = util.cachering.fromConstructor(Vector3, 32);
let tmp1 = new Vector3();

export function   aabb_ray_isect(co, indir, min, max) {
  if (point_in_aabb(co, min, max)) {
    return true;
  }

  for (let axis=0; axis<3; axis++) {
    let p, t1, t2;

    let a1 = (axis+1)%3;
    let a2 = (axis+2)%3;

    let amin = min[axis];
    let amax = max[axis];

    if (Math.abs(indir[axis]) > 0.0001) {
      t1 = (amin - co[axis]) / indir[axis];
      t2 = (amax - co[axis]) / indir[axis];

      p = tmp1.load(co).addFac(indir, t1);
    } else {
      continue;
    }


    if (p[a1] >= min[a1] && p[a1] <= max[a1] && p[a2] >= min[a2] && p[a2] <= max[a2]) {
      return true;
    }

    p.load(co).addFac(indir, t2);

    if (p[a1] >= min[a1] && p[a1] <= max[a1] && p[a2] >= min[a2] && p[a2] <= max[a2]) {
      return true;
    }
  }

  return false;
}
