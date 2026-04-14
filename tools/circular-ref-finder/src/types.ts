export interface CliOptions {
  dir: string
  exclude: string[]
  include: string[]
  verbose: boolean
}

export interface DependencyGraph {
  [filePath: string]: Set<string>
}

export interface Cycle {
  files: string[]
}

export interface AnalysisResult {
  graph: DependencyGraph
  cycles: Cycle[]
  fileCount: number
}
