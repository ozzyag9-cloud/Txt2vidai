(function () {
  'use strict';

  const form = document.getElementById('generate-form');
  const scriptInput = document.getElementById('script');
  const charcount = document.getElementById('charcount');
  const submitBtn = document.getElementById('submit-btn');

  const statusPanel = document.getElementById('status-panel');
  const statusMessage = document.getElementById('status-message');
  const filmstrip = document.getElementById('filmstrip');
  const eyebrow = document.querySelector('.eyebrow');

  const resultPanel = document.getElementById('result-panel');
  const resultVideo = document.getElementById('result-video');
  const downloadLink = document.getElementById('download-link');
  const creditsList = document.getElementById('credits-list');
  const resetBtn = document.getElementById('reset-btn');

  const errorPanel = document.getElementById('error-panel');
  const errorMessage = document.getElementById('error-message');
  const errorResetBtn = document.getElementById('error-reset-btn');

  let pollTimer = null;

  scriptInput.addEventListener('input', () => {
    charcount.textContent = String(scriptInput.value.length);
  });

  function showOnly(panel) {
    [statusPanel, resultPanel, errorPanel].forEach((p) => p.classList.add('hidden'));
    if (panel) panel.classList.remove('hidden');
  }

  function buildFilmstrip(total) {
    filmstrip.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const frame = document.createElement('div');
      frame.className = 'frame';
      filmstrip.appendChild(frame);
    }
  }

  function updateFilmstrip(scene, total) {
    if (!total) return;
    if (filmstrip.children.length !== total) buildFilmstrip(total);
    Array.from(filmstrip.children).forEach((frame, i) => {
      frame.classList.remove('active', 'done');
      if (i < (scene || 0) - 1) frame.classList.add('done');
      else if (i === (scene || 0) - 1) frame.classList.add('active');
    });
    eyebrow.textContent = `SCENE ${scene || 0} OF ${total}`;
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.textContent = isSubmitting ? 'Generating...' : 'Generate video';
  }

  async function pollJob(jobId) {
    let job;
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error(`Status check failed (${res.status})`);
      job = await res.json();
    } catch (err) {
      showError(err.message || 'Lost track of the job. Please try again.');
      setSubmitting(false);
      return;
    }

    if (job.status === 'error') {
      showError(job.error || 'Something went wrong while generating the video.');
      setSubmitting(false);
      return;
    }

    if (job.status === 'done') {
      showResult(job);
      setSubmitting(false);
      return;
    }

    statusMessage.textContent = job.message || 'Working...';
    if (job.total) updateFilmstrip(job.scene, job.total);

    pollTimer = setTimeout(() => pollJob(jobId), 1500);
  }

  function showResult(job) {
    stopPolling();
    showOnly(resultPanel);
    resultVideo.src = job.videoUrl;
    downloadLink.href = job.videoUrl;

    creditsList.innerHTML = '';
    if (job.credits && job.credits.length) {
      job.credits.forEach((c) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = c.pageUrl || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = `Scene ${c.scene}: footage by ${c.photographer || 'Pexels contributor'}`;
        li.appendChild(a);
        creditsList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'No footage credits recorded.';
      creditsList.appendChild(li);
    }
  }

  function showError(message) {
    stopPolling();
    showOnly(errorPanel);
    errorMessage.textContent = message;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    stopPolling();
    setSubmitting(true);
    showOnly(statusPanel);
    statusMessage.textContent = 'Starting...';
    filmstrip.innerHTML = '';
    eyebrow.textContent = 'STARTING';

    const payload = {
      script: scriptInput.value,
      voiceId: document.getElementById('voiceId').value,
      captions: document.getElementById('captions').checked,
    };

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      pollJob(data.jobId);
    } catch (err) {
      showError(err.message || 'Could not start the job.');
      setSubmitting(false);
    }
  });

  function reset() {
    stopPolling();
    showOnly(null);
    statusPanel.classList.add('hidden');
    resultPanel.classList.add('hidden');
    errorPanel.classList.add('hidden');
    eyebrow.textContent = 'SCENE 1 OF N';
    setSubmitting(false);
  }

  resetBtn.addEventListener('click', reset);
  errorResetBtn.addEventListener('click', reset);
})();
