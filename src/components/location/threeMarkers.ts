// Couche unique Three.js dans le contexte WebGL de MapLibre : tous les marqueurs
// partagent le même renderer. Les modèles sont chargés à la première image.
import { MercatorCoordinate, type CustomLayerInterface, type Map as MlMap } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { motionFor, type MarkerChoice, type MotionClip, type SpeedThresholds } from "@/lib/trackPermissions";

export interface SceneMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  speedMps: number;
  headingDeg: number;
  choice: MarkerChoice;
}

const URLS = {
  person: "/models/personne.glb",
  moto: "/models/moto.glb",
  car: "/models/voiture.glb",
} as const;

const CLIPS: Record<"idle" | "walk" | "run", string> = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Jog_Fwd_Loop",
};

/** Cap 0 = nord. Le modèle regarde +Z ; après rotX(π/2), +Z devient le nord. Le cap géographique tourne dans l'autre sens que Y. */
const YAW: Record<"person" | "moto" | "car", number> = { person: 0, moto: 0, car: 0 };
/** Hauteur d'origine du fichier, en unités. Le marqueur vise une taille à l'écran, pas l'échelle 1:1 (invisible à l'échelle d'une ville). */
const UNIT_HEIGHT: Record<Kind, number> = { person: 1.75, moto: 1.15, car: 1.35 };
const TARGET_PX: Record<Kind, number> = { person: 84, moto: 78, car: 92 };

function metersForPixels(lat: number, zoom: number, px: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180) / 2 ** zoom) * px;
}

type Kind = "person" | "moto" | "car";

function kindOf(clip: MotionClip): Kind {
  if (clip === "moto") return "moto";
  if (clip === "car") return "car";
  return "person";
}

const cache = new Map<string, Promise<GLTF>>();
function loadGltf(url: string) {
  let p = cache.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    p = loader.loadAsync(url);
    cache.set(url, p);
  }
  return p;
}

function prep(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((src) => {
      const mat = src as THREE.MeshStandardMaterial;
      mat.side = THREE.DoubleSide;
      if (!mat.map) return mat;
      // Les matériaux éclairés texturés ne sortent pas dans le contexte WebGL partagé.
      const basic = new THREE.MeshBasicMaterial({
        map: mat.map,
        color: mat.color?.clone() ?? new THREE.Color(0xffffff),
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      if (basic.map) basic.map.colorSpace = THREE.SRGBColorSpace;
      return basic;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
  });
}

interface Actor {
  id: string;
  kind: Kind;
  root: THREE.Group;
  inner: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  actions: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>>;
  current?: "idle" | "walk" | "run";
  wheels: THREE.Object3D[];
  sparks?: THREE.Points;
  life?: Float32Array;
  lat: number;
  lng: number;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  t0: number;
  heading: number;
  targetHeading: number;
}

function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

function exhaust() {
  const n = 46;
  const positions = new Float32Array(n * 3);
  const life = new Float32Array(n);
  for (let i = 0; i < n; i++) life[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xe6e6e6, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.position.set(0, 0.55, -0.95);
  return { points, life };
}

export function createMarkerLayer(map: MlMap, read: () => { markers: SceneMarker[]; thresholds: SpeedThresholds }) {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.4));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c0cc, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(40, -30, 80);
  scene.add(sun);
  const camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;
  camera.matrixWorldInverse.identity();
  const actors = new Map<string, Actor>();
  let renderer: THREE.WebGLRenderer | null = null;
  let failed = false;
  const clock = new THREE.Clock();
  let resolveReady!: () => void;
  let rejectReady!: (e: unknown) => void;
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });

  function place(actor: Actor, lat: number, lng: number, heading: number) {
    const mc = MercatorCoordinate.fromLngLat([lng, lat], 0);
    const meters = metersForPixels(lat, map.getZoom(), TARGET_PX[actor.kind]) / UNIT_HEIGHT[actor.kind];
    const unit = mc.meterInMercatorCoordinateUnits() * meters;
    const m = new THREE.Matrix4();
    // Même composition que l'exemple MapLibre : translation Mercator, échelle mètre (Y inversé), modèle Y-up → Z-up.
    m.makeTranslation(mc.x, mc.y, mc.z);
    m.scale(new THREE.Vector3(unit, -unit, unit));
    m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.multiply(new THREE.Matrix4().makeRotationY(-THREE.MathUtils.degToRad(heading) + YAW[actor.kind]));
    actor.root.matrixAutoUpdate = false;
    actor.root.matrix.copy(m);
    actor.root.matrixWorldNeedsUpdate = true;
  }

  async function build(marker: SceneMarker, clip: MotionClip): Promise<Actor> {
    const kind = kindOf(clip);
    const gltf = await loadGltf(URLS[kind]);
    const inner = cloneSkinned(gltf.scene) as THREE.Object3D;
    prep(inner);
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = size.y;
    if (Number.isFinite(height) && height > 1e-4) {
      const fit = UNIT_HEIGHT[kind] / height;
      inner.scale.multiplyScalar(fit);
      inner.position.y -= box.min.y * fit;
      inner.updateMatrix();
    }
    const root = new THREE.Group();
    root.add(inner);
    const actor: Actor = {
      id: marker.id, kind, root, inner, actions: {}, wheels: [],
      lat: marker.lat, lng: marker.lng, fromLat: marker.lat, fromLng: marker.lng, toLat: marker.lat, toLng: marker.lng,
      t0: performance.now(), heading: marker.headingDeg || 0, targetHeading: marker.headingDeg || 0,
    };
    if (kind === "person") {
      const mixer = new THREE.AnimationMixer(inner);
      actor.mixer = mixer;
      for (const key of ["idle", "walk", "run"] as const) {
        const clipSrc = gltf.animations.find((a) => a.name === CLIPS[key]);
        if (clipSrc) actor.actions[key] = mixer.clipAction(clipSrc);
      }
    } else {
      inner.traverse((o) => {
        if (/wheel/i.test(o.name)) actor.wheels.push(o);
      });
      if (kind === "moto") {
        const fx = exhaust();
        actor.sparks = fx.points;
        actor.life = fx.life;
        inner.add(fx.points);
      }
    }
    scene.add(root);
    place(actor, marker.lat, marker.lng, actor.heading);
    return actor;
  }

  function play(actor: Actor, clip: "idle" | "walk" | "run") {
    const next = actor.actions[clip];
    if (!next || actor.current === clip) return;
    const prev = actor.current ? actor.actions[actor.current] : undefined;
    next.enabled = true;
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.4, false);
    else next.fadeIn(0.3);
    actor.current = clip;
  }

  const onVisible = () => {
    if (!document.hidden) map.triggerRepaint();
  };

  const layer: CustomLayerInterface & { ready: Promise<void>; dispose: () => void } = {
    id: "marqueurs-3d",
    type: "custom",
    renderingMode: "3d",
    ready,
    onAdd(_map, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      document.addEventListener("visibilitychange", onVisible);
    },
    onRemove() {
      document.removeEventListener("visibilitychange", onVisible);
      renderer?.dispose();
      renderer = null;
    },
    render(_gl, options) {
      if (!renderer || failed || document.hidden) return;
      const { markers, thresholds } = read();
      const dt = Math.min(0.05, clock.getDelta());
      const nowMs = performance.now();
      const seen = new Set<string>();
      for (const marker of markers) {
        seen.add(marker.id);
        const clip = motionFor(marker.speedMps, marker.choice, thresholds);
        const kind = kindOf(clip);
        let actor = actors.get(marker.id);
        if (actor && actor.kind !== kind) {
          scene.remove(actor.root);
          actors.delete(marker.id);
          actor = undefined;
        }
        if (!actor) {
          void build(marker, clip).then((a) => {
            if (actors.has(marker.id)) return;
            actors.set(marker.id, a);
            resolveReady();
          }).catch((e) => {
            failed = true;
            rejectReady(e);
          });
          continue;
        }
        if (actor.toLat !== marker.lat || actor.toLng !== marker.lng) {
          actor.fromLat = actor.lat;
          actor.fromLng = actor.lng;
          actor.toLat = marker.lat;
          actor.toLng = marker.lng;
          actor.t0 = nowMs;
          if (marker.speedMps >= thresholds.stopMps) actor.targetHeading = marker.headingDeg;
        }
        const u = Math.min(1, (nowMs - actor.t0) / 1200);
        const s = u * u * (3 - 2 * u);
        actor.lat = actor.fromLat + (actor.toLat - actor.fromLat) * s;
        actor.lng = actor.fromLng + (actor.toLng - actor.fromLng) * s;
        actor.heading = lerpAngle(actor.heading, actor.targetHeading, 0.15);
        place(actor, actor.lat, actor.lng, actor.heading);
        if (actor.mixer && (clip === "idle" || clip === "walk" || clip === "run")) {
          play(actor, clip);
          actor.mixer.update(dt);
        }
        const moving = marker.speedMps >= thresholds.stopMps;
        if (moving) {
          for (const w of actor.wheels) w.rotation.x -= dt * Math.min(18, marker.speedMps * 1.4);
        }
        if (actor.sparks && actor.life) {
          actor.sparks.visible = moving && kind === "moto";
          const attr = actor.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < actor.life.length; i++) {
            actor.life[i] = (actor.life[i]! + dt * (0.6 + (i % 5) * 0.15)) % 1;
            const t = actor.life[i]!;
            attr.setXYZ(i, (i % 7 - 3) * 0.03, 0.05 + t * 0.35, -t * 1.3);
          }
          attr.needsUpdate = true;
        }
      }
      for (const [id, actor] of actors) {
        if (seen.has(id)) continue;
        scene.remove(actor.root);
        actors.delete(id);
      }
      if (actors.size || !markers.length) resolveReady();
      // modelViewProjectionMatrix est en pixels monde. mainMatrix projette le Mercator 0..1 (z conforme).
      const main = options.defaultProjectionData?.mainMatrix;
      if (main && main.length === 16) {
        camera.matrix.identity();
        camera.matrixWorld.identity();
        camera.matrixWorldInverse.identity();
        camera.projectionMatrix.fromArray(main);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        renderer.resetState();
        renderer.render(scene, camera);
      }
      map.triggerRepaint();
    },
    dispose() {
      document.removeEventListener("visibilitychange", onVisible);
      for (const actor of actors.values()) scene.remove(actor.root);
      actors.clear();
      renderer?.dispose();
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    },
  };
  return layer;
}
