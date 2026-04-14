import { Cycle, CliOptions } from './types';
export declare class CLI {
    formatCycles(cycles: Cycle[], baseDir: string, verbose: boolean): string;
    private getRelativePath;
    printSummary(fileCount: number, cycleCount: number): void;
    parseOptions(args: string[]): CliOptions;
}
//# sourceMappingURL=cli.d.ts.map