export const VertexFields = {
  VEID : 0,
  VFLAG : 1,
  VINDEX : 2,
  VX   : 3,
  VY   : 4,
  VZ   : 5,
  VNX  : 6,
  VNY  : 7,
  VNZ  : 8,
  VEDGE: 9,
  VTOT : 10
};

let {VEID, VFLAG, VINDEX, VX, VY, VZ, VNX, VNY, VNZ, VEDGE, VTOT} = VertexFields;

export const EdgeFields = {
  EEID : 0,
  EFLAG : 1,
  EINDEX : 2,
  EV1 : 3,
  EV2 : 4,
  EL1 : 5,
  EL2 : 6,
  ETOT : 7
};

let {EEID, EFLAG, EINDEX, EV1, EV2, EL1, EL2, ETOT} = EdgeFields;

export const HalfEdgeFields = {
  LEID : 0,
  LFLAG : 1,
  LINDEX : 2,
  LFACE : 3,
  LVERT : 4,
  LEDGE : 5,
  LPAIR : 6,
  LNEXT : 7,
  LPREV : 8,
  LTOT : 9
};
let {LEID, LFLAG, LINDEX, LFACE, LVERT, LEDGE, LPAIR, LNEXT, LPREV, LTOT} = HalfEdgeFields;

export const FaceFields = {
  FEID : 0,
  FFLAG : 1,
  FINDEX : 2,
  FL1 : 3,
  FL2 : 4,
  FL3 : 5,
  FV1 : 6,
  FV2 : 7,
  FV3 : 8,
  FE1 : 9,
  FE2 : 10,
  FE3 : 11,
  FNX : 12,
  FNY : 13,
  FNZ : 14,
  FCX : 15,
  FCY : 17,
  FCZ : 19,
  FAREA : 20,
  FTOT : 21
};
let {FEID, FFLAG, FINDEX, FL1, FL2, FL3, FV1, FV2, FV3, FE1, FE2, FE3, FNX, FNY, FNZ,
     FCX, FCY, FCZ, FAREA, FTOT} = FaceFields;

export let FieldSizes = {
  1 : VTOT,
  2 : ETOT,
  4 : LTOT,
  8 : FTOT
};
