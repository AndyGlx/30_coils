import * as THREE from "https://unpkg.com/three@0.166.1/build/three.module.js";

const sliderHost = document.getElementById("slider-list");
const matrixHost = document.getElementById("specimen-matrix");

const controls = [
  { key: "diameter", label: "Diameter", mode: "ratio", range: 0.56, bounds: [0.05, 0.95] },
  { key: "turns", label: "Length (turns)", mode: "ratio", range: 0.35, bounds: [0.05, 0.95] },
  { key: "pitch", label: "Pitch", mode: "ratio", range: 0.35, bounds: [0.05, 0.95] },
  { key: "thickness", label: "Wire thickness", mode: "ratio", range: 0.62, bounds: [0.05, 0.95] },
  { key: "taper", label: "Taper over length", mode: "signed", range: 0.3, bounds: [0, 1.1] },
  { key: "curvature", label: "Axial curvature", mode: "signed", range: 0.3, bounds: [0, 0.85] }
];

const rowDefinitions = [
  { key: "diameter", label: "Diameter" },
  { key: "turns", label: "Length" },
  { key: "pitch", label: "Pitch" },
  { key: "thickness", label: "Thickness" },
  { key: "taper", label: "Taper" },
  { key: "curvature", label: "Curvature" }
];

const state = Object.fromEntries(controls.map((control) => [control.key, { range: control.range }]));
const previews = [];

const sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
sharedRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
sharedRenderer.toneMappingExposure = 1.03;

for (const control of controls) {
  const card = document.createElement("section");
  card.className = "slider-card";

  const top = document.createElement("div");
  top.className = "slider-topline";

  const name = document.createElement("div");
  name.className = "slider-name";
  name.textContent = control.label;

  const value = document.createElement("div");
  value.className = "slider-value";
  top.append(name, value);

  const pair = document.createElement("div");
  pair.className = "slider-pair";

  const makeRange = () => {
    const row = document.createElement("label");
    row.className = "slider-row";

    const unit = document.createElement("span");
    unit.className = "slider-unit";
    unit.textContent = "Range";

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(control.bounds[0]);
    input.max = String(control.bounds[1]);
    input.step = control.mode === "ratio" ? "0.01" : "0.005";
    input.value = String(state[control.key].range);
    input.addEventListener("input", () => {
      state[control.key].range = Number(input.value);
      updateSliderText(control, value);
      rebuildSpecimens();
    });

    row.append(unit, input);
    return row;
  };

  pair.append(makeRange());
  card.append(top, pair);
  sliderHost.append(card);
  updateSliderText(control, value);
}

function updateSliderText(control, host) {
  const current = state[control.key];
  host.textContent =
    control.mode === "ratio"
      ? `1.00x +/- ${current.range.toFixed(2)}`
      : `+/- ${current.range.toFixed(2)}`;
}

function valueSeries(controlKey) {
  const control = controls.find((entry) => entry.key === controlKey);
  const { range } = state[controlKey];
  if (control.mode === "ratio") {
    const left = Math.max(0.05, 1 - range);
    const right = 1 + range;
    const series = [left, (left + 1) / 2, 1, (1 + right) / 2, right];
    return controlKey === "pitch" ? [...series].reverse() : series;
  }
  return [range, range / 2, 0, -range / 2, -range];
}

function specimenConfig(rowKey, stepValue) {
  const config = { diameter: 1, turns: 1, thickness: 1, pitch: 1, taper: 0, curvature: 0 };
  config[rowKey] = stepValue;
  return config;
}

function buildSpecimen({ diameter = 1, turns = 1, thickness = 1, pitch = 1, taper = 0, curvature = 0, rowIndex = 0, reference = false }) {
  const baseDiameter = 1.7;
  const helixDiameter = baseDiameter * diameter;
  const helixRadius = helixDiameter / 2;
  const baseTurnCount = 5 * turns;
  const totalLength = helixDiameter * baseTurnCount;
  const axialPitch = helixDiameter * pitch;
  const turnCount = Math.max(0.6, totalLength / Math.max(axialPitch, 1e-4));
  const length = totalLength;
  const wireRadius = 0.11 * thickness;
  const points = [];
  const samples = 240;
  const bendAngle = curvature * 3.0;

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const angle = t * Math.PI * 2 * turnCount;
    const taperScale = 1 + taper * 1.45 * (t - 0.5) * 2;
    const taperRadius = Math.max(helixRadius * 0.18, helixRadius * taperScale);
    const radialX = Math.cos(angle) * taperRadius;
    const radialY = Math.sin(angle) * taperRadius;

    if (Math.abs(bendAngle) < 1e-5) {
      points.push(new THREE.Vector3(radialX, radialY, (t - 0.5) * length));
      continue;
    }

    const phi = (t - 0.5) * bendAngle;
    const signedRadius = length / bendAngle;
    const centerX = signedRadius * (1 - Math.cos(phi));
    const centerZ = signedRadius * Math.sin(phi);
    const bentX = centerX + Math.cos(phi) * radialX;
    const bentZ = centerZ - Math.sin(phi) * radialX;

    points.push(new THREE.Vector3(bentX, radialY, bentZ));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, samples, wireRadius, 14, false);
  const rowPalettes = [
    { color: 0x67cfff, emissive: 0x143b73 },
    { color: 0x72d6ff, emissive: 0x163f79 },
    { color: 0x7ad8f8, emissive: 0x1b4570 },
    { color: 0x82cbff, emissive: 0x183a7d },
    { color: 0x90ddff, emissive: 0x214880 }
  ];
  const palette = rowPalettes[rowIndex % rowPalettes.length];
  const material = new THREE.MeshPhysicalMaterial({
    color: palette.color,
    emissive: palette.emissive,
    emissiveIntensity: reference ? 0.16 : 0.11,
    metalness: 0.08,
    roughness: 0.24,
    clearcoat: 0.5,
    clearcoatRoughness: 0.18
  });

  const mesh = new THREE.Mesh(geometry, material);

  const wrapper = new THREE.Group();
  wrapper.add(mesh);
  wrapper.rotation.x = 0.98;
  wrapper.rotation.y = -0.46;
  wrapper.rotation.z = 0.26;
  return wrapper;
}

function buildPreviewCard({ metaText, reference, config, index, rowIndex }) {
  const card = document.createElement("article");
  card.className = `specimen-card${reference ? " is-reference" : ""}`;

  const topline = document.createElement("div");
  topline.className = "specimen-topline";

  const meta = document.createElement("div");
  meta.className = "specimen-meta";
  meta.textContent = metaText;
  topline.append(meta);

  const canvas = document.createElement("canvas");
  canvas.className = "specimen-canvas";
  const context2d = canvas.getContext("2d");

  card.append(topline, canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf4f8fb, 22, 40);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, -1.4, 19.6);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.26));

  const keyLight = new THREE.DirectionalLight(0xf7fbff, 1.25);
  keyLight.position.set(5, 7, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xa8cbe5, 0.78);
  rimLight.position.set(-4, -5, 8);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0xd7ebf8, 0.55, 40);
  fillLight.position.set(0, 0, 8);
  scene.add(fillLight);

  const previewGroup = new THREE.Group();
  previewGroup.rotation.x = 0.98;
  previewGroup.rotation.y = -0.46 + (index % 5) * 0.012;
  previewGroup.rotation.z = 0.24 - Math.floor(index / 5) * 0.01;
  previewGroup.add(buildSpecimen({ ...config, rowIndex, reference }));
  scene.add(previewGroup);

  const preview = { scene, camera, canvas, context2d, group: previewGroup, rowIndex };
  previews.push(preview);
  return card;
}

function formatMeta(rowKey, step) {
  if (rowKey === "diameter" || rowKey === "turns" || rowKey === "thickness" || rowKey === "pitch") {
    return `${step.toFixed(2)}x`;
  }
  return `${step >= 0 ? "+" : ""}${step.toFixed(2)}`;
}

function buildMatrix() {
  let specimenIndex = 0;
  rowDefinitions.forEach((row, rowIndex) => {
    const rowElement = document.createElement("section");
    rowElement.className = `specimen-row row-tone-${rowIndex}`;

    const label = document.createElement("div");
    label.className = "row-label";
    const labelText = document.createElement("span");
    labelText.textContent = row.label;
    label.append(labelText);
    rowElement.append(label);

    valueSeries(row.key).forEach((step) => {
      const referenceValue = row.key === "taper" || row.key === "curvature" ? 0 : 1;
      const reference = Math.abs(step - referenceValue) < 0.001;
      rowElement.append(
        buildPreviewCard({
          metaText: formatMeta(row.key, step),
          reference,
          config: specimenConfig(row.key, step),
          index: specimenIndex,
          rowIndex
        })
      );
      specimenIndex += 1;
    });

    matrixHost.append(rowElement);
  });
}

function rebuildSpecimens() {
  let previewIndex = 0;
  rowDefinitions.forEach((row) => {
    valueSeries(row.key).forEach((step) => {
      const referenceValue = row.key === "taper" || row.key === "curvature" ? 0 : 1;
      const reference = Math.abs(step - referenceValue) < 0.001;
      const preview = previews[previewIndex];
      preview.group.traverse((node) => {
        if (node !== preview.group && node.geometry) {
          node.geometry.dispose();
        }
        if (node !== preview.group && node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((material) => material.dispose());
          } else {
            node.material.dispose();
          }
        }
      });
      preview.group.clear();
      preview.group.add(buildSpecimen({ ...specimenConfig(row.key, step), rowIndex: preview.rowIndex, reference }));
      preview.group.rotation.x = 0.98;
      preview.group.rotation.y = -0.46 + (previewIndex % 5) * 0.012;
      preview.group.rotation.z = 0.24 - Math.floor(previewIndex / 5) * 0.01;
      preview.canvas.closest(".specimen-card").classList.toggle("is-reference", reference);
      preview.canvas.closest(".specimen-card").querySelector(".specimen-meta").textContent = formatMeta(row.key, step);
      renderPreview(preview);
      previewIndex += 1;
    });
  });
}

function renderPreview(preview) {
  const rect = preview.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio, 2);
  preview.canvas.width = Math.max(1, Math.round(width * dpr));
  preview.canvas.height = Math.max(1, Math.round(height * dpr));
  preview.camera.aspect = width / height;
  preview.camera.updateProjectionMatrix();
  sharedRenderer.setSize(width, height, false);
  sharedRenderer.render(preview.scene, preview.camera);
  preview.context2d.setTransform(1, 0, 0, 1, 0, 0);
  preview.context2d.clearRect(0, 0, preview.canvas.width, preview.canvas.height);
  preview.context2d.drawImage(
    sharedRenderer.domElement,
    0,
    0,
    sharedRenderer.domElement.width,
    sharedRenderer.domElement.height,
    0,
    0,
    preview.canvas.width,
    preview.canvas.height
  );
}

function renderAllPreviews() {
  previews.forEach(renderPreview);
}

buildMatrix();
rebuildSpecimens();
new ResizeObserver(renderAllPreviews).observe(matrixHost);
window.addEventListener("resize", renderAllPreviews);
requestAnimationFrame(renderAllPreviews);
