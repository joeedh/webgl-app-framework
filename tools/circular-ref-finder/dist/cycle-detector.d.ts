import { DependencyGraph, Cycle } from './types';
export declare class CycleDetector {
    private graph;
    private visited;
    private recursionStack;
    private cycles;
    private cycleSet;
    constructor(graph: DependencyGraph);
    detectCycles(): Cycle[];
    private dfs;
    private addCycle;
    private normalizeCycle;
}
//# sourceMappingURL=cycle-detector.d.ts.map