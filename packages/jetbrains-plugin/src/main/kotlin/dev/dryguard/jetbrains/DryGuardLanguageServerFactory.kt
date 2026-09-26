package dev.dryguard.jetbrains

import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.LanguageServerFactory
import com.redhat.devtools.lsp4ij.client.LanguageClientImpl
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider
import java.io.File

/**
 * Launches `dryguard-lsp` (the same @dryguard/lsp-server used by every
 * other editor) as a subprocess over stdio, via LSP4IJ's generic process
 * connector. Node.js must be resolvable on PATH, or `dryguard.nodePath` set
 * in the IDE's LSP4IJ settings.
 *
 * This is intentionally the entire plugin: LSP4IJ handles diagnostics
 * rendering, code actions, and the client/server handshake. Adding real
 * IntelliJ-native UX later (a tool window, inline hints beyond LSP4IJ's
 * defaults, a "merge with match" quick fix wired to JetBrains' AI Assistant
 * the way the VS Code extension uses vscode.lm) is additive, not a rewrite.
 */
class DryGuardLanguageServerFactory : LanguageServerFactory {
    override fun createConnectionProvider(project: Project): StreamConnectionProvider {
        val pluginDir = File(javaClass.protectionDomain.codeSource.location.toURI()).parentFile
        val bundledServer = File(pluginDir, "dryguard-lsp/cli.js")
        val serverEntry = if (bundledServer.exists()) bundledServer.absolutePath else "dryguard-lsp"

        return object : StreamConnectionProvider {
            private var process: Process? = null

            override fun start() {
                val command = if (bundledServer.exists()) {
                    listOf("node", serverEntry)
                } else {
                    // Falls back to a globally installed `dryguard-lsp` (npm i -g @dryguard/lsp-server).
                    listOf("npx", "-y", "@dryguard/lsp-server")
                }
                process = ProcessBuilder(command)
                    .directory(project.basePath?.let(::File))
                    .redirectErrorStream(false)
                    .start()
            }

            override fun getInputStream() = process?.inputStream
            override fun getOutputStream() = process?.outputStream
            override fun getErrorStream() = process?.errorStream

            override fun stop() {
                process?.destroy()
                process = null
            }
        }
    }

    override fun createLanguageClient(project: Project) = LanguageClientImpl(project)
}
