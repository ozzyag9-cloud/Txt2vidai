'use strict';

const { randomUUID } = require('crypto');

const jobs = new Map();

function createJob() {
  const id = randomUUID();
  const job = {
    id,
    status: 'queued', // queued | running | done | error
    message: 'Queued...',
    scene: null,
    total: null,
    videoUrl: null,
    credits: null,
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  jobs.set(id, job);
  return job;
}

module.exports = { createJob, getJob, updateJob };
