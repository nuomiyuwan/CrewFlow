import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { LibraryFileTooLargeError, createLibraryFileStore, maxLibraryFileBytes } from './library-file-store.mjs'

test('library file store accepts document bodies up to the 200 MB product limit', () => {
  assert.equal(maxLibraryFileBytes, 200 * 1024 * 1024)
})

test('library file store keeps file bodies and metadata together', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'crewflow-library-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = createLibraryFileStore({ directory, maxBytes: 64 })

  const written = await store.write('document-1', Buffer.from('hello'), {
    fileName: '../guide.txt',
    mimeType: 'text/plain',
  })
  assert.equal(written.fileName, 'guide.txt')
  assert.equal(written.size, 5)

  const read = await store.read('document-1')
  assert.equal(read.data.toString('utf8'), 'hello')
  assert.equal(read.metadata.mimeType, 'text/plain')

  await assert.rejects(
    () => store.write('document-2', Buffer.alloc(65), { fileName: 'large.txt' }),
    LibraryFileTooLargeError,
  )

  await store.remove('document-1')
  await assert.rejects(() => store.read('document-1'), { code: 'ENOENT' })
})
