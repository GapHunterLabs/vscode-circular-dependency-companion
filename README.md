# Circular Dependency Companion (VS Code)

Detect circular dependencies between modules of a multi-module Gradle
project — 100% static text parsing, no Gradle daemon, no data leaves
your editor.

**v0.1, pilot.** Part of the Gap Hunter Labs VS Code workstream
porting selected niches from the
[IntelliJ-family catalog](https://plugins.jetbrains.com/vendor/gap-hunter-labs).
The IntelliJ-family version also supports Maven multi-module
projects — **this version doesn't (yet)**, Gradle only (Kotlin DSL
and Groovy DSL both supported).

## What it does

**Command: `Circular Dependency Companion: Analyze Gradle Modules`** —
run it with a multi-module Gradle project open. It:

1. Parses `settings.gradle(.kts)` for every `include(...)` module.
2. Parses each module's own `build.gradle(.kts)` for `project(...)`
   references to other modules in the project.
3. Reports real cycles first, in their own section, never mixed
   silently into the regular list — `:a -> :b -> :a`. No cycles?
   Says so explicitly.
4. Groups the rest into layers by dependency depth.

```
⚠️  1 cycle(s) detected:
  :app -> :libs:core -> :app

Layers (by dependency depth):
  [0] :libs:util
  [1] :libs:core  ->  :libs:util
```

**Known limitation, honestly noted:** a project that computes its
module list or `project(...)` targets programmatically (a loop, a
variable resolved at Gradle-evaluation time) needs a real Gradle
evaluation to resolve — out of scope for static text analysis, same
limitation the IntelliJ-family version documents. Literal
`include(...)`/`project(...)` string arguments — the overwhelming
majority of real projects — are handled correctly.

## Privacy

See [PRIVACY.md](PRIVACY.md) — zero network calls, zero Gradle daemon,
everything runs against files already in your workspace.

## Development

```bash
npm install
npm run compile   # or: npm run watch
npm test
```

Press F5 (with this folder open) to launch an Extension Development
Host against a real multi-module Gradle project. To build an
installable package without publishing:

```bash
npx @vscode/vsce package
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
