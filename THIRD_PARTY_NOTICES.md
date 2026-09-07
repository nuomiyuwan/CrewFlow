# Third-Party Notices

## On-demand audio and video components

CrewFlow downloads unmodified, hash-verified FFmpeg and ffprobe 8.1.2 executables from shaka-project/static-ffmpeg-binaries n8.1.2-1. They run as separate local processes. These static builds are GPLv3-or-later licensed; the license text, source/build links and each binary's license output are retained with the components. No nonfree-enabled build is accepted.

https://github.com/shaka-project/static-ffmpeg-binaries/releases/tag/n8.1.2-1

https://ffmpeg.org/download.html

The NCM, UC, KWM and static QMC adapters are adapted from Unlock Music (MIT). The full attribution and license are included in `electron/audio/NOTICE.txt`. Audio and embedded covers are processed locally; no remote cover lookup is performed.

## On-demand document and image components

CrewFlow downloads version-pinned Python packages and verifies their distribution hashes. These components run locally and retain their bundled license notices. OCR model files are obtained from the RapidAI projects; document contents are not sent to model hosts.

| Component | License | Project |
| --- | --- | --- |
| uv | MIT or Apache-2.0 | https://github.com/astral-sh/uv |
| CPython / python-build-standalone | PSF and bundled third-party licenses | https://github.com/astral-sh/python-build-standalone |
| Pillow | HPND | https://github.com/python-pillow/Pillow |
| pillow-heif | BSD-3-Clause; bundled libheif and codecs retain their own licenses | https://github.com/bigcat88/pillow_heif |
| python-docx / openpyxl | MIT | https://github.com/python-openxml/python-docx / https://openpyxl.readthedocs.io/ |
| pdfplumber / pdfminer.six | MIT | https://github.com/jsvine/pdfplumber / https://github.com/pdfminer/pdfminer.six |
| pypdfium2 / PDFium | Apache-2.0 or BSD-3-Clause / BSD-style and third-party licenses | https://github.com/pypdfium2-team/pypdfium2 |
| RapidOCR / RapidTable | Apache-2.0 | https://github.com/RapidAI/RapidOCR / https://github.com/RapidAI/RapidTable |
| ONNX Runtime | MIT | https://github.com/microsoft/onnxruntime |

The selected RapidOCR PP-OCRv4 and RapidTable SLANet-plus models originate from PaddleOCR/PaddleX and their RapidAI ONNX distributions. Their upstream Apache-2.0 notices remain applicable. NumPy, OpenCV, lxml, and other pinned dependencies retain the license files in their installed distributions.

## LibreOffice

CrewFlow can download an unmodified LibreOffice runtime from The Document Foundation when document conversion is first used. LibreOffice is licensed under Mozilla Public License 2.0 and other applicable open-source licenses.

https://www.libreoffice.org/about-us/licenses/

Source code is available from:

https://download.documentfoundation.org/libreoffice/src/

## pdfcpu

CrewFlow can download the pdfcpu command-line tool for local PDF processing.

https://github.com/pdfcpu/pdfcpu

Apache License 2.0

## @hyzyla/pdfium 2.1.13

CrewFlow uses @hyzyla/pdfium for local PDF rendering and extraction.

https://github.com/hyzyla/pdfium

MIT License. PDFium and its third-party dependencies retain their respective BSD and other applicable license notices.

## docx 9.7.1

CrewFlow uses docx for DOCX document generation.

https://github.com/dolanmiu/docx

MIT License

## PptxGenJS 4.0.1

CrewFlow uses PptxGenJS for PPTX presentation generation.

https://github.com/gitbrent/PptxGenJS

MIT License

## pngjs 7.0.0

CrewFlow uses pngjs for PNG processing.

https://github.com/pngjs/pngjs

MIT License

## docx-preview

CrewFlow uses docx-preview to render Word documents in the built-in paginated preview.

https://github.com/VolodymyrBaydalka/docxjs

Apache License 2.0

Copyright Volodymyr Baydalka

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at:

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.

## ExcelJS

CrewFlow uses ExcelJS to read spreadsheet data and common cell styles for the built-in preview.

https://github.com/exceljs/exceljs

MIT License

Copyright (c) 2014-2019 Guyon Roche

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## holiday-cn

CrewFlow includes a bundled China public-holiday data snapshot and can retrieve updated holiday data from:

https://github.com/NateScarlet/holiday-cn

MIT License

Copyright (c) 2019 NateScarlet

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
