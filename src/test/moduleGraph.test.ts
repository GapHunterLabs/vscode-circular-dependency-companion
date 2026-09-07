import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSettingsGradle,
  parseModuleDependencies,
  modulePathToDir,
  findCycles,
  computeLayers,
  analyze,
  formatReport,
} from '../moduleGraph';

test('parseSettingsGradle reads Kotlin DSL multi-include', () => {
  const text = `rootProject.name = "demo"\ninclude(":app", ":libs:core", ":libs:util")\n`;
  const modules = parseSettingsGradle(text);
  assert.deepEqual(modules.sort(), [':app', ':libs:core', ':libs:util']);
});

test('parseSettingsGradle reads Groovy DSL, one include per line', () => {
  const text = `include ':app'\ninclude ':libs:core'\n`;
  const modules = parseSettingsGradle(text);
  assert.deepEqual(modules.sort(), [':app', ':libs:core']);
});

test('parseSettingsGradle dedupes repeated includes', () => {
  const text = `include(":app")\ninclude(":app")\n`;
  assert.deepEqual(parseSettingsGradle(text), [':app']);
});

test('parseModuleDependencies finds project() refs, Kotlin and Groovy style', () => {
  const text = `
dependencies {
    implementation(project(":libs:core"))
    testImplementation project(':libs:util')
}
`;
  assert.deepEqual(parseModuleDependencies(text).sort(), [':libs:core', ':libs:util']);
});

test('modulePathToDir follows Gradle path convention', () => {
  assert.equal(modulePathToDir(':libs:core'), 'libs/core');
  assert.equal(modulePathToDir(':app'), 'app');
});

test('findCycles returns empty for an acyclic graph', () => {
  const graph = new Map([
    [':app', [':libs:core']],
    [':libs:core', [':libs:util']],
    [':libs:util', []],
  ]);
  assert.deepEqual(findCycles(graph), []);
});

test('findCycles detects a direct 2-node cycle', () => {
  const graph = new Map([
    [':a', [':b']],
    [':b', [':a']],
  ]);
  const cycles = findCycles(graph);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0], [':a', ':b', ':a']);
});

test('findCycles detects a longer indirect cycle', () => {
  const graph = new Map([
    [':a', [':b']],
    [':b', [':c']],
    [':c', [':a']],
  ]);
  const cycles = findCycles(graph);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0], [':a', ':b', ':c', ':a']);
});

test('computeLayers places independent modules in layer 0', () => {
  const graph = new Map([
    [':a', []],
    [':b', []],
  ]);
  const layers = computeLayers(graph);
  assert.deepEqual(layers, [[':a', ':b']]);
});

test('computeLayers places dependents in deeper layers', () => {
  const graph = new Map([
    [':app', [':core']],
    [':core', []],
  ]);
  const layers = computeLayers(graph);
  assert.deepEqual(layers, [[':core'], [':app']]);
});

test('computeLayers puts a cyclic module in a final unresolved layer', () => {
  const graph = new Map([
    [':a', [':b']],
    [':b', [':a']],
    [':independent', []],
  ]);
  const layers = computeLayers(graph);
  // layer 0: independent module; last layer: the unresolved cycle members
  assert.deepEqual(layers[0], [':independent']);
  assert.deepEqual(layers[layers.length - 1].sort(), [':a', ':b']);
});

test('analyze + formatReport surfaces cycles clearly, never silently mixed in', () => {
  const graph = new Map([
    [':a', [':b']],
    [':b', [':a']],
  ]);
  const report = formatReport(analyze(graph));
  assert.match(report, /1 cycle\(s\) detected/);
  assert.match(report, /:a -> :b -> :a/);
});

test('formatReport says "No cycles detected" explicitly when there are none', () => {
  const graph = new Map([[':a', []]]);
  const report = formatReport(analyze(graph));
  assert.match(report, /No cycles detected/);
});
