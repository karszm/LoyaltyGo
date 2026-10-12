// The grid stays on the GPU; the vertex shader folds and animates its surface.
export function createRibbonMesh() {
  const columns = 96;
  const rows = 128;
  const vertices = new Float32Array((columns + 1) * (rows + 1) * 2);
  const indices = new Uint16Array(columns * rows * 6);
  let vertex = 0;
  let index = 0;
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      vertices[vertex++] = column / columns;
      vertices[vertex++] = row / rows;
      if (column === columns || row === rows) continue;
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.set([a, b, a + 1, a + 1, b, b + 1], index);
      index += 6;
    }
  }
  return { vertices, indices };
}

export const vertexSource = `
  precision highp float;
  attribute vec2 position;
  uniform vec2 resolution;
  uniform float time, animationSpeed, ribbonWidth, ribbonTwist;
  uniform float positionX, positionY, blobDeformation, waveStrength, waveFrequency, waveAngle;
  varying vec2 vUv;
  varying vec3 vNormal;

  vec3 surface(vec2 uv) {
    float t = time * animationSpeed;
    float aspect = resolution.x / resolution.y;
    float mobile = 1.0 - smoothstep(0.65, 1.2, aspect);
    float u = uv.x * 2.0 - 1.0;
    float v = uv.y;
    float width = ribbonWidth * (0.87 + 0.18 * sin(v * 3.14)) * mix(1.0, 0.45, mobile);
    // A continuous half-turn folds the right edge back over the main sheet.
    float curl = max(0.0, (u - 0.25) / 0.75) * 3.141593;
    float radius = width * 0.75 / 3.141593;
    float x = u <= 0.25 ? u * width : 0.25 * width + sin(curl) * radius;
    float z = (1.0 - cos(curl)) * radius;
    float twist = ribbonTwist * (-0.38 + 0.85 * sin(v * 3.0 - 0.5)
                  + 0.12 * sin(t * 0.32 + v * 2.0));
    vec2 folded = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * vec2(x, z);
    float drift = blobDeformation * 0.12 * sin(v * 4.0 + t * 0.28);
    float flutter = waveStrength * 0.12 * sin(v * waveFrequency * 6.283 - t * 0.65 + u);
    float center = aspect * (0.23 + 0.46 * smoothstep(0.05, 0.95, v));
    center += mobile * 0.35;
    vec3 point = vec3(center + folded.x + drift, 1.55 - v * 3.2 + flutter, folded.y);
    point.z += blobDeformation * 0.08 * sin(u * 3.0 + v * 4.0 + t * 0.25);
    float angle = radians(waveAngle - 180.0);
    point.xy = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * point.xy;
    point.xy += vec2(positionX / 50.0 * aspect, positionY / 50.0);
    return point;
  }

  void main() {
    vUv = position;
    vec3 point = surface(position);
    vec3 du = surface(position + vec2(0.001, 0.0)) - point;
    vec3 dv = surface(position + vec2(0.0, 0.001)) - point;
    vNormal = normalize(cross(du, dv));
    gl_Position = vec4(point.x / (resolution.x / resolution.y), point.y, -point.z * 0.4, 1.0);
  }
`;

export const fragmentSource = `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform vec3 baseColorA, baseColorB, blobColor, blobAccent, highlightColor;
  uniform float colorBlend, swirlDetail, blurIntensity, highlightStrength, grainStrength;

  float random(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(random(cell), random(cell + vec2(1.0, 0.0)), f.x),
               mix(random(cell + vec2(0.0, 1.0)), random(cell + vec2(1.0)), f.x), f.y);
  }

  void main() {
    vec3 n = normalize(vNormal);
    float u = clamp(vUv.x + (colorBlend - 52.0) * 0.004, 0.0, 1.0);
    vec3 color = mix(baseColorA, baseColorB, smoothstep(0.02, 0.24, u));
    color = mix(color, blobAccent, smoothstep(0.17, 0.43, u));
    color = mix(color, blobColor, smoothstep(0.35, 0.62, u));
    color = mix(color, highlightColor, smoothstep(0.58, 0.88, u));
    color = mix(color, blobAccent, smoothstep(0.92, 1.0, u) * 0.6);

    float strands = noise(vec2(vUv.x * (260.0 + swirlDetail * 80.0), vUv.y * 4.0));
    color += (strands - 0.5) * mix(0.1, 0.035, blurIntensity / 100.0);
    float light = abs(dot(n, normalize(vec3(-0.5, 0.3, 1.0))));
    color *= 0.82 + 0.2 * light;
    float rim = pow(1.0 - abs(n.z), 1.5);
    float seam = exp(-pow((vUv.x - 0.76) * 18.0, 2.0));
    color = mix(color, vec3(1.0, 0.98, 0.93), clamp((rim * 0.45 + seam * 0.35) * highlightStrength, 0.0, 0.8));
    color += (random(gl_FragCoord.xy) - 0.5) * grainStrength;
    float edge = mix(0.001, 0.006, blurIntensity / 100.0);
    float alpha = smoothstep(0.0, edge, vUv.x) * (1.0 - smoothstep(1.0 - edge, 1.0, vUv.x));
    gl_FragColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
  }
`;
