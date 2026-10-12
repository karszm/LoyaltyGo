// Run: node --experimental-strip-types --test landing_page/src/lib/radiance.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToRgb, normalizeRadiance, radianceDefaults } from "./radiance.ts";
import { createRibbonMesh } from "./ribbon.ts";

test("radiance accepts the reference preset, custom colors and bounded parameters", () => {
  assert.deepEqual(normalizeRadiance({}), radianceDefaults);
  const custom = normalizeRadiance({
    baseColorA: "00ff80", baseColorB: "invalid", colorBlend: 0,
    waveStrength: 0, waveFrequency: 3.2, waveAngle: 500,
    blurIntensity: -1, swirlDetail: NaN, blobDeformation: Infinity,
  });
  assert.equal(custom.baseColorA, "#00FF80");
  assert.equal(custom.baseColorB, radianceDefaults.baseColorB);
  assert.equal(custom.colorBlend, 0);
  assert.equal(custom.waveStrength, 0);
  assert.equal(custom.waveFrequency, 3.2);
  assert.equal(custom.waveAngle, 360);
  assert.equal(custom.blurIntensity, 0);
  assert.equal(custom.swirlDetail, radianceDefaults.swirlDetail);
  assert.equal(custom.blobDeformation, radianceDefaults.blobDeformation);
  assert.deepEqual(hexToRgb(custom.baseColorA), [0, 1, 128 / 255]);
  assert.equal(radianceDefaults.waveAngle, 167);
});

test("ribbon mesh has valid triangles, complete UV coverage and 16-bit indices", () => {
  const { vertices, indices } = createRibbonMesh();
  const count = vertices.length / 2;
  assert.equal(count, 97 * 129);
  assert.equal(indices.length, 96 * 128 * 6);
  assert.ok(count < 65536);
  assert.ok(vertices.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.deepEqual(Array.from(vertices.slice(0, 2)), [0, 0]);
  assert.deepEqual(Array.from(vertices.slice(-2)), [1, 1]);
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = Array.from(indices.slice(i, i + 3));
    assert.equal(new Set(triangle).size, 3);
    assert.ok(triangle.every(index => index < count));
    const [a, b, c] = triangle.map(index => [vertices[index * 2], vertices[index * 2 + 1]]);
    assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0);
  }
  const options = normalizeRadiance({ ribbonWidth: -1, ribbonTwist: 8, animationSpeed: 0, positionX: 100, grainStrength: NaN });
  assert.equal(options.ribbonWidth, 0.4);
  assert.equal(options.ribbonTwist, 2);
  assert.equal(options.animationSpeed, 0);
  assert.equal(options.positionX, 50);
  assert.equal(options.grainStrength, radianceDefaults.grainStrength);
});
