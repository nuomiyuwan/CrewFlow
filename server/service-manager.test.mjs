import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { localTeamServerUrls, serviceRuntime } from './service-manager.mjs'

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
      en0: [{ address: '192.168.31.163', family: 'IPv4', internal: false }],
      en1: [{ address: '10.0.0.12', family: 'IPv4', internal: false }],
    },
  })

  assert.deepEqual(urls, ['http://192.168.31.163:8787', 'http://10.0.0.12:8787', 'http://127.0.0.1:8787'])
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
