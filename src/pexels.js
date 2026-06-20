'use strict';

const fs = require('fs');

const PEXELS_SEARCH_URL = 'https://api.pexels.com/videos/search';
const FALLBACK_QUERIES = ['abstract background', 'nature', 'city skyline', 'technology'];

function apiKey() {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error('PEXELS_API_KEY is not set (check your .env file)');
  return key;
}

async function searchVideos(query, { orientation = 'landscape', perPage = 12 } = {}) {
  const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Authorization: apiKey() } });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pexels search failed (${res.status}) for "${query}": ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.videos || [];
}

/**
 * Pick a reasonable mp4 rendition: smallest file that's at least 1280px
 * wide (HD), or the largest available if none reach that.
 */
function pickVideoFile(video) {
  const files = (video.video_files || [])
    .filter((f) => f.file_type === 'video/mp4' && f.width && f.height)
    .sort((a, b) => a.width - b.width);

  if (!files.length) return null;

  return files.find((f) => f.width >= 1280) || files[files.length - 1];
}

/**
 * Try the scene's own query, then generic fallbacks, until something with
 * a usable mp4 rendition turns up. Picks randomly among the top results so
 * repeated runs (and repeated scenes) don't all grab the exact same clip.
 */
async function findSceneVideo(query, orientation = 'landscape') {
  const queries = [query, ...FALLBACK_QUERIES];

  for (const q of queries) {
    let videos;
    try {
      videos = await searchVideos(q, { orientation });
    } catch (err) {
      if (q === queries[queries.length - 1]) throw err;
      continue;
    }

    if (!videos.length) continue;

    const pool = videos.slice(0, Math.min(5, videos.length));
    for (const video of pool.sort(() => Math.random() - 0.5)) {
      const file = pickVideoFile(video);
      if (file) {
        return {
          file,
          queryUsed: q,
          credit: {
            photographer: video.user && video.user.name,
            pageUrl: video.url,
          },
        };
      }
    }
  }

  return null;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download stock video (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buffer);
}

module.exports = { searchVideos, pickVideoFile, findSceneVideo, downloadFile };
