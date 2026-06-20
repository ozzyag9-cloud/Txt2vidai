# Script to Video

Paste a script, get back a narrated 16:9 video. Under the hood it:

1. Splits your script into scenes (roughly one sentence-group each).
2. Searches [Pexels](https://www.pexels.com) for stock footage matching each scene's keywords.
3. Generates a voiceover for each scene's text with [ElevenLabs](https://elevenlabs.io).
4. Renders each scene with ffmpeg (crop to 1920x1080, burn in captions, attach the voiceover), then concatenates all scenes into one mp4.

It does **not** generate new video content from scratch — there's no AI video model involved. It assembles a narrated video from real stock footage, which is what's achievable with a TTS API + a stock-footage API.

## Prerequisites

- **Node.js 18+**
- **ffmpeg and ffprobe** installed and on your PATH
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: [ffmpeg.org/download.html](https://ffmpeg.org/download.html), then add the `bin` folder to PATH
- A **Pexels API key** — free, from [pexels.com/api](https://www.pexels.com/api/)
- An **ElevenLabs API key** and a **voice ID** — from your ElevenLabs dashboard (Profile → API Keys; voice IDs under Voices, or the Voice Library)

## Setup

```bash
npm install
cp .env.example .env
# then edit .env and fill in PEXELS_API_KEY and ELEVENLABS_API_KEY
npm start
```

Open `http://localhost:3000`.

You can either set `ELEVENLABS_VOICE_ID` in `.env` as a default, or paste a voice ID into the form each time.

## Deploy (Render, free tier)

The app is containerized (`Dockerfile`) so ffmpeg and fonts come with it — no platform-specific buildpack config needed. Render's free tier runs Docker web services with no credit card required (services sleep after 15 min idle, ~30-60s cold start on the next request — fine for a personal tool, not for production traffic).

**1. Push this folder to a new GitHub repo:**

```bash
cd texttovideo-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Create the empty repo on GitHub first if you haven't — no README/license, just the bare repo — then use its URL above.)

**2. Deploy on Render:**

- Go to the Render dashboard → **New** → **Blueprint**
- Connect the GitHub repo you just pushed
- Render reads `render.yaml` automatically and creates the web service
- It'll prompt you for the three secret env vars: `PEXELS_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` — paste them in
- Click **Apply** / **Create**

No `render.yaml`/Blueprint UI on your account? Use **New → Web Service** instead, connect the repo, set **Environment: Docker** (Render should auto-detect the Dockerfile), add the same three env vars under the service's **Environment** tab, then create the service.

**3. Wait for the build to finish** — you'll get a live URL like `https://script-to-video-xxxx.onrender.com`.

### Testing the Docker build locally first (optional, recommended)

```bash
docker build -t script-to-video .
docker run --rm -p 3000:3000 --env-file .env script-to-video
```

Open `http://localhost:3000` — if it works here, it'll work on Render.

### Other hosts

Anything that runs an arbitrary Docker container with a writable filesystem works: **Fly.io**, **Railway**, a plain VPS with Docker installed, Google Cloud Run, etc. Avoid serverless/edge function platforms (Vercel/Netlify functions, Cloudflare Workers) — they typically can't run the `ffmpeg` binary and impose short execution timeouts that don't suit video rendering.

## Notes & limitations

- **Pexels attribution**: Pexels' API terms ask that you credit photographers when you use their footage. The app records a photographer + source link per scene and shows it under "Footage credits" below the generated video — keep that around if you publish anything made with this.
- **Scene matching is keyword-based, not semantic.** Each scene's stock footage comes from a plain keyword search, so unusual or abstract sentences may pull loosely related footage. If a scene's search comes back empty, it falls back through a few generic queries (abstract background, nature, city, technology) rather than failing the whole job.
- **Captions** are burned in via ffmpeg's `drawtext`, using whatever system font is found (DejaVu Sans Bold / Liberation Sans Bold / Arial Bold, depending on OS). If none of those exist on your system, install one (e.g. `sudo apt install fonts-dejavu-core` on Debian/Ubuntu) or captions will fail to render.
- **Processing is sequential and synchronous per job** — a longer script means more scenes, more API calls, and more ffmpeg renders, so generation can take a while. The UI polls a job-status endpoint and shows progress per scene.
- **In-memory job store.** Restarting the server loses in-progress job status (finished video files in `output/` are unaffected, just not linked to status anymore).
- **This is a single-user/local tool**, not hardened for multi-tenant production use (no auth, no rate limiting, no persistent job queue).

## Project structure

```
server.js              Express app + job API
src/scriptSplitter.js  Script -> scenes + search keywords
src/pexels.js          Stock footage search/download
src/elevenlabs.js      Text-to-speech
src/ffmpeg.js          Per-scene render (crop, captions, mux) + concat
src/pipeline.js        Orchestrates the steps above per job
src/jobs.js            In-memory job status store
public/                Frontend (HTML/CSS/JS)
Dockerfile             Container image (Node + ffmpeg + fonts)
render.yaml            Render Blueprint (one-click deploy config)
```
