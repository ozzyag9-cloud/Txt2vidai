'use strict';

const fs = require('fs');

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set (check your .env file)');
  return key;
}

/**
 * Generate narration audio for a chunk of text and return it as a Buffer
 * (mp3). Throws with the API's error body on failure so bad voice IDs /
 * quota issues are easy to diagnose.
 */
async function synthesizeSpeech(text, { voiceId, modelId = 'eleven_multilingual_v2' } = {}) {
  const id = voiceId || process.env.ELEVENLABS_VOICE_ID;
  if (!id) throw new Error('No ElevenLabs voice ID provided (set one in the form or ELEVENLABS_VOICE_ID)');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey(),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function synthesizeToFile(text, destPath, opts = {}) {
  const buffer = await synthesizeSpeech(text, opts);
  await fs.promises.writeFile(destPath, buffer);
  return destPath;
}

module.exports = { synthesizeSpeech, synthesizeToFile };
