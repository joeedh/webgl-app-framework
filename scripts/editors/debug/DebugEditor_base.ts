export const DisplayModes = {
  RAW   : 0,
  IDS   : 1,
  NORMAL: 2,
  DEPTH : 3,
  ALPHA : 4,
} as const

export type DisplayMode = typeof DisplayModes[keyof typeof DisplayModes]
