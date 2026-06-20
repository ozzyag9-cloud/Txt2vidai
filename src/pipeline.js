'use strict';

const fs = require('fs');
const path = require('path');

const { buildSceneList } = require('./scriptSplitter');
const { findSceneVideo, downloadFile } = require('./pexels');
const { synthesizeToFile } = require('./elevenlabs');
const { getDuration, buildSceneClip, concatClips } = require('./ffmpeg');

const ORIENTATION = 'landscape'; // locked to 16:9 horizontal per project spec
const RESOLUTION = { width: 1920, height: 1080 };

/**
 * Run the full text -> video pipeline for one job.
 *
 * @param {object} opts
 * @param {string} opts.script - the full narration script
 * @param {string} [opts.voiceId] - ElevenLabs voice ID override
 * @param {boolean} [opts.captions] - burn in captions (default true)
 * @param {string} opts.workDir - scratch directory for this job
 * @param {string} opts.outPath - final mp4 destination
 * @param {(update: object) => void} [opts.onProgress] - progress callback
 */
async function generateVideo({ script, voiceId, captions = true, workDir, outPath, onProgress = () => {} }) {
  await fs.promises.mkdir(workDir, { recursive: true });

  const scenes = buildSceneList(script);
  if (!scenes.length) throw new Error('Could not find any sentences in that script.');

  onProgress({ stage: 'split', message: `Split script into ${scenes.length} scene(s).` });

  const clipPaths = [];
  const credits = [];

  for (const scene of scenes) {
    const n = scene.index + 1;
    const total = scenes.length;

    onProgress({ stage: 'footage', message: `Finding stock footage (scene ${n}/${total})...`, scene: n, total });
    const found = await findSceneVideo(scene.query, ORIENTATION);
    if (!found) throw new Error(`No stock footage found for scene ${n} ("${scene.query}").`);

    const videoTmpPath = path.join(workDir, `scene_${n}_raw.mp4`);
    await downloadFile(found.file.link, videoTmpPath);
    if (found.credit && found.credit.photographer) {
      credits.push({ scene: n, ...found.credit, query: found.queryUsed });
    }

    onProgress({ stage: 'voice', message: `Generating voiceover (scene ${n}/${total})...`, scene: n, total });
    const audioTmpPath = path.join(workDir, `scene_${n}.mp3`);
    await synthesizeToFile(scene.text, audioTmpPath, { voiceId });
    const duration = await getDuration(audioTmpPath);

    onProgress({ stage: 'render', message: `Rendering scene ${n}/${total}...`, scene: n, total });
    const clipPath = path.join(workDir, `scene_${n}.mp4`);
    await buildSceneClip({
      videoPath: videoTmpPath,
      audioPath: audioTmpPath,
      duration,
      captionText: scene.text,
      outPath: clipPath,
      width: RESOLUTION.width,
      height: RESOLUTION.height,
      captions,
      workDir,
    });

    clipPaths.push(clipPath);
  }

  onProgress({ stage: 'concat', message: 'Combining scenes into the final video...' });
  await concatClips(clipPaths, outPath);

  onProgress({ stage: 'done', message: 'Done.' });

  return { outPath, scenes, credits };
}

module.exports = { generateVideo };
