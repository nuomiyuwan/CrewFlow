import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = packageJson.version
const tag = `v${version}`
const repo = 'nuomiyuwan/CrewFlow'
const releaseDirectory = path.join(root, 'release')
const assets = [
  `CrewFlow-v${version}-macOS-universal.dmg`,
  `CrewFlow-v${version}-Windows-x64-Setup.exe`,
  `CrewFlow-v${version}-Windows-x64-Setup.exe.blockmap`,
  'latest.yml',
  `CrewFlow-v${version}-SHA256SUMS.txt`,
].map((name) => path.join(releaseDirectory, name))

function run(args, { allowFailure = false } = {}) {
  const result = spawnSync('gitcode', args, { cwd: root, encoding: 'utf8', stdio: allowFailure ? 'pipe' : 'inherit' })
  if (!allowFailure && result.status !== 0) process.exit(result.status || 1)
  return result
}

for (const asset of assets) {
  if (!existsSync(asset)) {
    console.error(`缺少安装包文件：${path.relative(root, asset)}`)
    process.exit(1)
  }
}

const latestYml = readFileSync(path.join(releaseDirectory, 'latest.yml'), 'utf8')
if (!new RegExp(`^version:\\s*${version.replace(/\./g, '\\.')}\\s*$`, 'm').test(latestYml)) {
  console.error(`release/latest.yml 与当前版本 ${version} 不一致`)
  process.exit(1)
}

const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const escapedVersion = version.replace(/\./g, '\\.')
const notes = changelog.match(new RegExp(`## ${escapedVersion}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim()
  || `CrewFlow ${tag} 正式安装包。`
const releaseExists = run(['release', 'view', tag, '-R', repo, '--json', '--no-interactive'], { allowFailure: true }).status === 0

if (!releaseExists) {
  run([
    'release',
    'create',
    tag,
    '-R',
    repo,
    '--target',
    'main',
    '--title',
    `CrewFlow ${tag}`,
    '--notes',
    notes,
    '--no-interactive',
  ])
}

run(['release', 'upload', tag, ...assets, '-R', repo, '--no-interactive'])
console.log(`GitCode ${tag} 安装包镜像上传完成。此命令不会推送源码。`)
