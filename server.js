'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const { createJob, getJob, updateJob } = require('./src/jobs');
const { generateVideo } = require('./src/pipeline');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const OUTPUT_DIR = path.join(ROOT, 'output');
const TMP_DIR = path.join(ROOT, 'tmp');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/output', express.static(OUTPUT_DIR));

const MAX_SCRIPT_CHARS = 6000;

app.post('/api/generate', (req, res) => {
  const { script, voiceId, captions } = req.body || {};

  if (!script || typeof script !== 'string' || !script.trim()) {
    return res.status(400).json({ error: 'Please provide a non-empty script.' });
  }
  if (script.length > MAX_SCRIPT_CHARS) {
    return res.status(400).json({ error: `Script is too long (max ${MAX_SCRIPT_CHARS} characters).` });
  }

  // Sanity-check env up front so failures show immediately rather than
  // after the first API call.
  if (!process.env.PEXELS_API_KEY || !process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'Server is missing PEXELS_API_KEY or ELEVENLABS_API_KEY. Check your .env file.' });
  }

  const job = createJob();
  const workDir = path.join(TMP_DIR, job.id);
  const outPath = path.join(OUTPUT_DIR, `${job.id}.mp4`);

  updateJob(job.id, { status: 'running', message: 'Starting...' });

  generateVideo({
    script: script.trim(),
    voiceId: voiceId && voiceId.trim() ? voiceId.trim() : undefined,
    captions: captions !== false,
    workDir,
    outPath,
    onProgress: (update) => {
      updateJob(job.id, {
        message: update.message,
        scene: update.scene ?? null,
        total: update.total ?? null,
      });
    },
  })
    .then((result) => {
      updateJob(job.id, {
        status: 'done',
        message: 'Done.',
        videoUrl: `/output/${job.id}.mp4`,
        credits: result.credits,
      });
    })
    .catch((err) => {
      console.error(`[job ${job.id}] failed:`, err);
      updateJob(job.id, { status: 'error', error: err.message || String(err) });
    })
    .finally(() => {
      // Best-effort cleanup of per-scene scratch files; keep final output.
      fs.rm(workDir, { recursive: true, force: true }, () => {});
    });

  res.json({ jobId: job.id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unknown job id.' });
  res.json(job);
});

app.listen(PORT, () => {
  console.log(`Text-to-video app running at http://localhost:${PORT}`);
});
