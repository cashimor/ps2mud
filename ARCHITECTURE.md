# PS2MUD new version: architecture proposal

Status: proposed. Target: a playable game in a web browser.

Local feasibility check: Pike 8.0.1738 in Ubuntu WSL starts an isolated compatibility copy of the world server. A generated test character can log in and receive its initial room, and Node.js 24.22.0 can connect to the private TCP listener. See `DEVELOPMENT.md` for the reproducible setup and remaining test limits.

## What the source establishes

- `Server/connect.pike` accepts line commands and sends numbered line responses. `Client/COMMANDS` documents most response codes.
- `Server/game.pike`, `player.pike`, `living.pike`, and the room, monster, and item scripts own world rules. The server decides movement, collision, combat, inventory, and character state.
- The PS2 client owns input, camera, scene rendering, animation, audio, and interface. Its VU1 and DMA code implements PS2 graphics behavior; it is not a separate game rule system.
- `Server/rooms/*.room` contains scene descriptions using the same response vocabulary. `*.map` is a 100-by-100 room grid used by room logic. `*.pike` adds behaviors and triggers.
- `Server/resources` contains MilkShape ASCII meshes (`.txt`), animation recipes (`.ani`), and TIM2 textures (`.tm2`). The resource index lists 182 files, all present. The audio index lists 52 files, all present. There are 32 room scripts.
- The original image sources are mostly absent. `Server/resource/window.bmp` provides a useful reference for checking the TIM2 decoder, but other atlases need validation from their encoded data.

## Decision

Build the browser client directly. Use TypeScript, Three.js for 3D, and normal HTML/CSS for text, inventory, menus, and login. Keep Pike as the authoritative world server for the first playable version, provided it runs under a supported interpreter after small compatibility and path fixes. Put a narrow WebSocket gateway in front of its existing line protocol. Node.js with TypeScript is a good fit for that gateway and account service; it does not need to replace the Pike game rules. The asset conversion tools can be written in Python and run offline during development; the browser should load converted files, never parse PS2 formats at runtime.

This retains the original server/client division and avoids porting the room and monster scripts before the game is playable. A browser WebSocket is a persistent connection, so one connection per active game session fits the original design. The gateway translates browser framing to Pike's line framing and can eventually offer a versioned browser protocol. It should not contain world rules. Pike also documents a WebSocket module; a Pike-side adapter is viable if supported by the chosen installed release, but is not required for the first slice.

```text
PS2 assets --- offline import ---> PNG + glTF + browser audio
                                        |
                                        v
browser client <-- WSS --> Node gateway <-- local TCP --> Pike world server
Three.js + HTML UI       auth + protocol bridge          world rules + rooms
                               |
                        hashed account store
```

## Migration boundaries

1. **Pike runtime:** First check whether a supported Pike release can compile and run the copied server locally. Pike documents `#pike` and `-V` compatibility modes, but these do not guarantee this particular code will run unchanged. The code has hard-coded `/home/mhofman/Pike/Server/players/` paths and old socket APIs; fix only what the runtime test proves necessary. Keep the Pike listener private.
2. **Protocol:** Document the existing line protocol as the behavioral reference. Use one browser WebSocket per player session. Initially bridge commands and numbered responses with a thin Node.js service. The gateway must handle framing, disconnects, and bounded buffers. Later, a versioned JSON browser protocol can replace the numbered strings at the browser boundary without changing world rules.
3. **World:** Keep the `.room`, `.map`, and Pike scripts as the live world definition. Preserve room IDs, coordinates, asset names, and collision meanings. A full TypeScript rewrite remains an option only if running and maintaining Pike proves impractical.
4. **Assets:** Decode TIM2 to lossless PNG; convert MilkShape ASCII meshes to glTF; interpret `.ani` as attachment/animation data; wrap or transcode raw audio to a browser-friendly format. Keep the originals untouched and use a manifest mapping original names to converted files. Check palette order, channel order, alpha, texture coordinates, scale, and orientation against `Client/texture.cpp`, `Client/ms3dmodel.cpp`, and the available `window.bmp` reference.
5. **Rendering:** Reproduce the original scene, camera, fog/lighting, transparency, animation, and interface as closely as practical with standard graphics APIs. Re-create visible VU1/DMA effects from output behavior rather than porting hardware instructions.
6. **Persistence and accounts:** Node owns registration, login, and an account database with Argon2id password hashes. On registration it validates the character name, reserves it without overwriting any existing save, and atomically creates the Pike player file with initial character fields. The `password=` field holds a unique, high-entropy internal credential for that character, never the user's password and never a shared dummy value. Node derives or stores this credential privately, authenticates the browser, then sends the Pike `login` command itself. Browser clients cannot send `login` directly through the gateway. Pike continues saving the internal credential with the character. Bind the Pike listener to a private interface and remove its logging of login commands. Use HTTPS/WSS for the public endpoint and validate the browser origin and session at the gateway. Keep character files and account storage outside the web root. The copied `Client/` and `Server/` directories are ignored by Git until reviewed and migrated into publishable source directories.

## First playable slice

- Decode and visually verify one TIM2 atlas, beginning with `window_.tm2` against `window.bmp`.
- Convert one static model and one animated character, preserving UVs and part hierarchy.
- Load `village500500` and adjacent room data in the browser, with collision and camera movement.
- Start the Pike server locally and verify login, room description, one-step movement, and a text event through its line protocol.
- Add the WebSocket gateway and run two browser clients to verify that each receives the other's movement.

Only then expand browser support for combat, inventory, NPCs, quests, shops, and the remaining rooms. This slice tests the hardest architecture boundaries: Pike compatibility, assets, room coordinates, networking, and authentication.

## Decisions to validate early

- Exact TIM2 variants, palette permutations, and alpha semantics for every atlas.
- Whether the saved Pike player files should be migrated, or whether the new game starts with new characters. Do not expose the old plaintext passwords.
- The older `cashimor/ps2mud` Python prototype is retained under `unused/` for reference. The local checkout tracks that repository as `origin`.
- Whether visual fidelity means pixel/PS2-era appearance or a modernized presentation using the same world and models.
- Capacity and hosting needs before choosing deployment topology or optimizing network traffic.

## Source references

- `Client/COMMANDS`, `Client/main.cpp`, `Client/texture.cpp`, `Client/ms3dmodel.cpp`, `Client/lists.cpp`
- `Server/connect.pike`, `Server/game.pike`, `Server/player.pike`, `Server/rooms/room.pike`
- `Server/resources/index.lst`, `Server/audio/index.lst`, `Server/Triangles/triangles.pike`

## External technical references

- Three.js WebGL renderer: https://threejs.org/docs/pages/WebGLRenderer
- Three.js glTF loader: https://threejs.org/docs/pages/GLTFLoader
- Browser WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- Pike compatibility directive: https://pike.lysator.liu.se/docs/man/chapter_6.html
- Pike WebSocket module: https://pike.lysator.liu.se/docs/man/chapter_14.html
- OWASP password storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
