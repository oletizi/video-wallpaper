# Video Wallpaper Generator (Daedalus Howell & Co.)

## Project Overview
This platform transforms long-form audio (e.g., podcast or radio show episodes) into YouTube-ready video content. Instead of static cover art, each upload generates bespoke, ambient "visual wallpaper"—subtle, slow-moving imagery that's optionally responsive to audio. Brand assets—logo intro, title card, lower-thirds, and end-screen—are overlaid automatically.

## Features
- Upload audio (WAV/MP3 ≤ 250 MB)
- Optional episode metadata (title, guest, summary)
- Optional branding assets (logo, sponsor bug)
- AI-generated visuals from style presets
- 1080p MP4 @ 30fps output
- Light audio-reactivity (pulse, color shift, drift)
- Automated overlays: logo intro, lower-thirds, title card, end screen
- Library of 3+ style presets (French New Wave, '80s Retro Chromatic, Wine-Country Dreamscape)
- Preview and approve short video clips
- Download or publish to YouTube

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:4321](http://localhost:4321) in your browser.

## Roadmap
- Audio analysis and keyframe generation
- AI-driven video wallpaper rendering
- Overlay automation
- YouTube integration
- Render logs and documentation

## License
See LICENSE file.

# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/withastro/astro/tree/latest/examples/minimal)
[![Open with CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/sandbox/github/withastro/astro/tree/latest/examples/minimal)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/withastro/astro?devcontainer_path=.devcontainer/minimal/devcontainer.json)

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
