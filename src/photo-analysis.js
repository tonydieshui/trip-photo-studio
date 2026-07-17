const ANALYSIS_VERSION = 3;

const COLOR_FAMILY_LABELS = {
  red: '红色',
  orange: '橙色',
  yellow: '黄色',
  green: '绿色',
  cyan: '青色',
  blue: '蓝色',
  purple: '紫色',
  pink: '粉色',
  neutral: '中性色'
};

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(histogram, total, ratio) {
  const target = total * ratio;
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value];
    if (seen >= target) return value;
  }
  return histogram.length - 1;
}

function rgbToHsv(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta > 0) {
    if (maximum === r) hue = 60 * (((g - b) / delta) % 6);
    else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;

  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum
  };
}

function colorFamily(red, green, blue) {
  const { hue, saturation, value } = rgbToHsv(red, green, blue);
  if (saturation < 0.12 || value < 0.14) return 'neutral';
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 195) return 'cyan';
  if (hue < 255) return 'blue';
  if (hue < 292) return 'purple';
  return 'pink';
}

function colorName(red, green, blue) {
  const { hue, saturation, value } = rgbToHsv(red, green, blue);
  if (value < 0.14) return '深黑';
  if (value > 0.9 && saturation < 0.12) return '亮白';
  if (saturation < 0.12) return value < 0.48 ? '深灰' : '浅灰';
  if (hue < 15 || hue >= 345) return '红色';
  if (hue < 45) return '橙色';
  if (hue < 70) return '黄色';
  if (hue < 165) return '绿色';
  if (hue < 195) return '青色';
  if (hue < 255) return '蓝色';
  if (hue < 292) return '紫色';
  return '粉色';
}

function toHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function dominantPalette(colorBins, totalPixels) {
  return [...colorBins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((entry) => {
      const red = entry.red / entry.count;
      const green = entry.green / entry.count;
      const blue = entry.blue / entry.count;
      const hsv = rgbToHsv(red, green, blue);
      return {
        hex: toHex(red, green, blue),
        name: colorName(red, green, blue),
        family: colorFamily(red, green, blue),
        hue: Math.round(hsv.hue),
        saturation: Math.round(hsv.saturation * 100),
        brightness: Math.round(hsv.value * 100),
        weight: round((entry.count / totalPixels) * 100, 1)
      };
    });
}

function hueDistance(first, second) {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}

function circularHueSpan(hues) {
  if (hues.length < 2) return 0;
  const sorted = [...hues].sort((a, b) => a - b);
  let largestGap = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const next = index === sorted.length - 1 ? sorted[0] + 360 : sorted[index + 1];
    largestGap = Math.max(largestGap, next - sorted[index]);
  }
  return 360 - largestGap;
}

function buildColorProfile(palette, imageMetrics = {}) {
  const weightedPalette = (palette || []).filter((color) => Number(color.weight) > 0);
  const paletteWeight = weightedPalette.reduce((sum, color) => sum + Number(color.weight), 0) || 1;
  const chromatic = weightedPalette.filter((color) => (
    color.family !== 'neutral' && Number(color.saturation) >= 10 && Number(color.brightness) >= 14
  ));
  const chromaticWeight = chromatic.reduce((sum, color) => sum + Number(color.weight), 0) || 1;
  const weightedAverage = (items, property, totalWeight) => items.reduce(
    (sum, color) => sum + Number(color[property] || 0) * Number(color.weight),
    0
  ) / totalWeight;
  const averageSaturation = weightedAverage(weightedPalette, 'saturation', paletteWeight);
  const averageBrightness = weightedAverage(weightedPalette, 'brightness', paletteWeight);
  const chromaticSaturation = chromatic.length
    ? weightedAverage(chromatic, 'saturation', chromaticWeight)
    : 0;

  const familyWeights = new Map();
  for (const color of weightedPalette) {
    familyWeights.set(color.family, (familyWeights.get(color.family) || 0) + Number(color.weight));
  }
  const sortedFamilies = [...familyWeights.entries()].sort((a, b) => b[1] - a[1]);
  const leadingWeight = sortedFamilies[0]?.[1] || 0;
  const families = sortedFamilies
    .filter(([, weight]) => weight >= Math.max(2, leadingWeight * 0.18))
    .map(([family]) => family);
  const dominantFamily = sortedFamilies[0]?.[0] || 'neutral';

  const meaningfulColors = chromatic.filter((color) => (
    Number(color.weight) / chromaticWeight >= 0.1
  ));
  const hues = meaningfulColors.map((color) => Number(color.hue));
  const hueSpan = circularHueSpan(hues);
  let complementary = false;
  for (let first = 0; first < meaningfulColors.length; first += 1) {
    for (let second = first + 1; second < meaningfulColors.length; second += 1) {
      const distance = hueDistance(meaningfulColors[first].hue, meaningfulColors[second].hue);
      if (distance >= 150 && distance <= 210) complementary = true;
    }
  }

  const chromaticFamilies = [...new Set(chromatic.map((color) => color.family))];
  const blackWhite = Number(imageMetrics.saturation || 0) < 7;
  const monochrome = !blackWhite && chromatic.length > 0 && hueSpan <= 32;
  const analogous = !monochrome && meaningfulColors.length >= 2 && hueSpan <= 78;
  const multicolor = chromaticFamilies.length >= 3 && hueSpan >= 105;
  const harmonies = [];
  if (complementary) harmonies.push('complementary');
  if (analogous) harmonies.push('analogous');
  if (monochrome) harmonies.push('monochrome');
  if (multicolor) harmonies.push('multicolor');

  const globalSaturation = Number(imageMetrics.saturation || 0);
  const imageBrightness = Number(imageMetrics.brightness || 0);
  const contrast = Number(imageMetrics.contrast || 0);
  const warmth = Number(imageMetrics.warmth || 0);
  const shadowClip = Number(imageMetrics.shadowClip || 0);
  const familyShare = (...targets) => chromatic.reduce((sum, color) => (
    targets.includes(color.family) ? sum + Number(color.weight) : sum
  ), 0) / chromaticWeight;
  const mutedShare = weightedPalette.reduce((sum, color) => (
    Number(color.saturation) >= 8
      && Number(color.saturation) <= 46
      && Number(color.brightness) >= 24
      && Number(color.brightness) <= 88
      ? sum + Number(color.weight)
      : sum
  ), 0) / paletteWeight;
  const morandiScore = Math.round(clamp(
    82
      - Math.abs(chromaticSaturation - 25) * 1.25
      - Math.max(0, Math.abs(averageBrightness - 58) - 18) * 1.1
      - Math.max(0, globalSaturation - 40) * 2
      - Math.max(0, contrast - 62) * 0.8
      + mutedShare * 18
  ));

  const presets = [];
  if (
    chromatic.length
    && globalSaturation >= 7
    && globalSaturation <= 40
    && chromaticSaturation >= 10
    && chromaticSaturation <= 48
    && averageBrightness >= 28
    && averageBrightness <= 86
    && morandiScore >= 62
  ) presets.push('morandi');
  if (
    chromatic.length
    && imageBrightness >= 150
    && averageBrightness >= 68
    && chromaticSaturation >= 10
    && chromaticSaturation <= 58
    && shadowClip < 12
  ) presets.push('pastel');
  if (globalSaturation > 48 || chromaticSaturation > 58) presets.push('vivid');
  if (blackWhite) presets.push('black-white');
  if (
    chromatic.length
    && familyShare('red', 'orange', 'yellow', 'green') >= 0.7
    && chromaticSaturation >= 10
    && chromaticSaturation <= 60
    && averageBrightness <= 80
  ) presets.push('earthy');
  if (complementary && familyShare('cyan', 'blue') >= 0.18 && familyShare('orange') >= 0.18) {
    presets.push('teal-orange');
  }
  if (familyShare('red', 'orange', 'pink') >= 0.68 && warmth > 8) presets.push('sunset');
  if (familyShare('green') >= 0.58 && imageBrightness < 175) presets.push('forest');
  if (familyShare('blue', 'cyan', 'purple') >= 0.62 && warmth < -6 && imageBrightness > 105) {
    presets.push('cool-clean');
  }
  if (familyShare('orange', 'yellow') >= 0.62 && warmth > 8 && imageBrightness > 105) {
    presets.push('golden');
  }

  const harmonyLabels = {
    complementary: '互补色构成',
    analogous: '邻近色和谐',
    monochrome: '单色系',
    multicolor: '多彩画面'
  };
  const presetLabels = {
    morandi: '莫兰迪色系',
    pastel: '柔和粉彩',
    vivid: '高饱和色彩',
    'black-white': '黑白灰',
    earthy: '大地色系',
    'teal-orange': '青橙电影感',
    sunset: '日落色系',
    forest: '森系色彩',
    'cool-clean': '清冷色调',
    golden: '金色暖调'
  };
  const labels = [
    ...harmonies.map((harmony) => harmonyLabels[harmony]),
    ...presets.map((preset) => presetLabels[preset])
  ];

  return {
    dominantFamily,
    dominantFamilyLabel: COLOR_FAMILY_LABELS[dominantFamily],
    families,
    harmonies,
    presets,
    labels,
    averageSaturation: round(averageSaturation, 1),
    averageBrightness: round(averageBrightness, 1),
    hueSpan: Math.round(hueSpan),
    morandiScore
  };
}

function analyzeBitmap(bitmap, width, height, originalSize = { width, height }) {
  const totalPixels = width * height;
  if (!bitmap || width < 1 || height < 1 || bitmap.length < totalPixels * 4) {
    throw new Error('无效的图片像素数据');
  }

  const luminance = new Float32Array(totalPixels);
  const histogram = new Uint32Array(256);
  const colorBins = new Map();
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let saturationTotal = 0;
  let warmthTotal = 0;
  let veryDark = 0;
  let veryBright = 0;
  let dark = 0;
  let bright = 0;

  for (let index = 0; index < totalPixels; index += 1) {
    const offset = index * 4;
    const blue = bitmap[offset] || 0;
    const green = bitmap[offset + 1] || 0;
    const red = bitmap[offset + 2] || 0;
    const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const histogramValue = Math.max(0, Math.min(255, Math.round(value)));
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);

    luminance[index] = value;
    histogram[histogramValue] += 1;
    luminanceTotal += value;
    luminanceSquaredTotal += value * value;
    saturationTotal += maximum === 0 ? 0 : (maximum - minimum) / maximum;
    warmthTotal += red - blue;
    if (value < 16) veryDark += 1;
    if (value > 244) veryBright += 1;
    if (value < 40) dark += 1;
    if (value > 220) bright += 1;

    const key = `${red >> 5}-${green >> 5}-${blue >> 5}`;
    const bin = colorBins.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bin.count += 1;
    bin.red += red;
    bin.green += green;
    bin.blue += blue;
    colorBins.set(key, bin);
  }

  let detailTotal = 0;
  let detailSamples = 0;
  let laplacianTotal = 0;
  let laplacianSquaredTotal = 0;
  let laplacianSamples = 0;
  let edgeWeight = 0;
  let edgeX = 0;
  let edgeY = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const center = luminance[index];
      const horizontal = Math.abs(center - luminance[index - 1]);
      const vertical = Math.abs(center - luminance[index - width]);
      const edge = horizontal + vertical;
      const laplacian = (4 * center)
        - luminance[index - 1]
        - luminance[index + 1]
        - luminance[index - width]
        - luminance[index + width];

      detailTotal += edge;
      detailSamples += 2;
      laplacianTotal += laplacian;
      laplacianSquaredTotal += laplacian * laplacian;
      laplacianSamples += 1;
      edgeWeight += edge;
      edgeX += (x / Math.max(1, width - 1)) * edge;
      edgeY += (y / Math.max(1, height - 1)) * edge;
    }
  }

  let entropy = 0;
  for (const count of histogram) {
    if (!count) continue;
    const probability = count / totalPixels;
    entropy -= probability * Math.log2(probability);
  }

  const brightness = luminanceTotal / totalPixels;
  const variance = Math.max(0, luminanceSquaredTotal / totalPixels - brightness * brightness);
  const contrast = Math.sqrt(variance);
  const detail = detailTotal / Math.max(1, detailSamples);
  const laplacianMean = laplacianTotal / Math.max(1, laplacianSamples);
  const laplacianVariance = Math.max(
    0,
    laplacianSquaredTotal / Math.max(1, laplacianSamples) - laplacianMean * laplacianMean
  );
  const detailScore = clamp(((detail - 3) / 24) * 100);
  const laplacianScore = clamp(((Math.log10(laplacianVariance + 1) - 0.45) / 2.35) * 100);
  const clarity = Math.round(detailScore * 0.58 + laplacianScore * 0.42);
  const saturation = (saturationTotal / totalPixels) * 100;
  const warmth = warmthTotal / totalPixels;
  const shadowClip = veryDark / totalPixels;
  const highlightClip = veryBright / totalPixels;
  const darkRatio = dark / totalPixels;
  const brightRatio = bright / totalPixels;
  const lowPercentile = percentile(histogram, totalPixels, 0.05);
  const highPercentile = percentile(histogram, totalPixels, 0.95);
  const dynamicRange = highPercentile - lowPercentile;
  const visualCenter = {
    x: edgeWeight > 0 ? edgeX / edgeWeight : 0.5,
    y: edgeWeight > 0 ? edgeY / edgeWeight : 0.5
  };

  const aspectRatio = originalSize.width / Math.max(1, originalSize.height);
  const orientation = aspectRatio > 1.12 ? 'landscape' : aspectRatio < 0.89 ? 'portrait' : 'square';
  const orientationLabel = {
    landscape: '横幅构图',
    portrait: '竖幅构图',
    square: '方形构图'
  }[orientation];
  const colorTone = warmth > 14 ? 'warm' : warmth < -14 ? 'cool' : 'neutral';
  const toneLabel = { warm: '暖色调', cool: '冷色调', neutral: '中性色调' }[colorTone];
  const saturationLabel = saturation < 16 ? '低饱和' : saturation > 48 ? '鲜明色彩' : '柔和色彩';
  const contrastLabel = contrast < 28 ? '低反差' : contrast > 68 ? '高反差' : '层次均衡';
  const brightnessLabel = brightness < 70 ? '暗调氛围' : brightness > 176 ? '明亮通透' : '自然光感';
  const detailLabel = clarity < 26 ? '柔和质感' : clarity > 72 ? '细节丰富' : '细节自然';
  const palette = dominantPalette(colorBins, totalPixels);
  const dominantColor = palette[0];
  const colorProfile = buildColorProfile(palette, {
    saturation,
    brightness,
    contrast,
    warmth,
    shadowClip: shadowClip * 100
  });

  const thirdsPoints = [
    [1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]
  ];
  const thirdsDistance = Math.min(...thirdsPoints.map(([x, y]) => (
    Math.hypot(visualCenter.x - x, visualCenter.y - y)
  )));
  const centerDistance = Math.hypot(visualCenter.x - 0.5, visualCenter.y - 0.5);
  const thirdsAffinity = Math.round(clamp(100 - (thirdsDistance / 0.36) * 100));
  const balance = Math.round(clamp(100 - (centerDistance / 0.5) * 100));
  const compositionLabel = thirdsAffinity > 70
    ? '三分构图倾向'
    : balance > 78 ? '中心构图倾向' : '自由构图倾向';
  const centerLabel = visualCenter.x < 0.42
    ? '视觉重心偏左'
    : visualCenter.x > 0.58 ? '视觉重心偏右' : '视觉重心居中';

  const flags = [];
  let technicalScore = 100;

  if (brightness < 32) {
    flags.push('明显偏暗');
    technicalScore -= 28;
  } else if (brightness < 52) {
    flags.push('可能偏暗');
    technicalScore -= 16;
  } else if (brightness > 224) {
    flags.push('明显偏亮');
    technicalScore -= 24;
  } else if (brightness > 202) {
    flags.push('可能偏亮');
    technicalScore -= 14;
  }

  if (shadowClip > 0.22) {
    flags.push('暗部压黑');
    technicalScore -= 10;
  }
  if (highlightClip > 0.12) {
    flags.push('高光溢出');
    technicalScore -= 10;
  }
  if (dynamicRange < 38 && contrast < 24) {
    flags.push('层次偏平');
    technicalScore -= 8;
  }
  if (clarity < 24) {
    flags.push('细节偏少');
    technicalScore -= 18;
  } else if (clarity < 38) {
    technicalScore -= 7;
  }

  technicalScore = Math.max(0, Math.round(technicalScore));
  const exposureBalance = Math.round(clamp(
    100 - Math.abs(brightness - 128) * 0.62 - shadowClip * 35 - highlightClip * 42
  ));
  const styleTags = [
    orientationLabel,
    toneLabel,
    saturationLabel,
    contrastLabel,
    brightnessLabel,
    detailLabel,
    compositionLabel,
    centerLabel
  ];

  if (entropy < 5.1 && detail < 10) styleTags.push('极简画面');
  if (darkRatio > 0.16 && brightRatio > 0.08 && dynamicRange > 168) styleTags.push('强光影');
  if (saturation < 6) styleTags.push('近单色');
  if (dominantColor && !['深黑', '深灰', '浅灰', '亮白'].includes(dominantColor.name)) {
    styleTags.push(`${dominantColor.name}主调`);
  }
  styleTags.push(...colorProfile.labels);

  const uniqueTags = [...new Set(styleTags)];
  const technicalSummary = flags.length
    ? `技术上检测到${flags.slice(0, 2).join('、')}`
    : '曝光、层次和细节状态整体稳定';
  const summary = `${toneLabel}、${saturationLabel}的${orientationLabel}，${contrastLabel}，${technicalSummary}。`;

  return {
    version: ANALYSIS_VERSION,
    state: 'done',
    score: technicalScore,
    technicalScore,
    brightness: Math.round(brightness),
    detail: round(detail, 1),
    contrast: round(contrast, 1),
    saturation: round(saturation, 1),
    warmth: round(warmth, 1),
    clarity,
    entropy: round(entropy, 2),
    dynamicRange,
    shadowClip: round(shadowClip * 100, 1),
    highlightClip: round(highlightClip * 100, 1),
    darkRatio: round(darkRatio * 100, 1),
    brightRatio: round(brightRatio * 100, 1),
    orientation,
    colorTone,
    palette,
    colorProfile,
    styleTags: uniqueTags,
    summary,
    composition: {
      visualCenter: { x: round(visualCenter.x, 3), y: round(visualCenter.y, 3) },
      balance,
      thirdsAffinity,
      label: compositionLabel,
      centerLabel
    },
    metrics: {
      exposure: exposureBalance,
      clarity,
      contrast: Math.round(clamp((contrast / 82) * 100)),
      saturation: Math.round(clamp(saturation)),
      warmth: Math.round(clamp(50 + warmth * 1.25))
    },
    flags
  };
}

module.exports = {
  ANALYSIS_VERSION,
  analyzeBitmap,
  buildColorProfile,
  colorFamily,
  colorName
};
