# LoreMaster

LoreMaster is a browser-based, shared-screen fantasy RPG for up to four players. It includes the *Shattered Bell* adventure, character classes, an item inventory, equipment, dice and combat, a campaign log, and browser-local save/resume.

The game is playable without a language model. A dedicated deterministic command interpreter and the authoritative game engine handle game actions. LM Studio is an optional local assistant that only proposes a structured action; LoreMaster validates and executes it through the same game engine. It cannot set health, inventory, dice outcomes, or quest state.

## Windows requirements

- Windows 10 or 11.
- Git for Windows: [git-scm.com/download/win](https://git-scm.com/download/win).
- Node.js **22.12 or newer**. Node.js **24 LTS** is recommended. Install it from [nodejs.org](https://nodejs.org/en/download/), leaving the option to add Node to PATH enabled. Close and reopen PowerShell after installing.

Check that the commands are available:

```powershell
git --version
node --version
npm --version
```

## Clone and run

In PowerShell, clone the LoreMaster GitHub repository and enter the app folder:

```powershell
git clone https://github.com/Coding-DonePainfully/LoreMaster.git
cd LoreMaster\app
npm ci
npm run dev
```

Open the local URL Vite prints, usually [http://localhost:5173](http://localhost:5173). Keep that PowerShell window open while playing. Press **Ctrl+C** there to stop LoreMaster.

Choose **Load guided demo** on the landing screen to begin the reproducible *Shattered Bell* adventure. Campaign state is saved in that browser's local storage; refreshing resumes it.

## Run without AI

No API key, local model, or LM Studio installation is required. Run LoreMaster normally with the commands above. If the local model is offline or unavailable, the app reports **Offline fallback** or **AI unavailable** and uses the deterministic command parser. You can also turn interpretation off with the **AI On/Off** control in the game header. Buttons and suggestions remain available in fallback mode.

## Optional LM Studio setup

1. Install [LM Studio](https://lmstudio.ai/download).
2. In LM Studio's model search/discovery view, download an instruction-following model that fits your PC's memory. Load the downloaded model in LM Studio. Model speed and structured-action accuracy depend on the chosen model and hardware.
3. Open LM Studio's **Developer** tab and turn on **Start server**. LM Studio's OpenAI-compatible API uses port `1234` by default. Its `/v1/models` and `/v1/chat/completions` endpoints are the endpoints LoreMaster uses. See the [LM Studio local server guide](https://lmstudio.ai/docs/developer/core/server) and [OpenAI-compatible endpoint guide](https://lmstudio.ai/docs/developer/openai-compat).
4. In a separate PowerShell window, run LoreMaster from `LoreMaster\app`:

   ```powershell
   npm run dev
   ```

The defaults are `http://127.0.0.1:1234/v1`, the first model reported as loaded by LM Studio, and a 90-second backend inference timeout. Model-list availability checks have a separate 2.2-second timeout. The browser allows 95 seconds for interpretation, shows a processing indicator, and falls back to the built-in parser if the backend reports failure or times out. A request only proposes one action; it is executed once by the game engine after a valid response.

To change the endpoint, selected model, or backend timeout, copy the example configuration once from the app folder:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```dotenv
LOREMASTER_LM_STUDIO_URL=http://127.0.0.1:1234/v1
LOREMASTER_LM_STUDIO_MODEL=
LOREMASTER_LM_STUDIO_TIMEOUT_MS=90000
LOREMASTER_LM_STUDIO_STATUS_TIMEOUT_MS=2200
```

Leave the model setting blank to select the first loaded model, or set it to the exact model ID returned by LM Studio. Restart `npm run dev` after changing `.env`. No API key is used or needed. `.env` is ignored by Git.

LoreMaster binds its web server to `127.0.0.1` by default. The LM Studio address is restricted to loopback hosts so the app cannot be configured to send prompts to a public model endpoint. For a future demo on a trusted local network, the Vite host can be changed with `LOREMASTER_HOST=0.0.0.0`; expose the LoreMaster page only to that trusted network and keep LM Studio bound to loopback. Do not expose either service to the public internet.

## Test, typecheck, and build

Run these from `LoreMaster\app`:

```powershell
npm test
npm run typecheck
npm run build
```

Tests mock LM Studio HTTP responses and do not require LM Studio or a downloaded model. The production files are generated under `dist`. Preview the build locally with:

```powershell
npm run preview
```

## Architecture

- `src/commands.ts` — normalizes and interprets player phrasing, resolves actual party and item references, asks for clarification when needed, and validates model proposals against the current campaign.
- `src/command-engine.ts` — the shared authoritative executor for conversational actions. It delegates dice, inventory, equipment, combat, class abilities, and quest operations to the game rules.
- `src/game.ts` — typed campaign and character state, class and item definitions, validated game operations, fair dice generation, and local narration.
- `src/local-ai-client.ts` — same-origin requests to check local model availability and request a proposal; quickly falls back on errors or timeouts.
- `server/local-ai.js` — a small Vite middleware API. It checks LM Studio's loaded models, sends a short current-state snapshot for interpretation, enforces the proposal schema, and only permits loopback LM Studio URLs.
- `vite.config.ts` — registers the local API in development and preview, with loopback binding by default.
- `src/storage.ts` — version-checked campaign storage in browser local storage.

The model receives the current scene, active character, compact party health and inventory, abilities, objectives, and supported action names. It does not receive the entire campaign log. It returns JSON actions only; malformed, unknown, ambiguous, or unavailable proposals are rejected and handled by the deterministic parser. The model does not narrate outcomes, roll dice, or mutate game state.

## Adventure and current limits

Supported commands include asking Mara about the bell, inspecting or searching, traveling to the chapel, making a check, attacking the guardian, using an ability, using/equipping/unequipping/dropping an item, switching characters, and asking for inventory or ability details. For example, try “Ask Mara what she knows about the bell,” “Have the Ranger investigate the chapel,” or “Offer the crescent to the stone creature.” The deterministic parser covers common variations and asks for clarification when a reference is ambiguous; it is not intended to understand every sentence.

The game uses a small original D&D-inspired rules subset, not a complete D&D edition. The adventure and narrator are local and fixed; an LLM improves request interpretation only. localStorage is device/browser-local and not encrypted or synchronized. Speech recognition is optional and browser-dependent; text input works everywhere.

LoreMaster is a simulated conversational experience. It is **not connected to Amazon Alexa+** and does not use an official Alexa+ SDK, partner tools, Agent Skill, or MCP server. Confirm current eligibility and submission rules with the official hackathon organizers.

## Troubleshooting

- **`git`, `node`, or `npm` is not recognized:** finish installing Git/Node, reopen PowerShell, and check the version commands above. If PowerShell blocks `npm` due to script policy, use `npm.cmd ci`, `npm.cmd run dev`, and similar commands.
- **Unsupported Node version:** check `node --version`. Install Node.js 24 LTS or at least Node 22.12.
- **`npm ci` cannot find the manifest or lockfile:** make sure the current directory is `LoreMaster\app`, which contains both `package.json` and `package-lock.json`.
- **The status says `Offline fallback`:** make sure a model is loaded in LM Studio and its Developer tab server is running on the configured port. In PowerShell, check `Invoke-RestMethod http://127.0.0.1:1234/v1/models`.
- **The status says `AI unavailable`:** the LoreMaster Vite API is not reachable; stop and restart `npm run dev`. The deterministic game still works without it.
- **The configured model is not found:** leave `LOREMASTER_LM_STUDIO_MODEL` blank or copy the exact ID from `/v1/models`, then restart Vite.
- **AI frequently falls back:** local inference may exceed the 90-second backend limit, or the model may return malformed or empty output. Try a faster loaded model. Supported actions and ordinary story questions still use the deterministic local parser when AI is unavailable.
- **Port 5173 is busy:** stop the other Vite process with Ctrl+C or open the alternate local address Vite prints.
- **Speech input is unavailable:** use the text input or suggested action buttons.

## License and attribution

The application in `app/` is licensed under MIT; see [LICENSE](LICENSE). GameMasterAI is a separate reference repository, and its source code and prompts are not copied into this application.
