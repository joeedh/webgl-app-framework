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
}

