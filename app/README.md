# LoreMaster

LoreMaster is a local, shared-screen fantasy RPG prototype. Up to four players take turns using individual characters, gear, abilities, and real dice. The included **The Shattered Bell** adventure is deterministic, so it can be demonstrated without a model account, paid service, or network connection.

## Run it

Install Node.js 20 or newer. From the `app/` directory:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Make a party with **Start an adventure**, or choose **Load guided demo** to get a four-character party with a ready-made scene. Use the suggested actions or type in the conversation field. The browser saves the latest campaign in localStorage; refreshing resumes it.

To create a production build and run the focused rules tests:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The app has no server and requires no environment variables. Speech recognition is optional, browser-dependent, and may require a secure browser context; text input always works. Dice use `crypto.getRandomValues` with rejection sampling.

## Alexa+ hackathon demo

This app demonstrates a **simulated Alexa+ style conversational experience**: the page shows listening/processing/response states, offers microphone input when the browser supports speech recognition, and accepts the same actions by text and buttons. The local intent handler validates requests and applies game rules before the narrator responds. The visible confirmation and campaign log show the resulting state changes.

LoreMaster is **not connected to Alexa+** and does not use Amazon’s Alexa+ SDK, partner-only tools, an Agent Skill, or an MCP server. The Amazon Developer Hackathon page currently describes a simulated web experience as one Alexa+ path; check the live [track rules](https://amazonappdev2026.devpost.com/) and [FAQ](https://amazonappdev2026.devpost.com/details/faqs) again before submission. The selected path must still be eligible on submission day.

## Architecture

- `src/game.ts`: typed campaign and character state, catalog and class definitions, validated inventory operations, modifier/defense calculation, fair dice, and deterministic narration.
- `src/App.tsx`: party setup, adventure interface, local intent routing, game actions, voice input, campaign log, and local persistence.
- `src/styles.css`: responsive dark-fantasy interface, reduced-motion support, keyboard focus styling.
- `src/game.test.ts`: targeted tests for dice, health boundaries, inventory operations, gear slots, classes, and modifiers.
- `src/speech.d.ts`: small browser Speech Recognition type definitions.

The narrator is intentionally local and deterministic for demo reliability. The MVP does not send data to an external model. User text is interpreted by the local command handler; it never directly writes health or inventory. The validated operation updates the structured campaign, and the narration is appended afterward.

## Guided demo walkthrough

1. From the landing screen select **Load guided demo**; if a campaign is already active, confirm replacement.
2. Select Finn (Rogue), then use **Investigate** or type “I search the room.” The app rolls a d20 plus WIS against DC 12. A success finds the moon seal; a failure reveals muddy tracks and a complication.
3. Inspect the pack and select an item. Use a healing potion after a character has lost health to see health and quantity update. Equip or unequip gear and inspect the character tab.
4. Ask Mara about the bell or go to the chapel to advance the story and objectives. Use a different character to take their turn.
5. Refresh the page. The party, scene, inventory, objectives, and chronicle resume from localStorage.

The demo party starts slightly wounded so you can demonstrate a healing potion right away. To show combat, ask about the bell, travel to the chapel, and attack the guardian; each attack displays the hit roll, damage roll, enemy counterattack, and health change. You can also use the moon seal to resolve the encounter without fighting.

## Rules and limitations

- The rules are a small, original D&D-inspired subset, not a complete implementation of D&D or any licensed ruleset. Level-one class attributes, defense, one simple ability per class, d20 checks vs DC 12, and small damage/healing effects are implemented.
- The deterministic story has an inn scene, investigation, and chapel encounter. It tracks guardian health; attacks roll to hit and roll weapon damage, while misses deal a small counterattack. The moon seal is a nonviolent resolution. Class abilities have one use per adventure; healing abilities restore health and other abilities grant a one-check or one-attack bonus. Conditions and a full initiative system are not implemented.
- Local intent handling is keyword-based, so ambiguous requests need a clearer phrase. Suggested buttons and the dice/action controls provide reliable alternatives.
- localStorage is device/browser-local, not encrypted or synced. This is a single-device prototype, with no accounts, remote saves, MCP integration, or multiplayer.
- A default campaign can be resumed by refreshing. Starting over or loading a demo when a campaign exists prompts before replacing it.

## Technologies

React, TypeScript, Vite, Vitest, Lucide React, browser localStorage, Web Speech Recognition (optional), and the Web Crypto API. The visual uses Unicode item and class glyphs so no remote image service or assets are needed.

## Attribution and license

The implementation in this `app/` folder was written for LoreMaster and does not copy GameMasterAI source or prompt files. GameMasterAI remains unchanged. Its upstream repository declares MIT in its license file; that license and the README metadata disagree about project licensing, so verify upstream terms before copying its code or assets. This app uses a new MIT license.
