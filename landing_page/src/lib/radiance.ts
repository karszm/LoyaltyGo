export const radianceDefaults = {
  baseColorA: "#B8DEFF",
  baseColorB: "#8674F5",
  blobColor: "#FF884A",
  blobAccent: "#F58CD8",
  highlightColor: "#FFD078",
  colorBlend: 100,
  swirlDetail: 5,
  blobDeformation: 1,
  waveStrength: 1,
  waveFrequency: 0,
  waveAngle: 167,
  blurIntensity: 0,
  ribbonWidth: 1.09,
  ribbonTwist: 0,
  positionX: 1,
  positionY: 8,
  animationSpeed: 0.7,
  highlightStrength: 0,
  grainStrength: 0.1,
};

export type RadianceOptions = typeof radianceDefaults;

export const colorControls = [
  ["baseColorA", "Base Color A"],
  ["baseColorB", "Base Color B"],
  ["blobColor", "Blob Color"],
  ["blobAccent", "Blob Accent"],
  ["highlightColor", "Highlight Color"],
] as const;

// Angles are degrees; blend and blur are percentages. Other values are multipliers.
export const numberControls = [
  ["colorBlend", "Color Blend", 0, 100, 1],
  ["swirlDetail", "Swirl Detail", 0, 5, 0.1],
  ["blobDeformation", "Blob Deformation", 0, 1, 0.01],
  ["waveStrength", "Wave Strength", 0, 1, 0.01],
  ["waveFrequency", "Wave Frequency", 0, 10, 0.1],
  ["waveAngle", "Wave Angle", 0, 360, 1],
  ["blurIntensity", "Blur Intensity", 0, 100, 1],
  ["ribbonWidth", "Ribbon Width", 0.4, 2.5, 0.01],
  ["ribbonTwist", "Ribbon Twist", 0, 2, 0.01],
  ["positionX", "Position X (%)", -50, 50, 1],
  ["positionY", "Position Y (%)", -50, 50, 1],
  ["animationSpeed", "Animation Speed", 0, 2, 0.01],
  ["highlightStrength", "Edge Light", 0, 1, 0.01],
  ["grainStrength", "Grain", 0, 0.1, 0.001],
] as const;

export function normalizeRadiance(input: Partial<RadianceOptions>): RadianceOptions {
  const options = { ...radianceDefaults };
  for (const [key] of colorControls) {
    const value = input[key];
    if (typeof value === "string" && /^#?[\da-f]{6}$/i.test(value)) {
      options[key] = `#${value.replace(/^#/, "").toUpperCase()}`;
    }
  }
  for (const [key, , min, max] of numberControls) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      options[key] = Math.min(max, Math.max(min, value));
    }
  }
  return options;
}

export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}
