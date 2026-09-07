import * as vscode from 'vscode';
import {
  parseSettingsGradle,
  parseModuleDependencies,
  modulePathToDir,
  analyze,
  formatReport,
} from './moduleGraph';

let outputChannel: vscode.OutputChannel | undefined;

function output(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Circular Dependency Companion');
  }
  return outputChannel;
}

async function findSettingsFile(root: vscode.Uri): Promise<vscode.Uri | undefined> {
  for (const name of ['settings.gradle.kts', 'settings.gradle']) {
    const candidate = vscode.Uri.joinPath(root, name);
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      // not this one -- try the next
    }
  }
  return undefined;
}

async function findBuildFile(root: vscode.Uri, modulePath: string): Promise<vscode.Uri | undefined> {
  const dir = modulePathToDir(modulePath);
  const dirUri = dir === '' ? root : vscode.Uri.joinPath(root, dir);
  for (const name of ['build.gradle.kts', 'build.gradle']) {
    const candidate = vscode.Uri.joinPath(dirUri, name);
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      // not this one
    }
  }
  return undefined;
}

async function readText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

async function analyzeWorkspace(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showErrorMessage('Circular Dependency Companion: open a folder/workspace first.');
    return;
  }
  const root = folders[0].uri;

  const settingsUri = await findSettingsFile(root);
  if (!settingsUri) {
    void vscode.window.showErrorMessage(
      'Circular Dependency Companion: no settings.gradle(.kts) found at the workspace root.',
    );
    return;
  }

  const settingsText = await readText(settingsUri);
  const modules = parseSettingsGradle(settingsText);
  if (modules.length === 0) {
    void vscode.window.showWarningMessage(
      'Circular Dependency Companion: settings.gradle(.kts) found, but no include(...) modules were parsed from it.',
    );
    return;
  }

  const graph = new Map<string, string[]>();
  const knownModules = new Set(modules);
  for (const modulePath of modules) {
    const buildUri = await findBuildFile(root, modulePath);
    if (!buildUri) {
      graph.set(modulePath, []);
      continue;
    }
    const buildText = await readText(buildUri);
    const deps = parseModuleDependencies(buildText).filter((dep) => knownModules.has(dep) && dep !== modulePath);
    graph.set(modulePath, deps);
  }

  const result = analyze(graph);
  const channel = output();
  channel.clear();
  channel.appendLine(`Circular Dependency Companion -- ${modules.length} module(s) found in ${settingsUri.fsPath}`);
  channel.appendLine('');
  channel.appendLine(formatReport(result));
  channel.show(true);

  if (result.cycles.length > 0) {
    void vscode.window.showWarningMessage(
      `Circular Dependency Companion: ${result.cycles.length} circular dependency/ies found. See the output channel.`,
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('circularDependencyCompanion.analyze', () => {
    void analyzeWorkspace();
  });
  context.subscriptions.push(command);
}

export function deactivate(): void {
  outputChannel?.dispose();
}
