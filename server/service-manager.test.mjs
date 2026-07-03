import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { localTeamServerUrls, readOrCreateAccessKey, serviceAccessKeyPath, serviceRuntime } from './service-manager.mjs'

test('service runtime uses packaged app executable when available', () => {
  const runtime = serviceRuntime({
    appExecutablePath: '/Applications/CrewFlow.app/Contents/MacOS/CrewFlow',
    nodePath: '/usr/local/bin/node',
    serverScript: '/repo/server/crewflow-server.mjs',
  })

  assert.equal(runtime.mode, 'app')
  assert.equal(runtime.executable, '/Applications/CrewFlow.app/Contents/MacOS/CrewFlow')
  assert.deepEqual(runtime.args, ['/repo/server/crewflow-server.mjs'])
  assert.deepEqual(runtime.env, { ELECTRON_RUN_AS_NODE: '1' })
  assert.equal(runtime.processMatch, '*crewflow-server.mjs*')
})

test('service runtime falls back to node server script in development', () => {
  const runtime = serviceRuntime({
    nodePath: '/usr/local/bin/node',
    serverScript: '/repo/server/crewflow-server.mjs',
  })

  assert.equal(runtime.mode, 'node')
  assert.equal(runtime.executable, '/usr/local/bin/node')
  assert.deepEqual(runtime.args, ['/repo/server/crewflow-server.mjs'])
  assert.equal(runtime.processMatch, '*crewflow-server.mjs*')
})

test('local team server urls prefer non-internal IPv4 addresses', () => {
  const urls = localTeamServerUrls({
    port: 8787,
    interfaces: {
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      en0: [{ address: '192.0.2.10', family: 'IPv4', internal: false }],
      en1: [{ address: '198.51.100.12', family: 'IPv4', internal: false }],
    },
  })

  assert.deepEqual(urls, ['http://192.0.2.10:8787', 'http://198.51.100.12:8787', 'http://127.0.0.1:8787'])
})

test('service access key is created once in the server data directory', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crewflow-key-'))

  try {
    const keyPath = serviceAccessKeyPath({ platform: 'darwin', homeDir: dir, env: {} })
    const firstKey = await readOrCreateAccessKey({ platform: 'darwin', homeDir: dir, env: {} })
    const secondKey = await readOrCreateAccessKey({ platform: 'darwin', homeDir: dir, env: {} })
    const savedKey = await readFile(keyPath, 'utf8')

    assert.match(firstKey, /^[A-Za-z0-9_-]{20,}$/)
    assert.equal(secondKey, firstKey)
    assert.equal(savedKey.trim(), firstKey)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('service access key prefers the explicit environment value', async () => {
  const key = await readOrCreateAccessKey({
    platform: 'darwin',
    homeDir: '/Users/example',
    env: { CREWFLOW_ACCESS_KEY: ' explicit-key ' },
  })

  assert.equal(key, 'explicit-key')
})

test('server modules can be imported when process argv has no script path', () => {
  const script = `
    process.argv[1] = undefined;
    await import('./server/service-manager.mjs');
    await import('./server/crewflow-server.mjs');
    console.log('import ok');
  `
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.match(output, /import ok/)
})
