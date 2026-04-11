"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyAnalyzer = void 0;
const ts = __importStar(require("typescript"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class DependencyAnalyzer {
    constructor(options) {
        this.graph = {};
        this.sourceFile = null;
        this.options = options;
    }
    analyze() {
        const files = this.getSourceFiles();
        if (this.options.verbose) {
            console.log(`Analyzing ${files.length} files...`);
        }
        const opt = {
            target: ts.ScriptTarget.Latest,
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            allowJs: true,
            noResolve: false,
            noEmit: true,
        };
        let filePaths = [];
        function createCustomHost(options) {
            // 1. Create the default host
            const host = ts.createCompilerHost(options, true);
            // 2. Cache the module resolution cache if you want performance (optional but recommended)
            const moduleResolutionCache = ts.createModuleResolutionCache(host.getCurrentDirectory(), (s) => host.getCanonicalFileName(s), options);
            // 3. Override resolveModuleNameLiterals
            host.resolveModuleNameLiterals = (moduleLiterals, containingFile, redirectedReference, options, containingSourceFile, reusedNames) => {
                return moduleLiterals.map((moduleLiteral) => {
                    const moduleName = moduleLiteral.text;
                    // --- YOUR CUSTOM RESOLUTION LOGIC HERE ---
                    // Example: Intercepting a specific virtual module
                    if (moduleName === '@my-custom-alias/core') {
                        return {
                            resolvedModule: {
                                resolvedFileName: '/absolute/path/to/virtual/core.ts',
                                extension: ts.Extension.Ts,
                                isExternalLibraryImport: false,
                            },
                        };
                    }
                    // --- FALLBACK TO DEFAULT RESOLUTION ---
                    // Use ts.resolveModuleName to let TS handle the heavy lifting (node_modules, paths, etc.)
                    const result = ts.resolveModuleName(moduleName, containingFile, options, host, moduleResolutionCache, redirectedReference);
                    const spath = result.resolvedModule?.resolvedFileName;
                    if (spath) {
                        filePaths.push(spath);
                    }
                    return {
                        resolvedModule: result.resolvedModule,
                    };
                });
            };
            return host;
        }
        const host = createCustomHost(opt);
        this.host = host;
        const program = ts.createProgram(files, opt, host);
        program.getTypeChecker();
        this.program = program;
        const result = program.emit();
        const ignored = [
            //
            /\.*node_modules\.*/,
        ];
        const skip = (s) => ignored.some((r) => s.search(r) !== -1);
        console.log(result?.diagnostics);
        const filePathsToScan = Array.from(new Set(filePaths)).filter((f) => this.shouldIncludeFile(f));
        let i = 0;
        for (const sourcePath of filePathsToScan) {
            const sourceFile = program.getSourceFile(sourcePath);
            if (sourceFile && !sourceFile.isDeclarationFile) {
                console.log(++i, 'of', filePathsToScan.length, sourcePath);
                this.analyzeFile(sourceFile, sourcePath, program);
            }
        }
        return this.graph;
    }
    getSourceFiles() {
        return [path.resolve(this.options.dir)];
    }
    shouldExclude(filePath) {
        const normalized = path.normalize(filePath);
        for (const pattern of this.options.exclude) {
            if (normalized.includes(pattern)) {
                return true;
            }
        }
        return false;
    }
    shouldIncludeFile(filePath) {
        if (filePath.search(/node_modules/) !== -1) {
            return false;
        }
        if (this.shouldExclude(filePath)) {
            return false;
        }
        const ext = path.extname(filePath);
        const validExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
        if (!validExtensions.includes(ext)) {
            return false;
        }
        if (this.options.include.length > 0) {
            const normalized = path.normalize(filePath);
            return this.options.include.some((pattern) => {
                if (pattern.includes('*')) {
                    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                    return regex.test(normalized);
                }
                return normalized.includes(pattern);
            });
        }
        return true;
    }
    normPath(pathin) {
        return pathin;
    }
    analyzeFile(sourceFile, sourcePath, program) {
        this.sourceFile = sourceFile;
        const filePath = sourcePath;
        if (!this.graph[filePath]) {
            this.graph[filePath] = new Set();
        }
        const visit = (node) => {
            if (ts.isImportDeclaration(node)) {
                this.processImport(node, filePath, program);
            }
            else if (ts.isExportDeclaration(node)) {
                this.processExport(node, filePath, program);
            }
            else if (ts.isCallExpression(node)) {
                this.processRequire(node, filePath, program);
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }
    getModPath(node, filePath, program) {
        const res = this.host.resolveModuleNameLiterals([node], filePath, undefined, program.getCompilerOptions(), this.sourceFile, undefined)[0]?.resolvedModule?.resolvedFileName;
        return res;
    }
    processImport(node, filePath, program) {
        if (node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword) {
            return;
        }
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const mpath = this.getModPath(node.moduleSpecifier, filePath, program);
            if (mpath) {
                this.addDependency(filePath, mpath, program);
            }
        }
    }
    processExport(node, filePath, program) {
        if (node.isTypeOnly) {
            return;
        }
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const exportPath = this.normPath(node.moduleSpecifier.text);
            this.addDependency(filePath, exportPath, program);
        }
    }
    processRequire(node, filePath, program) {
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
            const identifier = node.expression;
            if (identifier.text === 'require' && node.arguments.length > 0) {
                const arg = node.arguments[0];
                if (ts.isStringLiteral(arg)) {
                    this.addDependency(filePath, arg.text, program);
                }
            }
        }
    }
    addDependency(fromFile, importPath, program) {
        if (this.shouldIncludeFile(importPath)) {
            this.graph[fromFile].add(importPath);
        }
    }
    resolveImportPath(fromFile, importPath) {
        const dir = path.dirname(fromFile);
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
        let resolved = path.resolve(dir, importPath);
        if (fs.existsSync(resolved)) {
            const stat = fs.statSync(resolved);
            if (stat.isFile()) {
                return path.normalize(resolved);
            }
            else if (stat.isDirectory()) {
                const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
                for (const indexFile of indexFiles) {
                    const indexPath = path.join(resolved, indexFile);
                    if (fs.existsSync(indexPath)) {
                        return path.normalize(indexPath);
                    }
                }
            }
        }
        for (const ext of extensions) {
            const withExt = resolved + ext;
            if (fs.existsSync(withExt)) {
                return path.normalize(withExt);
            }
        }
        return null;
    }
    getGraph() {
        return this.graph;
    }
}
exports.DependencyAnalyzer = DependencyAnalyzer;
//# sourceMappingURL=analyzer.js.map