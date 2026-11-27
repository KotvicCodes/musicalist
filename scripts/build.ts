// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

import { build as bundle } from 'esbuild'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'dist')

export async function build(): Promise<void> {
    // Forge calls this function directly for start/package/make, so those entry
    // points must enforce the same strict checks as the build command.
    await promisify(execFile)(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit'], {
        cwd: root
    })
    await rm(output, { recursive: true, force: true })
    await mkdir(output, { recursive: true })
    await Promise.all([
        bundle({
            absWorkingDir: root,
            entryPoints: ['src/index.ts', 'src/preload.ts'],
            outdir: output,
            bundle: true,
            platform: 'node',
            format: 'cjs',
            target: 'es2022',
            packages: 'external'
        }),
        bundle({
            absWorkingDir: root,
            entryPoints: ['src/renderer.ts'],
            outdir: output,
            bundle: true,
            platform: 'browser',
            format: 'iife',
            target: 'es2022'
        }),
        ...['index.html', 'index.css'].map((file) =>
            copyFile(path.join(root, 'src', file), path.join(output, file))
        )
    ])
}

if (require.main === module) {
    build().catch((error: unknown) => {
        // Compiler diagnostics describe project code, not songs or responses.
        if (
            error &&
            typeof error === 'object' &&
            'stdout' in error &&
            typeof error.stdout === 'string'
        ) {
            process.stderr.write(error.stdout)
        }
        process.stderr.write('The application build failed.\n')
        process.exitCode = 1
    })
}
