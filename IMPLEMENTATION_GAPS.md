# Implementation gaps

Source audit: 17 October 2026. This compares the supplied PS2 client and Pike server with the browser client. It is not a complete playthrough of every room or quest.

## Working foundation

The browser converts and displays all 32 supplied village rooms and their available models and textures. It connects through the Node gateway to Pike for authoritative movement and world rules. Character creation, login, movement, melee combat, NPC and item updates, interactions, reading panels, inventory use and drop, shops, player/score lists, sound effects, and music have browser paths. The integration test covers registration, the initial church snapshot, one accepted movement, the login guard, and logout. Several other features have been exercised manually, but are not covered by that test.

## Remaining browser features

1. **Magic missile visual verification.** The browser sends `spell <direction>` from Circle/B, C, or the Magic missile button. It handles Pike's `017 ROTATEY`, `022 SPEED`, and paired `003 LOCATE` messages, preloads the spell model and atlas, and moves the projectile at the original client's speed. Its `025` point light follows the visible missile. An isolated level-5 Pike test confirms the cast and projectile messages, and a separate browser preview showed the spell and success message. A real playthrough is still needed for visual comparison with the PS2 effect. Relevant sources: `Client/main.cpp`, `Server/game.pike:274`, `browser/src/main.ts`, `tools/test-spell-live.py`.
2. **Lighting fidelity.** The browser now follows Pike's `024 LIGHT` and `025 PLON`/`PLOFF`/`PLCOLOUR` messages for dark areas, carried sticks and torches, dropped lights, and spells. Its Three.js light intensities and falloff are approximate; compare them visually with PS2 references. Relevant sources: `Client/light.cpp`, `Server/pointlight.pike`, `browser/src/main.ts`.
3. **Communication and help verification.** The browser now offers local `say`, global `shout`, private `tell` from the Players list, and a Help topic browser. It handles Pike's `016 HEL` replies. Private messages use Pike's original ordered `tell <player>` then `say <message>` sequence. Verify two-player delivery and controller selection in a live playthrough. Relevant sources: `Client/selectmode.cpp`, `Server/connect.pike`, `Server/help/`, `browser/src/main.ts`.
4. **Full directional controls.** The current browser intentionally disables A/D and horizontal/diagonal movement controls. The PS2 pad could move in eight camera relative directions. The present W/S plus Q/E scheme still needs the agreed left/right behavior and a touch equivalent. Relevant sources: `Client/main.cpp:688`, `browser/src/main.ts:228`, `RENDERING.md`.
5. **Rotation and animation fidelity.** The browser applies `019 ROTATE` immediately where the original client eased rotation. It handles the spell's `017 ROTATEY` and `022 SPEED`, but a general `017 ROTATE` remains unsupported. Relevant sources: `Client/blob.cpp:374`, `Client/main.cpp:780`, `browser/src/main.ts`.

## Reliability and finish work

- **Character possessions across server restarts.** Original `Server/player.pike:117` saves a fraction of carried item value as gold, but does not save the items or equipped state. The new version currently inherits this behavior. Decide whether inventory persistence is required before treating characters as durable.
- **Connection recovery.** A WebSocket close leaves the browser offline until sign-out/sign-in. A reconnect action, backed by a fresh Pike snapshot, would make routine gateway or network interruptions less disruptive. See `browser/src/main.ts:879`.
- **Broader verification.** The automated integration test does not cover two simultaneous browser players, combat and death, spells, quests, shops, frog transformations, mail, or movement through all rooms. Add targeted tests for the features above and run a structured room/quest playthrough.
- **Visual comparison.** Lighting, transparency, real-time cast shadows, small seams between geometry, and the elevator platform alignment are still approximate relative to PS2 output. See `RENDERING.md` for known interpretations and reference-dependent details.
- **Public hosting.** The current setup is local development. VPS deployment still needs the HTTPS reverse proxy, process supervision, backups of the account database, Pike credential key and player files, and a review of the original and converted art before publishing it. See `DEVELOPMENT.md` and `ARCHITECTURE.md`.

After verifying communication and the spell effect in a live playthrough, the next browser feature is fuller directional movement and character rotation fidelity.
