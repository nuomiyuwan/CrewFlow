import assert from 'node:assert/strict'
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
  assert.deepEqual(runtime.args, ['--team-server'])
  assert.equal(runtime.processMatch, '*--team-server*')
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
