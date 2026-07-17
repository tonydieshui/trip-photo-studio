const test = require('node:test');
const assert = require('node:assert/strict');

const { ANALYSIS_VERSION, analyzeBitmap } = require('../src/photo-analysis');

function solidBitmap(width, height, red, green, blue) {
  const bitmap = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    bitmap[index * 4] = blue;
    bitmap[index * 4 + 1] = green;
    bitmap[index * 4 + 2] = red;
    bitmap[index * 4 + 3] = 255;
  }
  return bitmap;
}

function splitBitmap(width, height, firstColor, secondColor) {
  const bitmap = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = x < width / 2 ? firstColor : secondColor;
      const offset = (y * width + x) * 4;
      bitmap[offset] = blue;
      bitmap[offset + 1] = green;
      bitmap[offset + 2] = red;
      bitmap[offset + 3] = 255;
    }
  }
  return bitmap;
}

test('深色图片会得到偏暗提示和版本号', () => {
  const result = analyzeBitmap(solidBitmap(12, 18, 8, 8, 8), 12, 18, { width: 1200, height: 1800 });
  assert.equal(result.version, ANALYSIS_VERSION);
  assert.equal(result.orientation, 'portrait');
  assert.ok(result.flags.includes('明显偏暗'));
  assert.ok(result.technicalScore < 80);
});

test('暖色图片会得到暖色调与主色标签', () => {
  const result = analyzeBitmap(solidBitmap(16, 10, 210, 96, 62), 16, 10);
  assert.equal(result.colorTone, 'warm');
  assert.ok(result.styleTags.includes('暖色调'));
  assert.ok(result.palette[0].hex.startsWith('#'));
});

test('分析结果包含可解释指标和摘要', () => {
  const width = 18;
  const height = 12;
  const bitmap = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = (x + y) % 2 === 0 ? 60 : 210;
      bitmap[offset] = value;
      bitmap[offset + 1] = value;
      bitmap[offset + 2] = value;
      bitmap[offset + 3] = 255;
    }
  }
  const result = analyzeBitmap(bitmap, width, height);
  assert.equal(typeof result.summary, 'string');
  assert.ok(result.summary.length > 10);
  assert.equal(typeof result.metrics.exposure, 'number');
  assert.equal(typeof result.composition.thirdsAffinity, 'number');
  assert.ok(result.styleTags.length >= 5);
});

test('能够识别色相环上相对的互补色', () => {
  const bitmap = splitBitmap(20, 12, [220, 72, 62], [48, 184, 200]);
  const result = analyzeBitmap(bitmap, 20, 12);
  assert.ok(result.colorProfile.harmonies.includes('complementary'));
  assert.ok(result.styleTags.includes('互补色构成'));
});

test('能够识别低饱和灰调的莫兰迪色系', () => {
  const result = analyzeBitmap(solidBitmap(16, 12, 145, 125, 135), 16, 12);
  assert.ok(result.colorProfile.presets.includes('morandi'));
  assert.ok(result.colorProfile.morandiScore >= 62);
  assert.ok(result.styleTags.includes('莫兰迪色系'));
});

test('黑白灰照片拥有独立的颜色预设', () => {
  const bitmap = splitBitmap(18, 10, [35, 35, 35], [220, 220, 220]);
  const result = analyzeBitmap(bitmap, 18, 10);
  assert.ok(result.colorProfile.presets.includes('black-white'));
  assert.equal(result.colorProfile.dominantFamily, 'neutral');
});
