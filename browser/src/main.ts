import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { playSound, setAvailableSounds, setMusicEnabled, setMusicTune,
  setSoundEnabled, unlockSound } from './audio';
import { movementAngle, movementVector, pressedButtons, stickAxis } from './gamepad';
import { advanceProjectile } from './projectile';
import './style.css';

// Older form submissions could leave credentials in the URL. Remove that
// query from the active history entry before loading any other assets.
if (new URLSearchParams(location.search).has('password'))
  history.replaceState(history.state, '', location.pathname + location.hash);

type RoomObject = {
  name: string;
  model: string;
  texture: string;
  position: [number, number, number];
  rotation: [number, number, number];
  bias: boolean;
  placed: boolean;
};
type Avatar = {
  source: string;
  base: string;
  texture: string;
  parts: { model: string; offset: [number, number, number]; type: number; samples: number[]; speed: number }[];
  ghost?: boolean;
};
type Manifest = {
  rooms: Record<string, RoomObject[]>;
  avatar: Avatar;
  avatars: Record<string, Avatar>;
  stats: { models: Record<string, { triangles: number }>; textures: Record<string, unknown> };
  sounds: string[];
};

const stage = document.querySelector<HTMLDivElement>('#stage')!;
const status = document.querySelector<HTMLDivElement>('#load-state')!;
const stats = document.querySelector<HTMLDivElement>('#scene-stats')!;
const buttons = document.querySelector<HTMLDivElement>('#room-buttons')!;
const errorBox = document.querySelector<HTMLDivElement>('#error')!;
const shadowToggle = document.querySelector<HTMLInputElement>('#shadow-toggle')!;
const soundToggle = document.querySelector<HTMLInputElement>('#sound-toggle')!;
const soundTest = document.querySelector<HTMLButtonElement>('#sound-test')!;
const soundStatus = document.querySelector<HTMLDivElement>('#sound-status')!;
const musicToggle = document.querySelector<HTMLInputElement>('#music-toggle')!;
const musicPreview = document.querySelector<HTMLButtonElement>('#music-preview')!;
const musicStatus = document.querySelector<HTMLDivElement>('#music-status')!;
const characterButton = document.querySelector<HTMLButtonElement>('#character-button')!;
const connectionState = document.querySelector<HTMLSpanElement>('#connection-state')!;
const accountForm = document.querySelector<HTMLFormElement>('#account-form')!;
const accountName = document.querySelector<HTMLInputElement>('#account-name')!;
const accountPassword = document.querySelector<HTMLInputElement>('#account-password')!;
const accountGender = document.querySelector<HTMLSelectElement>('#account-gender')!;
const createAccountButton = document.querySelector<HTMLButtonElement>('#create-account')!;
const signedIn = document.querySelector<HTMLDivElement>('#signed-in')!;
const characterName = document.querySelector<HTMLSpanElement>('#character-name')!;
const signOutButton = document.querySelector<HTMLButtonElement>('#sign-out')!;
const playState = document.querySelector<HTMLDivElement>('#play-state')!;
const gameHud = document.querySelector<HTMLDivElement>('#game-hud')!;
const messageLog = document.querySelector<HTMLDivElement>('#message-log')!;
const sayForm = document.querySelector<HTMLFormElement>('#say-form')!;
const sayInput = document.querySelector<HTMLInputElement>('#say-input')!;
const sayButton = document.querySelector<HTMLButtonElement>('#say-button')!;
const messageLabel = document.querySelector<HTMLLabelElement>('#message-label')!;
const messageHint = document.querySelector<HTMLElement>('#message-hint')!;
const sayModeButton = document.querySelector<HTMLButtonElement>('#say-mode')!;
const shoutModeButton = document.querySelector<HTMLButtonElement>('#shout-mode')!;
const gameList = document.querySelector<HTMLDivElement>('#game-list')!;
const shopButton = document.querySelector<HTMLButtonElement>('#shop-button')!;
const shopPanel = document.querySelector<HTMLDivElement>('#shop-panel')!;
const shopClose = document.querySelector<HTMLButtonElement>('#shop-close')!;
const shopBuy = document.querySelector<HTMLButtonElement>('#shop-buy')!;
const shopSell = document.querySelector<HTMLButtonElement>('#shop-sell')!;
const shopList = document.querySelector<HTMLDivElement>('#shop-list')!;
const controllerSelectHint = document.querySelector<HTMLDivElement>('#controller-select-hint')!;
const readingPanel = document.querySelector<HTMLDivElement>('#reading-panel')!;
const readingTitle = document.querySelector<HTMLElement>('#reading-title')!;
const readingText = document.querySelector<HTMLElement>('#reading-text')!;
const readingClose = document.querySelector<HTMLButtonElement>('#reading-close')!;
const listButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-list-command]'));
const hpValue = document.querySelector<HTMLElement>('#hp-value')!;
const spValue = document.querySelector<HTMLElement>('#sp-value')!;
const hpBar = document.querySelector<HTMLElement>('#hp-bar')!;
const spBar = document.querySelector<HTMLElement>('#sp-bar')!;
const moveControls = document.querySelector<HTMLDivElement>('#move-controls')!;
const examineButton = document.querySelector<HTMLButtonElement>('#examine-button')!;
const attackButton = document.querySelector<HTMLButtonElement>('#attack-button')!;
const spellButton = document.querySelector<HTMLButtonElement>('#spell-button')!;
const triggerButton = document.querySelector<HTMLButtonElement>('#trigger-button')!;
const gamepadStatus = document.querySelector<HTMLDivElement>('#gamepad-status')!;

document.addEventListener('pointerdown', unlockSound, { capture: true });
document.addEventListener('keydown', unlockSound, { capture: true });
soundToggle.addEventListener('change', () => {
  setSoundEnabled(soundToggle.checked);
  if (soundToggle.checked) unlockSound();
});
function reportCollisionSound(result: Awaited<ReturnType<typeof playSound>>): void {
  soundStatus.textContent = {
    played: 'Collision sound started.',
    disabled: 'Turn on sound effects to test.',
    locked: 'Audio is blocked by the browser.',
    missing: 'Collision sound is missing.',
    unavailable: 'Could not load the collision sound.',
  }[result];
}
soundTest.addEventListener('click', async () => {
  unlockSound();
  soundStatus.textContent = 'Checking audio…';
  reportCollisionSound(await playSound('nono'));
});
let roomMusicTune = -1;
let previewingMusic = false;
function musicLabel(tune: number): string {
  return !musicToggle.checked ? 'Music off.'
    : tune < 0 ? 'No music in this area.' : `Playing original tune ${tune}.`;
}
function changeMusic(tune: number): void {
  if (tune === roomMusicTune) return;
  roomMusicTune = tune;
  if (!previewingMusic) {
    musicStatus.textContent = musicLabel(tune);
    void setMusicTune(tune);
  }
}
musicToggle.addEventListener('change', () => {
  setMusicEnabled(musicToggle.checked);
  musicStatus.textContent = musicToggle.checked ? musicLabel(roomMusicTune) : 'Music off.';
});
musicPreview.addEventListener('click', async () => {
  unlockSound();
  previewingMusic = !previewingMusic;
  musicPreview.textContent = previewingMusic ? 'Stop' : 'Preview';
  const tune = previewingMusic ? 0 : roomMusicTune;
  const result = await setMusicTune(tune);
  musicStatus.textContent = result === 'playing' && previewingMusic ? 'Previewing original tune 0.'
    : result === 'locked' ? 'Press a key or click to enable audio.'
    : result === 'unavailable' ? 'Music could not start in this browser.'
    : musicLabel(roomMusicTune);
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06101f);
scene.fog = new THREE.FogExp2(0x06101f, 0.0035);
const camera = new THREE.PerspectiveCamera(60, 1, 1, 1200);
camera.position.set(75, 68, 155);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(65, 0, 40);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 12;
controls.maxDistance = 400;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();
// Keep daylight directional: the PS2 scene leaves surfaces facing away from
// the sun much darker than the earlier, strongly ambient browser preview.
const skyLight = new THREE.HemisphereLight(0xb5c8e2, 0x26321e, 0.8);
scene.add(skyLight);
const sun = new THREE.DirectionalLight(0xffe8bd, 2.6);
sun.position.set(-50, 100, 65);
scene.add(sun);
// Pike sends the nearest active torch or spell light to each player. Follow
// that source instead of lighting every torch globally.
const worldPointLight = new THREE.PointLight(0xa0a050, 90, 45, 2);
worldPointLight.visible = false;
scene.add(worldPointLight);
let pointLightSourceName: string | undefined;
const shadowLightPosition = { value: new THREE.Vector3() };
const shadowLightActive = { value: 0 };

function makeShadowMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0x02060b, side: THREE.DoubleSide,
    transparent: true, opacity: 0.24, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1 });
  material.onBeforeCompile = shader => {
    shader.uniforms.shadowLightPosition = shadowLightPosition;
    shader.uniforms.shadowLightActive = shadowLightActive;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShadowWorldPosition;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvShadowWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vShadowWorldPosition;\n'
        + 'uniform vec3 shadowLightPosition;\nuniform float shadowLightActive;')
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n'
        + 'diffuseColor.a *= mix(1.0, smoothstep(5.0, 28.0, '
        + 'distance(vShadowWorldPosition, shadowLightPosition)), shadowLightActive);');
  };
  return material;
}

function setRoomLight(level: number): void {
  const strength = level === 0 ? 0.25 : 1;
  skyLight.intensity = 0.8 * strength;
  sun.intensity = 2.6 * strength;
}

function resetWorldLighting(): void {
  setRoomLight(2);
  pointLightSourceName = undefined;
  worldPointLight.visible = false;
  worldPointLight.color.setHex(0xa0a050);
}

function syncWorldPointLight(): void {
  if (pointLightSourceName) {
    const source = actors.get(pointLightSourceName) ?? sceneObjects.get(pointLightSourceName);
    worldPointLight.visible = !!source?.visible;
    if (source?.visible) {
      source.getWorldPosition(worldPointLight.position);
      worldPointLight.position.y += 4;
    }
  }
  shadowLightActive.value = worldPointLight.visible ? 1 : 0;
  if (worldPointLight.visible) shadowLightPosition.value.copy(worldPointLight.position);
}

const resize = new ResizeObserver(() => {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});
resize.observe(stage);

const roomLabels: Record<string, string> = {
  village500500: 'The road',
  village500499: 'The alley',
  village501500: 'The green',
  village500501: 'The yard',
  village501501: 'The church',
  village502500: 'The river crossing',
};
const roomTargets: Record<string, [number, number, number]> = {
  village500500: [50, 0, 48],
  village500499: [50, 0, -50],
  village501500: [150, 0, 50],
  village500501: [50, 0, 150],
  village501501: [150, 0, 150],
  village502500: [250, 0, 50],
  character: [50, 2, 47],
};
const shadows: THREE.Object3D[] = [];
const churchShadowMaterials: THREE.MeshBasicMaterial[] = [];
const scrollingWaterTextures: THREE.Texture[] = [];
const animatedParts: { object: THREE.Object3D; owner: THREE.Group; type: number;
  samples: number[]; speed: number; baseY: number; baseZ: number }[] = [];
const actors = new Map<string, THREE.Group>();
type EntityDescription = { model: string; texture: string; position?: THREE.Vector3 };
const entityDescriptions = new Map<string, EntityDescription>();
const appearanceUpdates = new Map<string, { model: string; texture: string }>();
const walkTargets = new Map<THREE.Group, THREE.Vector3>();
const entityMoveSpeeds = new Map<string, number>();
const walkSpeeds = new Map<THREE.Group, number>();
const pendingEntityTravel = new Map<string, { from: THREE.Vector3; to: THREE.Vector3 }>();
const rotatingYEntities = new Set<string>();
const sceneObjects = new Map<string, THREE.Group>();
const previewTransforms = new Map<string, { position: THREE.Vector3; rotation: THREE.Euler; visible: boolean }>();
const previewChildren = new Map<string, THREE.Object3D[]>();
const seenSceneObjects = new Set<string>();
const relocations = new Map<THREE.Object3D, { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number }>();
let previewAvatar: THREE.Group;
let makeEntity: ((model: string, texture: string) => Promise<THREE.Group>) | undefined;
let changeAppearance: ((object: THREE.Group, model: string, texture: string,
  isCurrent: () => boolean) => Promise<void>) | undefined;
let currentAccount: string | undefined;
let gameSocket: WebSocket | undefined;
let worldReady = false;
let focusTarget = new THREE.Vector3(65, 0, 40);
let cameraTarget = new THREE.Vector3(75, 68, 155);
let movingCamera = false;
let examining = false;
let examineKeyHeld = false;
let examineButtonLatched = false;
let gamepadExamineHeld = false;
let activeGamepadIndex: number | undefined;
let gamepadPressed = new Set<number>();
let controllerMenuOpen = false;
type ControllerSelectView = 'menu' | 'shop' | 'inventory' | 'score' | 'who';
let controllerSelectView: ControllerSelectView | undefined;
let controllerSelectIndex = 0;
let controllerSelectFocus: HTMLElement | undefined;
let controllerMenuIndex = 0;
let controllerFocus: HTMLButtonElement | undefined;
let controllerNavDirection = 0;
let lastControllerNavAt = -Infinity;
const gamepadMoveKey = 'GamepadMove';
let savedExamineView: { eye: THREE.Vector3; at: THREE.Vector3 } | undefined;
let previousFrame = performance.now();
let moveAwaitingServer = false;
let lastMoveSentAt = -Infinity;
let lastTurnAt = -Infinity;
let lastAttackAt = -Infinity;
let playerHeading = 0;
let lastCameraHeading = 0;
let characterDirected = false;
let gamepadMoveBase: number | undefined;
type ListCommand = 'inventory' | 'score' | 'who' | 'help';
let selectedList: ListCommand | undefined;
const listEntries: string[] = [];
let messageMode: 'say' | 'shout' | 'tell' = 'say';
let tellTarget = '';
let helpTopic = 'main';
let shopAvailable = false;
let shopMode: 'buy' | 'sell' | undefined;
const shopEntries: string[] = [];
let readingActive = false;
let pendingReadingTitle = '';
type MoveInput = 'forward' | 'backward';
const stepAngles: Record<MoveInput, number> = {
  forward: 0, backward: Math.PI,
};
let queuedHeading: number | undefined;
let queuedMoveInput: MoveInput | undefined;
const heldMovementKeys: string[] = [];
const movementHeadings = new Map<string, number>();
const heldTurnKeys: string[] = [];
const keyDirections: Record<string, MoveInput> = {
  ArrowUp: 'forward', KeyW: 'forward', ArrowDown: 'backward', KeyS: 'backward',
};
const compassDirections = ['north', 'northeast', 'east', 'southeast',
  'south', 'southwest', 'west', 'northwest'];
function directionFor(angle: number): string {
  return compassDirections[(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8]!;
}
controls.addEventListener('start', () => { movingCamera = false; });

// Follow the actor without changing the angle or distance chosen with OrbitControls.
function followPlayer(from: THREE.Vector3, to: THREE.Vector3): void {
  if (examining) return;
  const delta = to.clone().sub(from);
  if (delta.lengthSq() === 0) return;
  movingCamera = false;
  camera.position.add(delta);
  controls.target.add(delta);
  focusTarget.add(delta);
  cameraTarget.add(delta);
}

function facePlayer(heading: number): void {
  playerHeading = heading;
  const actor = actors.get(currentAccount ?? '');
  if (actor) actor.rotation.y = heading;
}

function cameraHeading(): number {
  const view = controls.target.clone().sub(camera.position);
  view.y = 0;
  if (view.lengthSq() >= 0.0001) lastCameraHeading = Math.atan2(view.x, view.z);
  return lastCameraHeading;
}

function turnPlayer(step: number, tapped = false): void {
  const now = performance.now() / 1000;
  if (!tapped && now - lastTurnAt < 1 / 6) return;
  const turn = step * Math.PI / 4;
  characterDirected = true;
  if (gamepadMoveBase !== undefined) gamepadMoveBase += turn;
  facePlayer(playerHeading + turn);
  for (const key of heldMovementKeys) {
    const direction = keyDirections[key];
    if (direction) movementHeadings.set(key, playerHeading + stepAngles[direction]);
  }
  if (queuedMoveInput) queuedHeading = playerHeading + stepAngles[queuedMoveInput];
  lastTurnAt = now;
}

function startMove(key: string): void {
  if (heldMovementKeys.includes(key)) return;
  const direction = keyDirections[key];
  if (!direction) return;
  // Before the player turns, movement follows the camera. After Q/E, it follows
  // the chosen facing; backward steps keep that facing unchanged.
  const heading = (characterDirected ? playerHeading : cameraHeading()) + stepAngles[direction];
  movementHeadings.set(key, heading);
  heldMovementKeys.push(key);
  if (!characterDirected) facePlayer(heading);
}

function focus(room: string): void {
  const target = roomTargets[room];
  if (!target) return;
  if (examining) {
    examineKeyHeld = false;
    examineButtonLatched = false;
    stopExamine();
  }
  focusTarget = new THREE.Vector3(...target);
  cameraTarget = focusTarget.clone().add(room === 'character'
    ? new THREE.Vector3(7, 4, 10)
    : room === 'village502500'
      ? new THREE.Vector3(22, 32, 47)
    : new THREE.Vector3(45, 65, 95));
  movingCamera = true;
  document.querySelectorAll<HTMLButtonElement>('.room-button').forEach(button => {
    button.classList.toggle('active', button.dataset.room === room);
  });
  characterButton.classList.toggle('active', room === 'character');
}

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const elapsed = now / 1000;
  // Original U-style models scroll their atlas V coordinate through a quarter tile.
  for (const texture of scrollingWaterTextures) texture.offset.y = (elapsed * 0.06) % 0.25;
  const delta = Math.min(0.05, (now - previousFrame) / 1000);
  previousFrame = now;
  const turn = Number(heldTurnKeys.includes('KeyQ')) - Number(heldTurnKeys.includes('KeyE'));
  if (turn) turnPlayer(turn);
  for (const [object, motion] of relocations) {
    const progress = Math.min(1, (elapsed - motion.start) / motion.duration);
    const previous = object.position.clone();
    object.position.lerpVectors(motion.from, motion.to, progress);
    if (object === actors.get(currentAccount ?? '') && motion.duration === 8) {
      followPlayer(previous, object.position);
    }
    if (progress === 1) relocations.delete(object);
  }
  for (const [actor, target] of walkTargets) {
    if (relocations.has(actor)) continue;
    const remaining = actor.position.distanceTo(target);
    if (remaining <= 0.001) {
      actor.position.copy(target);
      walkTargets.delete(actor);
      walkSpeeds.delete(actor);
      continue;
    }
    const previous = actor.position.clone();
    const speed = walkSpeeds.get(actor);
    if (speed) {
      advanceProjectile(actor.position, target, speed, delta);
    } else {
      actor.position.addScaledVector(target.clone().sub(actor.position).normalize(),
        Math.min(remaining, delta * 6));
    }
    if (actor === actors.get(currentAccount ?? '')) {
      followPlayer(previous, actor.position);
    }
  }
  for (const part of animatedParts) {
    const triggered = (part.type & 256) !== 0;
    const animateAt = part.object.userData.animateAt as number | undefined;
    const attackTime = animateAt === undefined ? Infinity : elapsed - animateAt;
    const active = triggered
      ? attackTime >= 0 && attackTime < part.speed / 6
      : part.owner === previewAvatar || walkTargets.has(part.owner) || relocations.has(part.owner);
    const kind = part.type & 255;
    const movedAt = part.owner.userData.moveAnimationAt as number | undefined;
    // The PS2 client advances each animation step once per frame at 60 FPS.
    // Start a new gait when movement begins; leave the preview's gentle idle
    // motion at its existing pace.
    const phase = active ? (triggered ? attackTime * 60
      : part.owner === previewAvatar ? elapsed * 7
      : (elapsed - (movedAt ?? elapsed)) * 60) / Math.max(1, part.speed) : 0;
    const index = Math.floor(phase) % 10;
    const value = THREE.MathUtils.lerp(part.samples[index] ?? 0,
      part.samples[(index + 1) % 10] ?? 0, phase % 1);
    if (kind === 1) part.object.rotation.z = value;
    if (kind === 2) part.object.rotation.x = value;
    if (kind === 3) part.object.rotation.y = value;
    if (kind === 4) part.object.position.y = part.baseY + value;
    if (kind === 5) part.object.position.z = part.baseZ + value;
    if (kind === 6) part.object.position.y = part.baseY + (value > 0.5 ? 10 : 0);
  }
  for (const actor of actors.values())
    if (actor.userData.ghost) actor.rotation.y += delta * 0.7;
  for (const name of rotatingYEntities) {
    const actor = actors.get(name);
    if (actor) actor.rotation.y = (actor.rotation.y + delta * 6) % (Math.PI * 2);
  }
  if (movingCamera) {
    controls.target.lerp(focusTarget, 0.08);
    camera.position.lerp(cameraTarget, 0.08);
    if (controls.target.distanceTo(focusTarget) < 0.02) movingCamera = false;
  }
  pollGamepad(delta);
  controls.update();
  syncWorldPointLight();
  renderer.render(scene, camera);
  dispatchMove();
}
animate();

async function loadWorld(): Promise<void> {
  const response = await fetch(`${import.meta.env.BASE_URL}assets/scene.json`);
  if (!response.ok) throw new Error('Converted assets are missing. Run tools/build_browser_assets.py.');
  const manifest = await response.json() as Manifest;
  setAvailableSounds(manifest.sounds ?? []);
  const objects = Object.values(manifest.rooms).flat();
  const modelNames = [...new Set([...objects.map(object => object.model),
    ...Object.values(manifest.avatars).flatMap(avatar => [avatar.base, ...avatar.parts.map(part => part.model)]),
    'spell.txt'])];
  const textureNames = [...new Set([...objects.map(object => object.texture),
    manifest.avatar.texture, 'items8_.tm2'])];
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const modelLoads = new Map<string, Promise<THREE.Group>>();
  const textureLoads = new Map<string, Promise<THREE.Texture>>();
  const loadedTextureSet = new Set<THREE.Texture>();
  let nearestTextureSampling = false;
  const setTextureSampling = (texture: THREE.Texture): void => {
    texture.magFilter = nearestTextureSampling ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = nearestTextureSampling ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    loadedTextureSet.add(texture);
  };
  const loadModel = (name: string): Promise<THREE.Group> => {
    if (!manifest.stats.models[name]) return Promise.reject(new Error(`Unknown model ${name}`));
    let pending = modelLoads.get(name);
    if (!pending) {
      pending = loader.loadAsync(`${import.meta.env.BASE_URL}assets/models/${encodeURIComponent(name)}.gltf`).then(gltf => gltf.scene);
      modelLoads.set(name, pending);
    }
    return pending;
  };
  const loadTexture = (name: string): Promise<THREE.Texture> => {
    if (!manifest.stats.textures[name]) return Promise.reject(new Error(`Unknown texture ${name}`));
    let pending = textureLoads.get(name);
    if (!pending) {
      pending = textureLoader.loadAsync(`${import.meta.env.BASE_URL}assets/textures/${encodeURIComponent(name)}.png`).then(texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        setTextureSampling(texture);
        return texture;
      });
      textureLoads.set(name, pending);
    }
    return pending;
  };
  status.textContent = 'Loading converted models and textures…';

  const [loadedModels, loadedTextures] = await Promise.all([
    Promise.all(modelNames.map(async name => [name, await loadModel(name)] as const)),
    Promise.all(textureNames.map(async name => [name, await loadTexture(name)] as const)),
  ]);
  const models = new Map(loadedModels);
  const textures = new Map(loadedTextures);
  const waterTextures = new Map<string, THREE.Texture>();
  const materialTexture = (model: string, textureName: string, source: THREE.Texture): THREE.Texture => {
    if (!model.startsWith('U')) return source;
    const key = `${model}:${textureName}`;
    let water = waterTextures.get(key);
    if (!water) {
      water = source.clone();
      setTextureSampling(water);
      waterTextures.set(key, water);
      scrollingWaterTextures.push(water);
    }
    return water;
  };
  let triangleCount = 0;

  for (const object of objects) {
    const original = models.get(object.model);
    const texture = textures.get(object.texture);
    if (!original || !texture) throw new Error(`Missing ${object.model} or ${object.texture}`);
    const map = materialTexture(object.model, object.texture, texture);
    const instance = original.clone(true);
    const churchOverlays = object.model === 'Tchurch.txt';
    const shadow = object.bias && object.model.startsWith('T') && !churchOverlays;
    const transparent = /^[TUV]/.test(object.model);
    const shadowMaterial = makeShadowMaterial();
    const material = shadow
      ? shadowMaterial
      : new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide,
        transparent, alphaTest: transparent ? 0.04 : 0,
        depthWrite: !transparent, opacity: transparent ? 0.74 : 1 });
    const churchShadowFills: THREE.Mesh[] = [];
    instance.traverse(part => {
      if (part instanceof THREE.Mesh) {
        if (churchOverlays) {
          const geometry = part.geometry;
          const uv = geometry.getAttribute('uv');
          const position = geometry.getAttribute('position');
          const fillGeometry = geometry.clone();
          fillGeometry.clearGroups();
          geometry.clearGroups();
          for (let vertex = 0; vertex < position.count; vertex += 3) {
            const painted = [0, 1, 2].some(corner =>
              Math.abs(uv.getX(vertex + corner)) > 0.001 || Math.abs(uv.getY(vertex + corner)) > 0.001);
            const floor = [0, 1, 2].every(corner => position.getY(vertex + corner) <= 1.1);
            // The main church floor is at y=0; only the blue rear floor is at
            // y=1. Cancel most of the room's bias for floor overlays so they
            // sit just above their original surface, below the pillar faces.
            if (floor) {
              for (let corner = 0; corner < 3; corner++)
                position.setY(vertex + corner, position.getY(vertex + corner) - 0.09);
            }
            if (painted && floor) fillGeometry.addGroup(vertex, 3, 0);
            geometry.addGroup(vertex, 3, painted ? (floor ? 2 : 1) : 0);
          }
          position.needsUpdate = true;
          const fillPosition = fillGeometry.getAttribute('position');
          for (let vertex = 0; vertex < position.count; vertex++)
            fillPosition.setY(vertex, position.getY(vertex));
          fillPosition.needsUpdate = true;
          const fill = new THREE.Mesh(fillGeometry, shadowMaterial);
          fill.position.y = -0.004;
          fill.renderOrder = 1;
          fill.frustumCulled = false;
          churchShadowFills.push(fill);
          part.renderOrder = 2;
          part.material = [shadowMaterial,
            new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide,
              transparent: true, alphaTest: 0.04, opacity: 0.78, depthWrite: false }),
            new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide,
              transparent: true, alphaTest: 0.04, opacity: 0.55, depthWrite: false,
              polygonOffset: true, polygonOffsetFactor: -1 })];
          churchShadowMaterials.push(shadowMaterial);
        } else {
          part.material = material;
        }
        part.frustumCulled = false;
      }
    });
    for (const fill of churchShadowFills) instance.add(fill);
    instance.name = object.name;
    instance.position.set(object.position[0], object.position[1] + (object.bias ? 0.1 : 0), object.position[2]);
    instance.rotation.set(...object.rotation);
    instance.visible = object.placed;
    scene.add(instance);
    if (sceneObjects.has(object.name)) throw new Error(`Duplicate room object name: ${object.name}`);
    sceneObjects.set(object.name, instance);
    previewTransforms.set(object.name, { position: instance.position.clone(), rotation: instance.rotation.clone(), visible: instance.visible });
    previewChildren.set(object.name, [...instance.children]);
    if (shadow) shadows.push(instance);
    triangleCount += manifest.stats.models[object.model]?.triangles ?? 0;
  }

  const buildEntity = (modelName: string, textureName: string): THREE.Group => {
    const texture = textures.get(textureName);
    if (!texture) throw new Error(`Missing entity texture ${textureName}`);
    const ghost = modelName === 'Tghost.ani';
    const material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide,
      transparent: ghost, alphaTest: ghost ? 0.04 : 0, opacity: ghost ? 0.6 : 1,
      depthWrite: !ghost });
    const definition = manifest.avatars[modelName];
    const avatar = new THREE.Group();
    const addPart = (model: string, offset: [number, number, number]): THREE.Group => {
      const original = models.get(model);
      if (!original) throw new Error(`Missing entity model ${model}`);
      const part = original.clone(true);
      part.position.set(...offset);
      part.traverse(piece => { if (piece instanceof THREE.Mesh) piece.material = material; });
      avatar.add(part);
      return part;
    };
    if (!definition) {
      addPart(modelName, [0, 0, 0]);
      return avatar;
    }
    addPart(definition.base, [0, 0, 0]);
    const children: THREE.Group[] = [];
    for (const part of definition.parts) {
      const object = addPart(part.model, part.offset);
      children.push(object);
      animatedParts.push({ object, owner: avatar, type: part.type, samples: part.samples,
        speed: part.speed, baseY: part.offset[1], baseZ: part.offset[2] });
    }
    avatar.userData.parts = children;
    if (definition.ghost) avatar.userData.ghost = true;
    return avatar;
  };
  changeAppearance = async (object, modelName, textureName, isCurrent) => {
    const [original, texture] = await Promise.all([loadModel(modelName), loadTexture(textureName)]);
    if (!isCurrent()) return;
    const material = new THREE.MeshLambertMaterial({ map: materialTexture(modelName, textureName, texture), side: THREE.DoubleSide,
      transparent: /^[TUV]/.test(modelName), alphaTest: /^[TUV]/.test(modelName) ? 0.04 : 0,
      depthWrite: !/^[TUV]/.test(modelName), opacity: /^[TUV]/.test(modelName) ? 0.74 : 1 });
    const replacement = original.clone(true);
    replacement.traverse(piece => { if (piece instanceof THREE.Mesh) piece.material = material; });
    object.clear();
    object.add(replacement);
  };
  makeEntity = async (modelName, textureName) => {
    const definition = manifest.avatars[modelName];
    const parts = definition ? [definition.base, ...definition.parts.map(part => part.model)] : [modelName];
    await Promise.all([...parts.map(loadModel), loadTexture(textureName)]);
    for (const part of parts) models.set(part, await loadModel(part));
    textures.set(textureName, await loadTexture(textureName));
    return buildEntity(modelName, textureName);
  };
  previewAvatar = buildEntity(manifest.avatar.source, manifest.avatar.texture);
  previewAvatar.name = 'character-study';
  previewAvatar.position.set(50, 0, 47);
  previewAvatar.rotation.y = 0.55;
  scene.add(previewAvatar);
  triangleCount += [manifest.avatar.base, ...manifest.avatar.parts.map(part => part.model)]
    .reduce((count, model) => count + (manifest.stats.models[model]?.triangles ?? 0), 0);

  for (const room of Object.keys(roomLabels)) {
    const roomObjects = manifest.rooms[room];
    if (!roomObjects) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'room-button';
    button.dataset.room = room;
    button.innerHTML = `<span>${roomLabels[room] ?? room}</span><small>${roomObjects.length} objects</small><b>↗</b>`;
    button.addEventListener('click', () => focus(room));
    buttons.append(button);
  }
  document.querySelector<HTMLButtonElement>('.room-button')?.classList.add('active');
  characterButton.addEventListener('click', () => focus('character'));
  shadowToggle.addEventListener('change', () => {
    for (const shadow of shadows) shadow.visible = shadowToggle.checked;
    for (const material of churchShadowMaterials) material.opacity = shadowToggle.checked ? 0.24 : 0;
  });
  if (import.meta.env.DEV) {
    const comparison = document.createElement('button');
    comparison.type = 'button';
    comparison.className = 'filter-comparison';
    comparison.textContent = 'Texture sampling: Smooth';
    comparison.title = 'Compare atlas seams at the same camera angle';
    comparison.addEventListener('click', () => {
      nearestTextureSampling = !nearestTextureSampling;
      for (const texture of loadedTextureSet) setTextureSampling(texture);
      comparison.textContent = `Texture sampling: ${nearestTextureSampling ? 'Nearest' : 'Smooth'}`;
    });
    shadowToggle.closest('label')?.after(comparison);
  }
  status.textContent = `${Object.keys(manifest.rooms).length} original rooms and one character rendered`;
  stats.textContent = `${objects.length} ROOM OBJECTS  ·  ${triangleCount.toLocaleString()} TRIANGLES  ·  ${textureNames.length} ATLASES`;
}

const worldPromise = loadWorld().catch(error => {
  console.error(error);
  status.textContent = 'Scene could not load';
  errorBox.hidden = false;
  errorBox.textContent = error instanceof Error ? error.message : String(error);
});

function resetActors(): void {
  resetWorldLighting();
  entityDescriptions.clear();
  appearanceUpdates.clear();
  entityMoveSpeeds.clear();
  pendingEntityTravel.clear();
  rotatingYEntities.clear();
  walkSpeeds.clear();
  for (const actor of actors.values()) { relocations.delete(actor); walkTargets.delete(actor); scene.remove(actor); }
  actors.clear();
  for (let i = animatedParts.length - 1; i >= 0; i--) {
    if (animatedParts[i]?.owner !== previewAvatar) animatedParts.splice(i, 1);
  }
  if (previewAvatar) previewAvatar.visible = true;
}

function resetSceneObjects(): void {
  for (const [name, object] of sceneObjects) {
    const preview = previewTransforms.get(name)!;
    object.position.copy(preview.position);
    object.rotation.copy(preview.rotation);
    object.visible = preview.visible;
    object.clear();
    object.add(...previewChildren.get(name)!);
    relocations.delete(object);
  }
  seenSceneObjects.clear();
}

function resetMovement(): void {
  closeControllerSelect();
  examineKeyHeld = false;
  examineButtonLatched = false;
  gamepadExamineHeld = false;
  closeControllerMenu();
  stopExamine();
  moveAwaitingServer = false;
  lastMoveSentAt = -Infinity;
  lastTurnAt = -Infinity;
  lastAttackAt = -Infinity;
  playerHeading = 0;
  characterDirected = false;
  gamepadMoveBase = undefined;
  queuedHeading = undefined;
  queuedMoveInput = undefined;
  heldMovementKeys.length = 0;
  movementHeadings.clear();
  heldTurnKeys.length = 0;
}

function appendMessage(message: string): void {
  if (!message.trim()) return;
  const atEnd = messageLog.scrollTop + messageLog.clientHeight >= messageLog.scrollHeight - 8;
  const entry = document.createElement('p');
  entry.textContent = message;
  messageLog.append(entry);
  while (messageLog.childElementCount > 60) messageLog.firstElementChild?.remove();
  if (atEnd) messageLog.scrollTop = messageLog.scrollHeight;
}

function setMessageMode(mode: 'say' | 'shout' | 'tell', target = ''): void {
  messageMode = mode;
  tellTarget = mode === 'tell' ? target : '';
  messageLabel.textContent = mode === 'tell' ? `Tell ${target}`
    : mode === 'shout' ? 'Shout to everyone' : 'Say something';
  sayButton.textContent = mode === 'tell' ? 'Tell' : mode === 'shout' ? 'Shout' : 'Send';
  sayModeButton.classList.toggle('active', mode === 'say');
  shoutModeButton.classList.toggle('active', mode === 'shout');
  sayInput.placeholder = mode === 'tell' ? `Message for ${target}…` : 'Type a message…';
  messageHint.textContent = mode === 'tell' ? 'Private message · costs 4 spell points.'
    : mode === 'shout' ? 'Heard by all players · costs 50 spell points.'
      : 'When standing close to the message board, your words are written there.';
}

function setVital(kind: 'hp' | 'sp', current: number, maximum: number): void {
  const value = kind === 'hp' ? hpValue : spValue;
  const bar = kind === 'hp' ? hpBar : spBar;
  value.textContent = `${current}/${maximum}`;
  bar.style.width = `${maximum > 0 ? Math.max(0, Math.min(100, current / maximum * 100)) : 0}%`;
}

function resetGameHud(): void {
  roomMusicTune = -1;
  previewingMusic = false;
  musicPreview.textContent = 'Preview';
  musicStatus.textContent = 'No music in this area.';
  void setMusicTune(-1);
  gameHud.hidden = true;
  messageLog.replaceChildren();
  sayInput.value = '';
  setMessageMode('say');
  sayButton.disabled = true;
  selectedList = undefined;
  listEntries.length = 0;
  gameList.hidden = true;
  gameList.textContent = '';
  shopAvailable = false;
  shopMode = undefined;
  shopEntries.length = 0;
  shopButton.hidden = true;
  shopPanel.hidden = true;
  shopList.replaceChildren();
  readingActive = false;
  pendingReadingTitle = '';
  readingPanel.hidden = true;
  readingText.textContent = '';
  hpValue.textContent = spValue.textContent = '—';
  hpBar.style.width = spBar.style.width = '0%';
  for (const button of listButtons) {
    button.classList.remove('active');
    button.disabled = true;
  }
}

function setShopAvailable(available: boolean): void {
  // Pike controls when the nearby shop can be opened.
  shopAvailable = available;
  shopButton.hidden = !available;
  if (!available) {
    shopPanel.hidden = true;
    shopButton.classList.remove('active');
    shopMode = undefined;
    if (controllerSelectView === 'shop') setControllerSelectView('menu');
  }
}

function renderShop(): void {
  shopList.replaceChildren();
  if (!shopEntries.length) {
    shopList.textContent = shopMode === 'buy' ? 'Nothing for sale.' : 'Nothing to sell.';
    return;
  }
  for (const label of shopEntries) {
    const item = shopMode === 'sell' ? label.replace(/\s+\(\d+\)$/, '')
      : label.split(/[\s(]/, 1)[0];
    if (!item || !/^[\w ()-]+$/.test(item)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${shopMode === 'buy' ? 'Buy' : 'Sell'} ${label}`;
    button.addEventListener('click', () => {
      if (!shopAvailable || shopPanel.hidden || !shopMode) return;
      sendGameCommand(`${shopMode} ${item}`);
      shopList.textContent = 'Waiting for shopkeeper…';
    });
    shopList.append(button);
  }
  if (controllerMenuOpen) focusControllerTarget();
  if (controllerSelectView === 'shop') focusControllerSelectRow();
}

function renderGameList(): void {
  if (selectedList === 'who') {
    gameList.replaceChildren();
    if (!listEntries.length) gameList.textContent = 'No players online.';
    for (const label of listEntries) {
      const name = label.replace(/ \(idle\)$/, '');
      const row = document.createElement('div');
      row.className = 'inventory-row';
      const text = document.createElement('span');
      text.textContent = label;
      row.append(text);
      if (name && /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && name !== currentAccount) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Tell';
        button.setAttribute('aria-label', `Tell ${name}`);
        button.addEventListener('click', () => {
          setMessageMode('tell', name);
          sayInput.focus();
        });
        row.append(button);
      }
      gameList.append(row);
    }
    if (controllerSelectView === 'who') focusControllerSelectRow();
    return;
  }
  if (selectedList === 'help') {
    gameList.replaceChildren();
    if (helpTopic !== 'main') {
      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = '← All topics';
      back.addEventListener('click', () => openHelp('main'));
      gameList.append(back);
    }
    if (!listEntries.length) gameList.append('Loading help…');
    for (const entry of listEntries) {
      const topic = helpTopic === 'main' ? /^([a-z]+) - /.exec(entry)?.[1] : undefined;
      if (topic) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = entry;
        button.addEventListener('click', () => openHelp(topic));
        gameList.append(button);
      } else {
        const line = document.createElement('div');
        line.textContent = entry;
        gameList.append(line);
      }
    }
    return;
  }
  if (selectedList !== 'inventory') {
    gameList.textContent = listEntries.join('\n') || 'No entries.';
    return;
  }
  gameList.replaceChildren();
  if (!listEntries.length) {
    gameList.textContent = 'No items.';
    return;
  }
  for (const label of listEntries) {
    const row = document.createElement('div');
    row.className = 'inventory-row';
    const name = document.createElement('span');
    name.textContent = label;
    row.append(name);
    // Preserve the whole item description so the adapted Pike server can
    // distinguish a usable stick from a burnt one. Older Pike builds still
    // accept the first word of this command.
    const item = label.replace(/\s+\(\d+\)$/, '');
    if (item && /^[\w ()-]+$/.test(item)) {
      const actions = document.createElement('div');
      actions.className = 'inventory-actions';
      for (const command of ['use', 'drop'] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = command === 'use' ? 'Use' : 'Drop';
        button.setAttribute('aria-label', `${button.textContent} ${label}`);
        button.addEventListener('click', () => {
          if (!worldReady || selectedList !== 'inventory') return;
          sendGameCommand(`${command} ${item}`);
          // Commands arrive at Pike in order, so the list reflects the result.
          sendGameCommand('inventory');
        });
        actions.append(button);
      }
      row.append(actions);
    }
    gameList.append(row);
  }
  if (controllerSelectView === 'inventory') focusControllerSelectRow();
}

function openShop(mode: 'buy' | 'sell'): void {
  if (!shopAvailable || !worldReady) return;
  shopMode = mode;
  shopPanel.hidden = false;
  shopButton.classList.add('active');
  shopBuy.classList.toggle('active', mode === 'buy');
  shopSell.classList.toggle('active', mode === 'sell');
  shopEntries.length = 0;
  shopList.textContent = 'Loading…';
  readingActive = false;
  readingPanel.hidden = true;
  selectedList = undefined;
  gameList.hidden = true;
  for (const button of listButtons) button.classList.remove('active');
  sendGameCommand(mode === 'buy' ? 'list' : 'inventory');
}

shopButton.addEventListener('click', () => {
  if (shopPanel.hidden) openShop('buy');
  else {
    shopPanel.hidden = true;
    shopButton.classList.remove('active');
  }
});
shopClose.addEventListener('click', () => {
  shopPanel.hidden = true;
  shopButton.classList.remove('active');
});
shopBuy.addEventListener('click', () => openShop('buy'));
shopSell.addEventListener('click', () => openShop('sell'));
readingClose.addEventListener('click', () => {
  readingActive = false;
  readingPanel.hidden = true;
});

function showAccount(name: string): void {
  currentAccount = name;
  characterName.textContent = name;
  accountForm.hidden = true;
  signedIn.hidden = false;
  connectionState.textContent = 'CONNECTING';
  playState.textContent = 'Connecting to Pike…';
  moveControls.hidden = true;
  triggerButton.hidden = true;
  void worldPromise.then(() => { if (currentAccount === name) connectGame(); });
}

async function accountRequest(path: string, payload: object): Promise<{ account?: { name: string }; error?: string }> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = await response.json() as { account?: { name: string }; error?: string };
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}

async function signIn(action: 'login' | 'register'): Promise<void> {
  if (!accountForm.reportValidity()) return;
  const name = accountName.value.trim();
  const password = accountPassword.value;
  if (action === 'register' && password.length < 12) {
    playState.textContent = 'New passwords need at least 12 characters.';
    return;
  }
  for (const button of Array.from(accountForm.querySelectorAll<HTMLButtonElement>('button'))) button.disabled = true;
  playState.textContent = action === 'register' ? 'Creating character…' : 'Signing in…';
  try {
    const result = await accountRequest(action, { name, password, gender: Number(accountGender.value) });
    accountPassword.value = '';
    if (result.account) showAccount(result.account.name);
  } catch (error) {
    playState.textContent = error instanceof Error ? error.message : 'Sign-in failed';
  } finally {
    for (const button of Array.from(accountForm.querySelectorAll<HTMLButtonElement>('button'))) button.disabled = false;
  }
}

accountForm.addEventListener('submit', event => { event.preventDefault(); void signIn('login'); });
createAccountButton.addEventListener('click', () => void signIn('register'));
signOutButton.addEventListener('click', async () => {
  gameSocket?.close();
  gameSocket = undefined;
  worldReady = false;
  try { await accountRequest('logout', {}); } catch { /* The local gateway may have stopped. */ }
  currentAccount = undefined;
  resetMovement();
  resetGameHud();
  resetActors();
  resetSceneObjects();
  accountForm.hidden = false;
  signedIn.hidden = true;
  moveControls.hidden = true;
  triggerButton.hidden = true;
  connectionState.textContent = 'READY TO PLAY';
  playState.textContent = 'Signed out.';
});

function connectGame(): void {
  gameSocket?.close();
  worldReady = false;
  resetMovement();
  resetGameHud();
  resetActors();
  resetSceneObjects();
  triggerButton.hidden = true;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${scheme}//${location.host}${import.meta.env.BASE_URL}api/game`);
  gameSocket = socket;
  socket.addEventListener('message', event => {
    if (gameSocket !== socket) return;
    try {
      const message = JSON.parse(String(event.data)) as { type: string; line?: string; error?: string };
      if (message.type === 'line' && message.line) applyWorldLine(message.line);
      if (message.type === 'error') {
        playState.textContent = message.error ?? 'World error';
        appendMessage(playState.textContent);
      }
    } catch { playState.textContent = 'Unreadable world update'; }
  });
  socket.addEventListener('close', () => {
    if (gameSocket !== socket) return;
    worldReady = false;
    resetWorldLighting();
    roomMusicTune = -1;
    previewingMusic = false;
    musicPreview.textContent = 'Preview';
    musicStatus.textContent = 'No music in this area.';
    void setMusicTune(-1);
    sayButton.disabled = true;
    resetMovement();
    moveControls.hidden = true;
    triggerButton.hidden = true;
    setShopAvailable(false);
    for (const button of listButtons) button.disabled = true;
    connectionState.textContent = 'OFFLINE';
    playState.textContent = 'World disconnected. Sign out and back in to reconnect.';
    appendMessage(playState.textContent);
  });
  socket.addEventListener('error', () => { if (gameSocket === socket) playState.textContent = 'Could not connect to the local gateway.'; });
}

async function showEntity(name: string, description: EntityDescription): Promise<void> {
  if (!makeEntity) return;
  try {
    const entity = await makeEntity(description.model, description.texture);
    // Asset loads may finish after a remove, reconnect, or newer description.
    if (entityDescriptions.get(name) !== description) {
      for (let i = animatedParts.length - 1; i >= 0; i--)
        if (animatedParts[i]?.owner === entity) animatedParts.splice(i, 1);
      return;
    }
    entity.name = name;
    entity.visible = description.position !== undefined;
    const pendingTravel = pendingEntityTravel.get(name);
    if (pendingTravel) {
      entity.position.copy(pendingTravel.from);
      walkTargets.set(entity, pendingTravel.to);
      walkSpeeds.set(entity, entityMoveSpeeds.get(name) ?? 1);
      pendingEntityTravel.delete(name);
    } else if (description.position) entity.position.copy(description.position);
    actors.set(name, entity);
    scene.add(entity);
    for (const [target, update] of appearanceUpdates) {
      if (description.model !== 'pfrog.ani' && description.model !== 'Tghost.ani' &&
          target.startsWith(name) && /^\d+$/.test(target.slice(name.length)))
        void updateAppearance(target, update);
    }
    if (name === currentAccount && description.position) {
      previewAvatar.visible = false;
      entity.rotation.y = playerHeading;
      focusTarget = entity.position.clone();
      cameraTarget = focusTarget.clone().add(new THREE.Vector3(-0.5, 30, -20.5));
      movingCamera = true;
      moveAwaitingServer = false;
    }
  } catch (error) {
    console.warn(`Could not render ${name}:`, error);
  }
}

function appearanceTarget(name: string): THREE.Group | undefined {
  const roomObject = sceneObjects.get(name);
  if (roomObject) return roomObject;
  const entity = actors.get(name);
  if (entity) return entity;
  for (const [actorName, actor] of actors) {
    if (!name.startsWith(actorName)) continue;
    const suffix = name.slice(actorName.length);
    if (!/^\d+$/.test(suffix)) continue;
    const parts = actor.userData.parts as THREE.Group[] | undefined;
    return parts?.[Number(suffix)];
  }
  return undefined;
}

async function updateAppearance(name: string, update: { model: string; texture: string }): Promise<void> {
  for (const actorName of entityDescriptions.keys()) {
    if (!name.startsWith(actorName) || !/^\d+$/.test(name.slice(actorName.length))) continue;
    const model = entityDescriptions.get(actorName)?.model;
    if (model === 'pfrog.ani' || model === 'Tghost.ani') return;
  }
  const object = appearanceTarget(name);
  if (!object || !changeAppearance) return;
  try {
    await changeAppearance(object, update.model, update.texture,
      () => appearanceUpdates.get(name) === update && appearanceTarget(name) === object);
  } catch (error) {
    console.warn(`Could not update ${name}:`, error);
  }
}

function removeEntity(name: string, preserveAppearance = false): void {
  entityDescriptions.delete(name);
  entityMoveSpeeds.delete(name);
  pendingEntityTravel.delete(name);
  rotatingYEntities.delete(name);
  if (!preserveAppearance) {
    for (const key of appearanceUpdates.keys())
      if (key === name || key.startsWith(name) && /^\d+$/.test(key.slice(name.length))) appearanceUpdates.delete(key);
  }
  const entity = actors.get(name);
  if (!entity) return;
  relocations.delete(entity);
  walkTargets.delete(entity);
  walkSpeeds.delete(entity);
  scene.remove(entity);
  actors.delete(name);
  for (let i = animatedParts.length - 1; i >= 0; i--)
    if (animatedParts[i]?.owner === entity) animatedParts.splice(i, 1);
}

function applyWorldLine(line: string): void {
  const roomLight = /^024 LIGHT (\d+)$/.exec(line);
  if (roomLight) {
    setRoomLight(Number(roomLight[1]));
    return;
  }
  const lightBlob = /^025 PLON BLOB (\S+)$/.exec(line);
  if (lightBlob?.[1]) {
    pointLightSourceName = lightBlob[1];
    worldPointLight.color.setHex(0xa0a050);
    syncWorldPointLight();
    return;
  }
  const lightPlace = /^025 PLON PLACE ([-+\d.eE]+),([-+\d.eE]+),([-+\d.eE]+)$/.exec(line);
  if (lightPlace) {
    pointLightSourceName = undefined;
    worldPointLight.color.setHex(0xa0a050);
    worldPointLight.position.set(Number(lightPlace[1]), Number(lightPlace[2]), Number(lightPlace[3]));
    worldPointLight.visible = true;
    return;
  }
  const lightColour = /^025 PLCOLOUR (\d+),(\d+),(\d+)$/.exec(line);
  if (lightColour) {
    worldPointLight.color.setRGB(Number(lightColour[1]) / 255,
      Number(lightColour[2]) / 255, Number(lightColour[3]) / 255,
      THREE.SRGBColorSpace);
    return;
  }
  if (line === '025 PLOFF') {
    pointLightSourceName = undefined;
    worldPointLight.visible = false;
    return;
  }
  const sound = /^010 ([\w-]+)$/.exec(line);
  if (sound?.[1]) {
    void playSound(sound[1]);
    return;
  }
  const music = /^023 MUSIC (-?\d+)$/.exec(line);
  if (music) {
    changeMusic(Number(music[1]));
    return;
  }
  if (line.startsWith('000 Welcome')) {
    worldReady = true;
    sayButton.disabled = false;
    connectionState.textContent = 'LIVE WORLD';
    moveControls.hidden = false;
    gameHud.hidden = false;
    for (const button of listButtons) button.disabled = false;
    playState.textContent = 'Connected. W/S move, Q/E turn the character.';
    sendGameCommand('score');
    return;
  }
  const examineView = /^004 CAMERA EYE ([-+\d.eE]+),([-+\d.eE]+),([-+\d.eE]+) AT ([-+\d.eE]+),([-+\d.eE]+),([-+\d.eE]+)$/.exec(line);
  if (examineView) {
    if (examining) {
      cameraTarget.set(Number(examineView[1]), Number(examineView[2]), Number(examineView[3]));
      focusTarget.set(Number(examineView[4]), Number(examineView[5]), Number(examineView[6]));
      movingCamera = true;
    }
    return;
  }
  const described = /^001 NAME (\S+) MODEL (\S+) TEXTURE (\S+)$/.exec(line);
  if (described) {
    const [, name, model, texture] = described;
    if (!name || !model || !texture || sceneObjects.has(name)) return;
    const previous = entityDescriptions.get(name);
    if (previous?.model === model && previous.texture === texture) return;
    if (previous) removeEntity(name);
    const description = { model, texture };
    entityDescriptions.set(name, description);
    void showEntity(name, description);
    return;
  }
  const updated = /^01[48] (?:CUPDATE|UPDATE) (\S+) MODEL (\S+) TEXTURE (\S+)$/.exec(line);
  if (updated) {
    const [, name, model, texture] = updated;
    if (!name || !model || !texture) return;
    const description = entityDescriptions.get(name);
    if (description) {
      const position = description.position;
      removeEntity(name, true);
      const replacement = { model, texture, position };
      entityDescriptions.set(name, replacement);
      void showEntity(name, replacement);
    } else {
      const update = { model, texture };
      appearanceUpdates.set(name, update);
      void updateAppearance(name, update);
    }
    return;
  }
  const located = /^003 LOCATE (\S+) X (-?\d+) Y (-?\d+) Z (-?\d+)$/.exec(line);
  if (located) {
    const [, name, x, y, z] = located;
    if (!name || x === undefined || y === undefined || z === undefined) return;
    const position = new THREE.Vector3(Number(x), Number(y), Number(z));
    const roomObject = sceneObjects.get(name);
    if (roomObject && !actors.has(name)) {
      roomObject.visible = true;
      const duration = name === 'elevator' ? 8 : /^door[123]$/.test(name) ? 0.4 : 0;
      if (seenSceneObjects.has(name) && duration && !roomObject.position.equals(position)) {
        relocations.set(roomObject, { from: roomObject.position.clone(), to: position,
          start: performance.now() / 1000, duration });
      } else {
        relocations.delete(roomObject);
        roomObject.position.copy(position);
      }
      seenSceneObjects.add(name);
      return;
    }
    const description = entityDescriptions.get(name);
    const previousPosition = description?.position;
    if (description) description.position = position;
    const actor = actors.get(name);
    const moveSpeed = entityMoveSpeeds.get(name);
    if (moveSpeed && previousPosition && !previousPosition.equals(position)) {
      if (actor) {
        walkTargets.set(actor, position);
        walkSpeeds.set(actor, moveSpeed);
        actor.visible = true;
      } else pendingEntityTravel.set(name, { from: previousPosition.clone(), to: position });
      return;
    }
    if (!actor) return;
    const nextX = Number(x);
    const nextZ = Number(z);
    if (!actor.userData.ghost && name !== currentAccount && actor.visible &&
        (actor.position.x !== nextX || actor.position.z !== nextZ)) {
      actor.rotation.y = Math.atan2(nextX - actor.position.x, nextZ - actor.position.z);
    }
    const ridingElevator = actor.visible && actor.position.y !== position.y &&
      nextX >= 131 && nextX <= 139 && nextZ >= 181 && nextZ <= 189;
    const wasVisible = actor.visible;
    const previous = actor.position.clone();
    const wasWalking = walkTargets.has(actor);
    walkTargets.delete(actor);
    if (ridingElevator) {
      relocations.set(actor, { from: actor.position.clone(), to: position,
        start: performance.now() / 1000, duration: 8 });
    } else if (actor.visible && actor.position.distanceTo(position) <= 2) {
      relocations.delete(actor);
      if (!wasWalking) actor.userData.moveAnimationAt = performance.now() / 1000;
      walkTargets.set(actor, position);
    } else {
      relocations.delete(actor);
      actor.position.copy(position);
      if (name === currentAccount && wasVisible) followPlayer(previous, actor.position);
    }
    actor.visible = true;
    if (name === currentAccount) {
      const roomX = 500 + Math.floor(nextX / 100);
      const roomZ = 500 + Math.floor(nextZ / 100);
      const room = `village${roomX}${roomZ}`;
      changeMusic(room === 'village501500' ? 0
        : room === 'village500500' ? 1
        : room === 'village504500' ? 2 : -1);
      moveAwaitingServer = false;
      previewAvatar.visible = false;
      if (!wasVisible) {
        actor.rotation.y = playerHeading;
        focusTarget = actor.position.clone();
        // The original fixed-camera default was above and south of the player.
        cameraTarget = focusTarget.clone().add(new THREE.Vector3(-0.5, 30, -20.5));
        movingCamera = true;
      }
    }
    return;
  }
  const rotateY = /^017 ROTATEY (\S+)$/.exec(line);
  if (rotateY?.[1]) {
    rotatingYEntities.add(rotateY[1]);
    return;
  }
  const speed = /^022 SPEED (\S+) (\d+)$/.exec(line);
  if (speed?.[1]) {
    entityMoveSpeeds.set(speed[1], Math.max(0.1, Number(speed[2])));
    return;
  }
  const rotated = /^019 ROTATE (\S+) X ([-+\d.eE]+) Y ([-+\d.eE]+) Z ([-+\d.eE]+)$/.exec(line);
  if (rotated) {
    const [, name, x, y, z] = rotated;
    const object = name ? sceneObjects.get(name) ?? actors.get(name) : undefined;
    if (object && x !== undefined && y !== undefined && z !== undefined)
      object.rotation.set(Number(x), Number(y), Number(z));
    return;
  }
  const animated = /^013 ANIMATE (\S+)$/.exec(line);
  if (animated?.[1]) {
    const part = appearanceTarget(animated[1]);
    if (part) part.userData.animateAt = performance.now() / 1000;
    return;
  }
  const vital = /^(012 HP|020 SP) (-?\d+) MAX (\d+)$/.exec(line);
  if (vital) {
    setVital(vital[1] === '012 HP' ? 'hp' : 'sp', Number(vital[2]), Number(vital[3]));
    return;
  }
  if (line === '021 SELECT') {
    readingActive = true;
    readingTitle.textContent = pendingReadingTitle || 'READING';
    pendingReadingTitle = '';
    readingText.textContent = '';
    readingText.scrollTop = 0;
    readingPanel.hidden = false;
    selectedList = undefined;
    gameList.hidden = true;
    shopPanel.hidden = true;
    shopButton.classList.remove('active');
    for (const button of listButtons) button.classList.remove('active');
    return;
  }
  if (line.startsWith('016 TXT ')) {
    if (readingActive) {
      readingText.textContent += `${line.slice(8)}\n`;
      readingText.scrollTop = 0;
    }
    return;
  }
  if (/^016 SIZE \d+$/.test(line)) {
    if (selectedList) {
      listEntries.length = 0;
      renderGameList();
    }
    if (shopMode && !shopPanel.hidden) {
      shopEntries.length = 0;
      shopList.textContent = shopMode === 'buy' ? 'Nothing for sale.' : 'Nothing to sell.';
    }
    return;
  }
  const saleLine = /^016 BUY (.*)$/.exec(line);
  if (saleLine) {
    if (shopMode === 'buy' && !shopPanel.hidden) {
      shopEntries.push(saleLine[1] ?? '');
      renderShop();
    }
    return;
  }
  const listLine = /^016 (INV|COR|WHO|HEL) (.*)$/.exec(line);
  if (listLine) {
    if (listLine[1] === 'COR') {
      const points = /^(hit|spell) points: (\d+)\/(\d+)$/.exec(listLine[2] ?? '');
      if (points) setVital(points[1] === 'hit' ? 'hp' : 'sp', Number(points[2]), Number(points[3]));
    }
    const kind = { INV: 'inventory', COR: 'score', WHO: 'who', HEL: 'help' }[listLine[1] as 'INV' | 'COR' | 'WHO' | 'HEL'];
    if (selectedList === kind) {
      listEntries.push(listLine[2] ?? '');
      renderGameList();
    }
    if (listLine[1] === 'INV' && shopMode === 'sell' && !shopPanel.hidden) {
      shopEntries.push(listLine[2] ?? '');
      renderShop();
    }
    return;
  }
  if (line.startsWith('007 ')) {
    const action = line.slice(4).trim();
    if (action === 'shop') {
      triggerButton.hidden = true;
      setShopAvailable(true);
      playState.textContent = 'Shop available. Select Shop to browse items.';
      return;
    }
    setShopAvailable(false);
    triggerButton.textContent = action ? action[0]!.toUpperCase() + action.slice(1) : 'Interact';
    triggerButton.hidden = false;
    return;
  }
  if (line.startsWith('006 ')) {
    triggerButton.hidden = true;
    setShopAvailable(false);
    return;
  }
  const removed = /^015 REMOVE (\S+)$/.exec(line);
  if (removed?.[1]) {
    removeEntity(removed[1]);
    return;
  }
  if (line.startsWith('008 ')) {
    const message = line.slice(4);
    playState.textContent = message === 'Use SELECT to enter shop mode.'
      ? 'Select Shop to browse items.' : message;
    appendMessage(playState.textContent);
    if (message === 'You write a message on the board.' && readingActive &&
        readingTitle.textContent === 'READ BOARD') {
      pendingReadingTitle = 'READ BOARD';
      sendGameCommand('trigger');
    }
    if (shopAvailable && !shopPanel.hidden && /^You (?:buy|sell) /.test(message) && shopMode)
      openShop(shopMode);
    return;
  }
  if (line.startsWith('997 ')) {
    moveAwaitingServer = false;
    playState.textContent = 'That step is blocked.';
    void playSound('nono').then(reportCollisionSound);
    return;
  }
  if (line.startsWith('995 ')) {
    playState.textContent = line.slice(4);
    return;
  }
  if (/^9\d\d /.test(line)) {
    playState.textContent = line.slice(4);
    appendMessage(playState.textContent);
  }
}

function sendGameCommand(line: string): void {
  if (!worldReady || gameSocket?.readyState !== WebSocket.OPEN) return;
  gameSocket.send(JSON.stringify({ type: 'command', line }));
}

sayForm.addEventListener('submit', event => {
  event.preventDefault();
  const message = sayInput.value.replace(/\s+/g, ' ').trim();
  if (!message || !worldReady || gameSocket?.readyState !== WebSocket.OPEN) return;
  if (messageMode === 'tell') {
    if (!tellTarget) return;
    sendGameCommand(`tell ${tellTarget}`);
    sendGameCommand(`say ${message}`);
  } else sendGameCommand(`${messageMode} ${message}`);
  sayInput.value = '';
});
sayModeButton.addEventListener('click', () => setMessageMode('say'));
shoutModeButton.addEventListener('click', () => setMessageMode('shout'));

function startExamine(): void {
  if (examining || !worldReady || gameSocket?.readyState !== WebSocket.OPEN) return;
  savedExamineView = { eye: camera.position.clone(), at: controls.target.clone() };
  examining = true;
  movingCamera = false;
  controls.enabled = false;
  heldMovementKeys.length = 0;
  movementHeadings.clear();
  gamepadMoveBase = undefined;
  heldTurnKeys.length = 0;
  queuedHeading = undefined;
  queuedMoveInput = undefined;
  examineButton.textContent = 'Stop examining';
  examineButton.setAttribute('aria-pressed', 'true');
  sendGameCommand('examine');
}

function stopExamine(): void {
  if (!examining) return;
  examining = false;
  movingCamera = false;
  controls.enabled = true;
  if (savedExamineView) {
    camera.position.copy(savedExamineView.eye);
    controls.target.copy(savedExamineView.at);
    cameraTarget.copy(savedExamineView.eye);
    focusTarget.copy(savedExamineView.at);
    controls.update();
  }
  savedExamineView = undefined;
  examineButton.textContent = 'Examine';
  examineButton.setAttribute('aria-pressed', 'false');
}

function syncExamine(): void {
  if (examineKeyHeld || examineButtonLatched || gamepadExamineHeld) startExamine();
  else stopExamine();
}

function setGamepadStatus(message: string): void {
  if (gamepadStatus.textContent !== message) gamepadStatus.textContent = message;
}

function clearGamepadMovement(): void {
  const index = heldMovementKeys.indexOf(gamepadMoveKey);
  if (index >= 0) heldMovementKeys.splice(index, 1);
  movementHeadings.delete(gamepadMoveKey);
  gamepadMoveBase = undefined;
}

function controllerSelectRows(): HTMLElement[] {
  if (controllerSelectView === 'shop')
    return Array.from(shopList.querySelectorAll<HTMLButtonElement>('button'));
  if (controllerSelectView === 'inventory' || controllerSelectView === 'who')
    return Array.from(gameList.querySelectorAll<HTMLElement>('.inventory-row'));
  return [];
}

function focusControllerSelectRow(): void {
  controllerSelectFocus?.classList.remove('gamepad-focus');
  controllerSelectFocus = undefined;
  const rows = controllerSelectRows();
  if (!rows.length) return;
  controllerSelectIndex = Math.min(controllerSelectIndex, rows.length - 1);
  controllerSelectFocus = rows[controllerSelectIndex];
  controllerSelectFocus?.classList.add('gamepad-focus');
  controllerSelectFocus?.scrollIntoView({ block: 'nearest' });
}

function setControllerSelectView(view: ControllerSelectView): void {
  controllerSelectView = view;
  controllerSelectIndex = 0;
  controllerSelectHint.hidden = false;
  controllerSelectHint.textContent = view === 'menu'
    ? `SELECT · Cross/A Players · Square/X Inventory · Triangle/Y Character${shopAvailable ? ' · Circle/B Shop' : ''}`
    : view === 'shop' ? 'SHOP · Up/Down choose · Circle/B buy · Cross/A back'
      : view === 'inventory' ? `INVENTORY · Up/Down choose · Square/X use · Triangle/Y drop${shopAvailable ? ' · Circle/B sell' : ''} · Cross/A back`
        : view === 'who' ? 'PLAYERS · Up/Down choose · Square/X tell · Cross/A back'
        : `${view.toUpperCase()} · Cross/A back`;
  focusControllerSelectRow();
}

function closeControllerSelect(): void {
  controllerSelectFocus?.classList.remove('gamepad-focus');
  controllerSelectFocus = undefined;
  controllerSelectView = undefined;
  controllerSelectHint.hidden = true;
  shopPanel.hidden = true;
  shopButton.classList.remove('active');
  gameList.hidden = true;
  selectedList = undefined;
  for (const button of listButtons) button.classList.remove('active');
}

function openControllerSelect(): void {
  if (!worldReady) return;
  closeControllerMenu();
  clearGamepadMovement();
  queuedHeading = undefined;
  queuedMoveInput = undefined;
  gamepadExamineHeld = false;
  syncExamine();
  shopPanel.hidden = true;
  gameList.hidden = true;
  setControllerSelectView('menu');
}

function controllerSelectBack(): void {
  if (!shopPanel.hidden) shopClose.click();
  gameList.hidden = true;
  selectedList = undefined;
  for (const button of listButtons) button.classList.remove('active');
  setControllerSelectView('menu');
}

function controllerInventoryAction(command: 'use' | 'drop' | 'sell'): void {
  const label = listEntries[controllerSelectIndex];
  const item = label?.replace(/\s+\(\d+\)$/, '');
  if (!item || !/^[\w ()-]+$/.test(item) || (command === 'sell' && !shopAvailable)) return;
  sendGameCommand(`${command} ${item}`);
  sendGameCommand('inventory');
}

function controllerTargets(): HTMLButtonElement[] {
  const tabs = [...listButtons, shopButton].filter(button => !button.hidden);
  const active = !readingPanel.hidden ? readingClose
    : !shopPanel.hidden ? shopList.querySelector<HTMLButtonElement>('button') ?? shopBuy
      : listButtons.find(button => button.dataset.listCommand === selectedList);
  const extra = readingPanel.hidden
    ? shopPanel.hidden
      ? Array.from(gameList.querySelectorAll<HTMLButtonElement>('button'))
      : [shopBuy, shopSell, ...Array.from(shopList.querySelectorAll<HTMLButtonElement>('button')), shopClose]
    : [readingClose];
  return [active, ...extra.filter(button => button !== active), ...tabs.filter(button => button !== active)]
    .filter((button): button is HTMLButtonElement =>
      !!button && !button.hidden && button.getClientRects().length > 0);
}

function focusControllerTarget(): void {
  if (!controllerMenuOpen) return;
  const targets = controllerTargets();
  if (!targets.length) return;
  controllerMenuIndex = Math.min(controllerMenuIndex, targets.length - 1);
  const target = targets[controllerMenuIndex]!;
  if (controllerFocus === target) return;
  controllerFocus?.classList.remove('gamepad-focus');
  controllerFocus = target;
  target.classList.add('gamepad-focus');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest' });
}

function closeControllerMenu(): void {
  controllerMenuOpen = false;
  controllerFocus?.classList.remove('gamepad-focus');
  controllerFocus?.blur();
  controllerFocus = undefined;
  controllerNavDirection = 0;
}

function toggleControllerMenu(): void {
  if (controllerMenuOpen) {
    closeControllerMenu();
    return;
  }
  if (!worldReady) return;
  controllerMenuOpen = true;
  controllerMenuIndex = 0;
  clearGamepadMovement();
  queuedHeading = undefined;
  queuedMoveInput = undefined;
  gamepadExamineHeld = false;
  syncExamine();
  focusControllerTarget();
}

function controllerBack(): void {
  if (!readingPanel.hidden) readingClose.click();
  else if (!shopPanel.hidden) shopClose.click();
  else if (!gameList.hidden) {
    gameList.hidden = true;
    selectedList = undefined;
    for (const button of listButtons) button.classList.remove('active');
  }
  closeControllerMenu();
}

function orbitWithGamepad(axes: readonly number[], delta: number): void {
  const horizontal = stickAxis(axes[2]);
  const vertical = stickAxis(axes[3]);
  if (!horizontal && !vertical) return;
  movingCamera = false;
  const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  spherical.theta -= horizontal * delta * 2.2;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi - vertical * delta * 1.8,
    0.1, controls.maxPolarAngle);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
}

function recenterGamepadCamera(): void {
  if (!worldReady || examining) return;
  const offset = camera.position.clone().sub(controls.target);
  const radius = Math.max(12, Math.hypot(offset.x, offset.z));
  camera.position.set(controls.target.x - Math.sin(playerHeading) * radius,
    controls.target.y + Math.max(8, offset.y),
    controls.target.z - Math.cos(playerHeading) * radius);
  movingCamera = false;
}

function pollGamepad(delta: number): void {
  const getGamepads = navigator.getGamepads?.bind(navigator);
  if (!getGamepads) {
    setGamepadStatus('Controller input is unavailable in this browser.');
    return;
  }
  const all = Array.from(getGamepads()).filter((pad): pad is Gamepad => !!pad?.connected);
  const pad = all.find(candidate => candidate.index === activeGamepadIndex && candidate.mapping === 'standard')
    ?? all.find(candidate => candidate.mapping === 'standard');
  if (!pad) {
    if (activeGamepadIndex !== undefined) {
      clearGamepadMovement();
      gamepadExamineHeld = false;
      syncExamine();
      closeControllerMenu();
      gamepadPressed.clear();
      activeGamepadIndex = undefined;
    }
    setGamepadStatus(all.length
      ? 'Controller detected, but its browser mapping is unsupported.'
      : 'Controller: connect a gamepad and press a button.');
    return;
  }
  if (pad.index !== activeGamepadIndex) {
    clearGamepadMovement();
    closeControllerMenu();
    gamepadPressed.clear();
    activeGamepadIndex = pad.index;
  }
  setGamepadStatus('Controller connected · Select/Menu opens game controls.');
  if (document.hidden) {
    clearGamepadMovement();
    gamepadExamineHeld = false;
    syncExamine();
    gamepadPressed.clear();
    return;
  }
  const pressed = pressedButtons(pad.buttons);
  const justPressed = (index: number) => pressed.has(index) && !gamepadPressed.has(index);
  if (justPressed(8)) {
    if (controllerSelectView) closeControllerSelect();
    else openControllerSelect();
    gamepadPressed = pressed;
    return;
  }
  if (justPressed(9)) {
    if (controllerSelectView) closeControllerSelect();
    toggleControllerMenu();
    gamepadPressed = pressed;
    return;
  }

  if (controllerSelectView) {
    clearGamepadMovement();
    const vector = movementVector(pad.axes, pressed);
    const direction = Math.abs(vector.forward) >= 0.5
      ? vector.forward > 0 ? -1 : 1
      : Math.abs(vector.x) >= 0.5 ? vector.x > 0 ? 1 : -1 : 0;
    const now = performance.now() / 1000;
    const rows = controllerSelectRows();
    if (direction && rows.length &&
        (direction !== controllerNavDirection || now - lastControllerNavAt > 0.25)) {
      controllerSelectIndex = (controllerSelectIndex + direction + rows.length) % rows.length;
      focusControllerSelectRow();
      lastControllerNavAt = now;
    }
    controllerNavDirection = direction;
    const view = controllerSelectView;
    if (justPressed(0)) {
      if (view === 'menu') {
        listButtons[2]?.click();
        setControllerSelectView('who');
      } else controllerSelectBack();
    }
    if (justPressed(1)) {
      if (view === 'menu' && shopAvailable) {
        openShop('buy');
        setControllerSelectView('shop');
      } else if (view === 'shop') {
        const item = controllerSelectRows()[controllerSelectIndex];
        if (item instanceof HTMLButtonElement) item.click();
      } else if (view === 'inventory') controllerInventoryAction('sell');
    }
    if (justPressed(2)) {
      if (view === 'menu') {
        listButtons[0]?.click();
        setControllerSelectView('inventory');
      } else if (view === 'inventory') controllerInventoryAction('use');
      else if (view === 'who') {
        const row = controllerSelectRows()[controllerSelectIndex];
        const tell = row?.querySelector<HTMLButtonElement>('button');
        if (tell) {
          closeControllerSelect();
          tell.click();
        }
      }
    }
    if (justPressed(3)) {
      if (view === 'menu') {
        listButtons[1]?.click();
        setControllerSelectView('score');
      } else if (view === 'inventory') controllerInventoryAction('drop');
    }
    gamepadPressed = pressed;
    return;
  }

  if (controllerMenuOpen) {
    clearGamepadMovement();
    const vector = movementVector(pad.axes, pressed);
    const direction = Math.abs(vector.forward) >= 0.5
      ? vector.forward > 0 ? -1 : 1
      : Math.abs(vector.x) >= 0.5 ? vector.x > 0 ? 1 : -1 : 0;
    const now = performance.now() / 1000;
    if (direction && (direction !== controllerNavDirection || now - lastControllerNavAt > 0.25)) {
      const count = controllerTargets().length;
      if (count) controllerMenuIndex = (controllerMenuIndex + direction + count) % count;
      focusControllerTarget();
      lastControllerNavAt = now;
    }
    controllerNavDirection = direction;
    if (justPressed(2) && shopAvailable && shopPanel.hidden) {
      openShop('buy');
      controllerMenuIndex = 0;
      focusControllerTarget();
    }
    if (justPressed(0)) controllerFocus?.click();
    if (justPressed(1)) controllerBack();
    focusControllerTarget();
    gamepadPressed = pressed;
    return;
  }

  gamepadExamineHeld = pressed.has(4) && worldReady;
  syncExamine();
  if (worldReady && !examining) {
    const turn = Number(pressed.has(7)) - Number(pressed.has(6));
    if (turn) turnPlayer(turn, justPressed(turn > 0 ? 7 : 6));
    orbitWithGamepad(pad.axes, delta);
    if (justPressed(11)) recenterGamepadCamera();
    const vector = movementVector(pad.axes, pressed);
    if (vector.x || vector.forward) {
      gamepadMoveBase ??= characterDirected ? playerHeading : cameraHeading();
      const heading = gamepadMoveBase + movementAngle(vector.x, vector.forward);
      movementHeadings.set(gamepadMoveKey, heading);
      if (!heldMovementKeys.includes(gamepadMoveKey)) heldMovementKeys.push(gamepadMoveKey);
      facePlayer(heading);
    } else clearGamepadMovement();
    if (justPressed(0)) attack();
    if (justPressed(1)) castSpell();
    if (justPressed(2)) {
      if (shopAvailable) {
        openControllerSelect();
        openShop('buy');
        setControllerSelectView('shop');
      }
      else if (!triggerButton.hidden) requestTrigger();
    }
    if (justPressed(3)) {
      toggleControllerMenu();
      listButtons[0]?.click();
    }
  } else clearGamepadMovement();
  gamepadPressed = pressed;
}

function dispatchMove(): void {
  if (!worldReady || gameSocket?.readyState !== WebSocket.OPEN || moveAwaitingServer || examining ||
      controllerMenuOpen) return;
  const angle = queuedHeading ?? movementHeadings.get(heldMovementKeys.at(-1) ?? '');
  if (angle === undefined) return;
  const direction = directionFor(angle);
  if (performance.now() / 1000 - lastMoveSentAt < 1 / 6) return;
  const actor = actors.get(currentAccount ?? '');
  const target = actor && walkTargets.get(actor);
  if (actor && target && actor.position.distanceTo(target) > 0.5) return;
  if (!characterDirected) facePlayer(angle);
  sendGameCommand(`move ${direction}`);
  queuedHeading = undefined;
  queuedMoveInput = undefined;
  moveAwaitingServer = true;
  lastMoveSentAt = performance.now() / 1000;
}

function move(direction: MoveInput): void {
  if (examining) return;
  queuedMoveInput = direction;
  queuedHeading = (characterDirected ? playerHeading : cameraHeading()) + stepAngles[direction];
  if (!characterDirected) facePlayer(queuedHeading);
  dispatchMove();
}
function combat(command: 'attack' | 'spell'): void {
  if (!worldReady || gameSocket?.readyState !== WebSocket.OPEN || examining ||
      controllerSelectView || controllerMenuOpen ||
      !actors.has(currentAccount ?? '')) return;
  const now = performance.now() / 1000;
  if (now - lastAttackAt < 1) return;
  lastAttackAt = now;
  sendGameCommand(`${command} ${directionFor(playerHeading)}`);
}
function attack(): void { combat('attack'); }
function castSpell(): void { combat('spell'); }
function requestTrigger(): void {
  pendingReadingTitle = triggerButton.textContent?.toUpperCase() ?? '';
  sendGameCommand('trigger');
}
triggerButton.addEventListener('click', requestTrigger);
attackButton.addEventListener('click', attack);
spellButton.addEventListener('click', castSpell);
examineButton.addEventListener('click', () => {
  examineButtonLatched = !examineButtonLatched;
  syncExamine();
});
function openHelp(topic: string): void {
  if (!worldReady || !/^[a-z]+$/.test(topic)) return;
  helpTopic = topic;
  listEntries.length = 0;
  renderGameList();
  sendGameCommand(`help ${topic}`);
}
for (const button of listButtons) {
  button.addEventListener('click', () => {
    const command = button.dataset.listCommand as ListCommand;
    if (!worldReady || !['inventory', 'score', 'who', 'help'].includes(command)) return;
    selectedList = command;
    readingActive = false;
    readingPanel.hidden = true;
    shopPanel.hidden = true;
    shopButton.classList.remove('active');
    listEntries.length = 0;
    gameList.hidden = false;
    gameList.textContent = 'Loading…';
    for (const tab of listButtons) tab.classList.toggle('active', tab === button);
    if (command === 'help') openHelp('main');
    else sendGameCommand(command);
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => {
  button.addEventListener('click', () => move(button.dataset.direction as MoveInput));
});
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.code === 'KeyX' && worldReady) {
    event.preventDefault();
    examineKeyHeld = true;
    syncExamine();
    return;
  }
  if (examining) return;
  if (event.code === 'Space' && worldReady && !(event.target instanceof HTMLButtonElement)) {
    event.preventDefault();
    if (!event.repeat) attack();
    return;
  }
  if (event.code === 'KeyC' && worldReady && !(event.target instanceof HTMLButtonElement)) {
    event.preventDefault();
    if (!event.repeat) castSpell();
    return;
  }
  if (event.code === 'KeyQ' || event.code === 'KeyE') {
    event.preventDefault();
    if (!heldTurnKeys.includes(event.code)) heldTurnKeys.push(event.code);
    if (!event.repeat) turnPlayer(event.code === 'KeyQ' ? 1 : -1, true);
    return;
  }
  if (keyDirections[event.code] && worldReady) {
    event.preventDefault();
    startMove(event.code);
    dispatchMove();
  }
  if (event.code === 'KeyF' && !event.repeat && worldReady && !triggerButton.hidden) {
    event.preventDefault(); requestTrigger();
  }
});
document.addEventListener('keyup', event => {
  if (event.code === 'KeyX') {
    examineKeyHeld = false;
    syncExamine();
  }
  const index = heldMovementKeys.indexOf(event.code);
  if (index >= 0) heldMovementKeys.splice(index, 1);
  movementHeadings.delete(event.code);
  const turnIndex = heldTurnKeys.indexOf(event.code);
  if (turnIndex >= 0) heldTurnKeys.splice(turnIndex, 1);
});
window.addEventListener('blur', () => {
  examineKeyHeld = false;
  gamepadExamineHeld = false;
  syncExamine();
  heldMovementKeys.length = 0;
  movementHeadings.clear();
  heldTurnKeys.length = 0;
  gamepadPressed.clear();
});

void fetch(`${import.meta.env.BASE_URL}api/me`).then(async response => {
  if (!response.ok) return;
  const data = await response.json() as { account?: { name: string } };
  if (data.account) showAccount(data.account.name);
}).catch(() => { playState.textContent = 'Preview available. Start the local gateway to sign in.'; });
