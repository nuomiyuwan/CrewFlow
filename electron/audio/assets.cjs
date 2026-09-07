const AUDIO_COMPONENT_VERSION = 'n8.1.2-1'
const AUDIO_ASSETS = {
  "darwin-arm64": [
    {
      "name": "ffmpeg-osx-arm64",
      "size": 34074040,
      "sha256": "e7b9fcd97f95f333512d6e8b8ac24d9dbc08f189f36047695499bd7b57214b22",
      "url": "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.1.2-1/ffmpeg-osx-arm64"
    },
    {
      "name": "ffprobe-osx-arm64",
      "size": 33882408,
      "sha256": "ded4c698b8ff38d0bc1fd30fcc5e768dc46f58bc15a8dfd61f98615ba49cde5c",
      "url": "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.1.2-1/ffprobe-osx-arm64"
    }
  ],
  "darwin-x64": [
    {
      "name": "ffmpeg-osx-x64",
      "size": 42745472,
      "sha256": "62c87854d851f202fc4a29bdda0fe7b6ebcddd37b863482ce1bdc81151b03fe4",
      "url": "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.1.2-1/ffmpeg-osx-x64"
    },
    {
      "name": "ffprobe-osx-x64",
      "size": 42555344,
      "sha256": "d530823f480a3c7eb6334f18a00197d1e9f1070e86172b9aa89c4bf4022bd879",
      "url": "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.1.2-1/ffprobe-osx-x64"
    }
  ],
  "win32-x64": [
    {
      "name": "ffmpeg-win-x64.exe",
      "size": 53763072,
      "sha256": "4044b3924c977ad31229d504c5d5b8685f9553124fbaff6e9c99048b42830341",
      "url": "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.1.2-1/ffmpeg-win-x64.exe"
    },
    {
      "name": "ffprobe-win-x64.exe",
      "size": 53558272,
      "sha256": "fc37ca23d31ee08bb8f7e108edf3822f6ef3efc1a8d306bbe0b779190230710b",
      "url": "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.1.2-1/ffprobe-win-x64.exe"
    }
  ]
}

module.exports = { AUDIO_COMPONENT_VERSION, AUDIO_ASSETS }
