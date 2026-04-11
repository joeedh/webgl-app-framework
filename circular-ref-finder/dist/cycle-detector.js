"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CycleDetector = void 0;
class CycleDetector {
    constructor(graph) {
        this.visited = new Set();
        this.recursionStack = new Set();
        this.cycles = [];
        this.cycleSet = new Set();
        this.graph = graph;
    }
    detectCycles() {
        console.log('detecting cycles');
        this.cycles = [];
        this.visited = new Set();
        this.recursionStack = new Set();
        this.cycleSet = new Set();
        for (const node of Object.keys(this.graph)) {
            if (!this.visited.has(node)) {
                this.dfs(node, []);
            }
        }
        return this.cycles;
    }
    dfs(node, path) {
        this.visited.add(node);
        this.recursionStack.add(node);
        path.push(node);
        const neighbors = this.graph[node] || new Set();
        for (const neighbor of neighbors) {
            if (!this.visited.has(neighbor)) {
                this.dfs(neighbor, path);
            }
            else if (this.recursionStack.has(neighbor)) {
                const cycleStartIndex = path.indexOf(neighbor);
                if (cycleStartIndex !== -1) {
                    const cycle = path.slice(cycleStartIndex);
                    cycle.push(neighbor);
                    this.addCycle(cycle);
                }
            }
        }
        path.pop();
        this.recursionStack.delete(node);
    }
    addCycle(files) {
        const normalized = this.normalizeCycle(files);
        const key = normalized.join('|');
        if (!this.cycleSet.has(key)) {
            this.cycleSet.add(key);
            this.cycles.push({ files: normalized });
        }
    }
    normalizeCycle(files) {
        if (files.length === 0) {
            return files;
        }
        let minIndex = 0;
        for (let i = 1; i < files.length; i++) {
            if (files[i] < files[minIndex]) {
                minIndex = i;
            }
        }
        const normalized = [];
        for (let i = 0; i < files.length; i++) {
            normalized.push(files[(minIndex + i) % files.length]);
        }
        return normalized;
    }
}
exports.CycleDetector = CycleDetector;
//# sourceMappingURL=cycle-detector.js.map