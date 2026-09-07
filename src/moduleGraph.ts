/**
 * Pure Gradle module-graph logic -- no `vscode` dependency, no I/O.
 * Ported from the IntelliJ-family Circular Dependency Companion's
 * regex-based Gradle DSL parsing (its own README documents that
 * mechanism as "a hand-rolled text/regex parser for Gradle DSL", zero
 * PSI dependency there either -- this is a faithful re-implementation
 * of the same approach, not a new design).
 *
 * v0.1 scope, honestly noted: Gradle only (Kotlin DSL + Groovy DSL).
 * Maven multi-module support exists in the IntelliJ-family version and
 * does not exist here yet -- a real gap, not silently dropped.
 */

/** Matches include(":a", ":b") / include ':a', ':b' -- one or more
 * comma-separated quoted module paths, Kotlin or Groovy DSL. */
const INCLUDE_LINE = /include\s*\(?\s*((?:['"][^'"]+['"]\s*,?\s*)+)\)?/g;
const QUOTED_PATH = /['"]([^'"]+)['"]/g;

/** Matches project(":libs:core") / project ':libs:core' anywhere in a
 * build.gradle(.kts) file -- Kotlin/Groovy DSL differ only in whether
 * parens/quote style are required, both match this one shape. */
const PROJECT_REF = /project\s*\(?\s*['"]([^'"]+)['"]\s*\)?/g;

export function parseSettingsGradle(text: string): string[] {
  const modules = new Set<string>();
  for (const includeMatch of text.matchAll(INCLUDE_LINE)) {
    for (const pathMatch of includeMatch[1].matchAll(QUOTED_PATH)) {
      modules.add(pathMatch[1]);
    }
  }
  return [...modules];
}

export function parseModuleDependencies(text: string): string[] {
  const deps = new Set<string>();
  for (const match of text.matchAll(PROJECT_REF)) {
    deps.add(match[1]);
  }
  return [...deps];
}

/** Gradle's own convention: module path ":libs:core" lives at
 * <root>/libs/core/build.gradle(.kts). The root module ":" is <root>
 * itself. */
export function modulePathToDir(modulePath: string): string {
  return modulePath.replace(/^:/, '').replace(/:/g, '/');
}

export interface CycleResult {
  graph: Map<string, string[]>;
  cycles: string[][];
  layers: string[][];
}

/** Classic DFS with a recursion-stack set: a back-edge to a node
 * already on the current stack is a cycle. Returns each cycle exactly
 * once, as the path from the repeated node back to itself. */
export function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  function visit(node: string): void {
    visited.add(node);
    stack.push(node);
    onStack.add(node);

    for (const dep of graph.get(node) ?? []) {
      if (onStack.has(dep)) {
        const cycleStart = stack.indexOf(dep);
        cycles.push([...stack.slice(cycleStart), dep]);
      } else if (!visited.has(dep)) {
        visit(dep);
      }
    }

    stack.pop();
    onStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      visit(node);
    }
  }
  return cycles;
}

/** Groups modules into layers by dependency depth: layer 0 = modules
 * with no in-project dependencies, layer N = modules whose deepest
 * in-project dependency is in layer N-1. Modules inside a cycle have
 * no well-defined depth and are placed in a final "unresolved (cycle)"
 * layer rather than looping forever. */
export function computeLayers(graph: Map<string, string[]>): string[][] {
  const depth = new Map<string, number>();
  const inProgress = new Set<string>();

  function resolve(node: string): number | null {
    if (depth.has(node)) {
      return depth.get(node)!;
    }
    if (inProgress.has(node)) {
      return null; // cycle -- caller marks this module unresolved
    }
    inProgress.add(node);
    let maxDepDepth = -1;
    for (const dep of graph.get(node) ?? []) {
      const depDepth = resolve(dep);
      if (depDepth === null) {
        inProgress.delete(node);
        return null;
      }
      maxDepDepth = Math.max(maxDepDepth, depDepth);
    }
    inProgress.delete(node);
    const result = maxDepDepth + 1;
    depth.set(node, result);
    return result;
  }

  const unresolved: string[] = [];
  for (const node of graph.keys()) {
    if (resolve(node) === null) {
      unresolved.push(node);
    }
  }

  const maxDepth = Math.max(-1, ...depth.values());
  const layers: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const [node, d] of depth) {
    layers[d].push(node);
  }
  if (unresolved.length > 0) {
    layers.push(unresolved);
  }
  return layers.map((layer) => layer.sort());
}

export function analyze(graph: Map<string, string[]>): CycleResult {
  return { graph, cycles: findCycles(graph), layers: computeLayers(graph) };
}

export function formatReport(result: CycleResult): string {
  const lines: string[] = [];
  if (result.cycles.length > 0) {
    lines.push(`⚠️  ${result.cycles.length} cycle(s) detected:`);
    for (const cycle of result.cycles) {
      lines.push(`  ${cycle.join(' -> ')}`);
    }
  } else {
    lines.push('No cycles detected.');
  }
  lines.push('');
  lines.push('Layers (by dependency depth):');
  result.layers.forEach((layer, index) => {
    for (const module of layer) {
      const deps = result.graph.get(module) ?? [];
      const label = deps.length > 0 ? `${module}  ->  ${deps.join(', ')}` : module;
      lines.push(`  [${index}] ${label}`);
    }
  });
  return lines.join('\n');
}
