# LoreMaster

LoreMaster is a shared-screen fantasy RPG prototype for up to four players. Its local **The Shattered Bell** adventure includes character classes, inventory and equipment, dice, and a campaign saved in the browser.

The game works without an API key, cloud service, or local LLM. The built-in game master uses deterministic local narration and application code to interpret and validate actions. Optional microphone input depends on browser support; text input always works.

## Windows setup

### 1. Install Git and Node.js

1. Install **Git for Windows** from [git-scm.com/download/win](https://git-scm.com/download/win). The standard installer options are suitable for this project.
2. Install **Node.js 24 LTS** from [nodejs.org](https://nodejs.org/en/download/). Use the Windows installer and keep its option to add Node to PATH enabled. The current test tool requires Node.js 22.12 or newer; Node 24 LTS is the recommended version.
3. Close and reopen PowerShell, then check both installations:

   ```powershell
   git --version
   node --version
   npm --version
   ```

### 2. Clone the project and enter the app folder

Run these commands in PowerShell. They clone the LoreMaster GitHub repository and move into the application folder:

```powershell
git clone https://github.com/Coding-DonePainfully/LoreMaster.git
cd LoreMaster
cd app
```

If you already have a clone, open PowerShell in that checkout and run `cd app` instead of cloning it again.

### 3. Install dependencies and start LoreMaster

From inside `LoreMaster\app`, run:

```powershell
npm ci
npm run dev
```

`npm ci` installs the exact dependency versions recorded in `package-lock.json`. When Vite starts, open the local address it prints, usually [http://localhost:5173](http://localhost:5173). Keep the PowerShell window open while using the app. Press **Ctrl+C** in that window to stop the development server.

To demonstrate the adventure, select **Load guided demo** on the start screen. Campaign progress is saved in that browser's local storage; refresh the page to resume.

## Run checks and build

Run these in PowerShell from `LoreMaster\app`:

```powershell
npm run typecheck
npm test
npm run build
```

The production build is written to `app\dist`. To serve that build locally after building, run `npm run preview` and open the URL Vite prints.

## Troubleshooting

- **`git`, `node`, or `npm` is not recognized:** finish the installer, close and reopen PowerShell, then check the versions again. If Node was already installed, rerun its installer and ensure it is added to PATH.
- **Unsupported Node version or engine errors:** install Node.js 24 LTS and verify `node --version` reports `v24.x`. This project uses Vitest 5, which requires Node 22.12 or newer.
- **`npm ci` reports a lockfile or dependency error:** make sure you are in `LoreMaster\app` (the folder containing `package.json` and `package-lock.json`), then retry `npm ci`. Do not delete or edit the lockfile to work around the error.
- **PowerShell blocks `npm` because of script execution policy:** run the Windows command shim explicitly, for example `npm.cmd ci`, `npm.cmd run dev`, or `npm.cmd test`.
- **Port 5173 is already in use:** stop the other development server, or use the alternate local URL Vite prints if it selects another port.
- **The page is blank or stale after an update:** stop and restart the server with Ctrl+C and `npm run dev`, then refresh the page. Campaign data is stored per browser and is not synced between devices.
- **Microphone input is unavailable:** use the text box. Speech recognition is optional and browser-dependent.

## Alexa+ hackathon demonstration

LoreMaster presents a **simulated Alexa+ style experience** in a browser: a conversation panel, optional speech input, text fallback, visible responses, and suggestions. The local command handler validates actions and updates structured game state before narration is shown.

This app is **not connected to Amazon Alexa+** and does not use an official Alexa+ SDK, partner tools, Agent Skill, or MCP server. Confirm that the simulated web route is still eligible in the [official hackathon rules](https://amazonappdev2026.devpost.com/) and [FAQ](https://amazonappdev2026.devpost.com/details/faqs) before submission.

## Project structure

- `src/App.tsx` — React interface, party setup, action handling, dice controls, and campaign flow.
- `src/game.ts` — character and campaign types, class and item data, validated game operations, dice generation, and local narration.
- `src/storage.ts` — version-checked browser local storage for campaign save and resume.
- `src/styles.css` — responsive dark-fantasy interface.
- `src/App.test.tsx` and `src/game.test.ts` — interface and game-rule tests.
- `vite.config.ts` — Vite React configuration.
- `package.json` and `package-lock.json` — scripts and pinned dependency resolution.

There is no backend service, database, environment file, or external model call required. App state is stored in the current browser's local storage; it is not encrypted or synchronized to other devices.

## Technologies

React, TypeScript, Vite, Vitest, Lucide React, browser local storage, Web Crypto API for dice, and optional browser Speech Recognition.

## Rules and limitations

The rules are a small D&D-inspired subset, not a complete implementation of a D&D edition. The game includes eight level-one classes, a limited set of class abilities and equipment, d20 checks, and a fixed demo adventure. Natural-language commands use local keyword handling, so suggested actions and interface buttons are available when phrasing is unclear. Online multiplayer, accounts, cloud saves, and a live AI narrator are not included.

## License and attribution

The `app/` implementation is licensed under MIT; see [LICENSE](LICENSE). GameMasterAI is a separate reference repository. Its code and prompts are not copied into this application.
