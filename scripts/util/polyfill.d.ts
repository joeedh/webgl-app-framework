export interface INumberList {
  [k: number]: number;

  length: number;

  slice(start: number, end: number): INumberList;
}

export declare global {
  declare function updateDataGraph(immediate?: boolean);

  /* This goes here for use by STRUCT scripts;
   * it's deliberately wrong to force you to
   * properly import it in other code.*/
  declare function DataRef(): void;

  declare interface Set {
    map(func: (item: any) => any);

    filter(func: (item: any) => boolean);
  }

  /* window.D* debug variables.
   * These are created at the console.
   * only.
   **/
  declare interface Window {
    D1: number | undefined;
    D2: number | undefined;
    D3: number | undefined;
    D4: number | undefined;
    D5: number | undefined;
    D6: number | undefined;
    DTST2: number | undefined;
    DEBUG: any;
    _appstate: any;
    _unwrap_solvers: Map<any, any>;
  }
}


