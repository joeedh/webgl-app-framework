import * as ts from 'typescript';
import { DependencyGraph, CliOptions } from './types';
export declare class DependencyAnalyzer {
    private graph;
    private options;
    private sourceFile;
    program: ts.Program;
    host: ts.CompilerHost;
    constructor(options: CliOptions);
    analyze(): DependencyGraph;
    private getSourceFiles;
    private shouldExclude;
    private shouldIncludeFile;
    normPath(pathin: string): string;
    private analyzeFile;
    private getModPath;
    private processImport;
    private processExport;
    private processRequire;
    private addDependency;
    private resolveImportPath;
    getGraph(): DependencyGraph;
}
//# sourceMappingURL=analyzer.d.ts.map