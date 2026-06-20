'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  'C:\\Windows\\Fonts\\arialbd.ttf',
];

function findFont() {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`"${cmd}" was not found on PATH. Install ffmpeg and make sure ffmpeg/ffprobe are available.`));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(parseFloat(out.trim()));
      else reject(new Error(`ffprobe failed: ${err}`));
    });
  });
}

function quoteForFilter(value) {
  return `'${String(value).replace(/'/g, "'\\''" )}'`;
}

function wrapCaption(text, maxCharsPerLine = 42) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = (line + ' ' + word).trim();
    if (candidate.length > maxCharsPerLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  return lines.join('\n');
}

async function writeCaptionFile(text, filePath) {
  // drawtext's textfile content still honors \\ and % as special chars.
  const safe = text.replace(/\\/g, '\\\\').replace(/%/g, '%%');
  await fs.promises.writeFile(filePath, wrapCaption(safe), 'utf8');
}

/**
 * Render one scene: loop/trim the stock clip to the audio's exact length,
 * crop-to-fill the target resolution, optionally burn in the caption, and
 * mux with the narration audio.
 */
async function buildSceneClip({
  videoPath,
  audioPath,
  duration,
  captionText,
  outPath,
  width = 1920,
  height = 1080,
  captions = true,
  workDir,
}) {
  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
  ];

  if (captions && captionText) {
    const captionFile = path.join(workDir, `${path.basename(outPath, '.mp4')}.caption.txt`);
    await writeCaptionFile(captionText, captionFile);

    const font = findFont();
    const fontArg = font ? `fontfile=${quoteForFilter(font)}` : `font=${quoteForFilter('Sans')}`;

    filters.push(
      `drawtext=${fontArg}:textfile=${quoteForFilter(captionFile)}:fontsize=46:fontcolor=white:` +
      `box=1:boxcolor=black@0.55:boxborderw=18:line_spacing=8:` +
      `x=(w-text_w)/2:y=h-text_h-70`
    );
  }

  // Small buffer so the very last syllable of narration is never clipped.
  const outDuration = (duration + 0.15).toFixed(2);

  const args = [
    '-y',
    '-stream_loop', '-1',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-vf', filters.join(','),
    '-t', outDuration,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-pix_fmt', 'yuv420p',
    outPath,
  ];

  await run('ffmpeg', args);
}

async function concatClips(clipPaths, outPath) {
  const listPath = `${outPath}.list.txt`;
  const listContent = clipPaths
    .map((p) => `file ${quoteForFilter(path.resolve(p))}` )
    .join('\n');

  await fs.promises.writeFile(listPath, listContent, 'utf8');

  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath]);

  await fs.promises.unlink(listPath).catch(() => {});
}

module.exports = { getDuration, buildSceneClip, concatClips, findFont, wrapCaption };
