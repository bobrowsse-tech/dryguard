// Gradle build for the DryGuard JetBrains plugin. Rather than reimplementing
// diagnostics/code-actions against the IntelliJ Platform's own PSI/inspection
// APIs (a large, JVM-only rewrite of logic that already lives in
// @dryguard/lsp-server), this plugin bundles LSP4IJ
// (https://github.com/redhat-developer/lsp4ij) and registers dryguard-lsp
// as a generic LSP server for the relevant file types. That's the same
// "thin client, one shared engine" approach as the VS Code extension.
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.0.20"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "dev.dryguard"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        create("IC", "2024.2") // IntelliJ IDEA Community, a recent stable version
        bundledPlugin("com.intellij.modules.json")
        // LSP4IJ ships as a plugin dependency, not a Maven artifact — declared
        // in plugin.xml's <depends> instead of here.
    }
}

intellijPlatform {
    pluginConfiguration {
        id.set("dev.dryguard.jetbrains")
        name.set("DryGuard")
        version.set(project.version.toString())
        ideaVersion {
            sinceBuild.set("242")
        }
    }
}

tasks {
    // Bundles the built @dryguard/lsp-server (Node.js) so the plugin doesn't
    // require the user to have it on PATH separately. Run
    // `pnpm --filter @dryguard/lsp-server build` first; see AGENTS.md.
    processResources {
        from("../lsp-server/dist") {
            into("dryguard-lsp")
        }
    }
}
