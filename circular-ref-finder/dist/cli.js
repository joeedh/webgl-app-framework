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
exports.CLI = void 0;
const path = __importStar(require("path"));
class CLI {
    formatCycles(cycles, baseDir, verbose) {
        if (cycles.length === 0) {
            return '✓ No circular dependencies found!';
        }
        const lines = [];
        lines.push(`\n❌ Found ${cycles.length} circular ${cycles.length === 1 ? 'dependency' : 'dependencies'}:\n`);
        for (let i = 0; i < cycles.length; i++) {
            const cycle = cycles[i];
            lines.push(`Cycle ${i + 1}:`);
            const relativePaths = cycle.files.map((f) => this.getRelativePath(f, baseDir));
            for (let j = 0; j < relativePaths.length; j++) {
                const isLast = j === relativePaths.length - 1;
                const arrow = isLast ? ' → (back to start)' : ' →';
                lines.push(`  ${relativePaths[j]}${arrow}`);
            }
            lines.push('');
        }
        return lines.join('\n');
    }
    getRelativePath(filePath, baseDir) {
        const relative = path.relative(baseDir, filePath);
        return relative || filePath;
    }
    printSummary(fileCount, cycleCount) {
        console.log(`\nAnalyzed ${fileCount} files`);
        console.log(`Found ${cycleCount} circular ${cycleCount === 1 ? 'dependency' : 'dependencies'}`);
    }
    parseOptions(args) {
        const options = {
            dir: process.cwd(),
            exclude: ['node_modules', 'dist', 'build', '.git'],
            include: [],
            verbose: false,
        };
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === '--dir' || arg === '-d') {
                options.dir = args[++i];
            }
            else if (arg === '--exclude' || arg === '-e') {
                const excludePatterns = args[++i].split(',');
                options.exclude.push(...excludePatterns);
            }
            else if (arg === '--include' || arg === '-i') {
                const includePatterns = args[++i].split(',');
                options.include.push(...includePatterns);
            }
            else if (arg === '--verbose' || arg === '-v') {
                options.verbose = true;
            }
            else if (!arg.startsWith('-')) {
                options.dir = arg;
            }
        }
        return options;
    }
}
exports.CLI = CLI;
//# sourceMappingURL=cli.js.map