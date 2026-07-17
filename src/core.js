const crypto = require('node:crypto');
const path = require('node:path');

const PHOTO_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif',
  '.tif', '.tiff', '.heic', '.heif',
  '.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.rw2', '.orf'
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi',
  '.mts', '.m2ts', '.mpg', '.mpeg', '.3gp'
]);

const DIRECT_PREVIEW_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'
]);

const VALID_STATUSES = new Set(['unreviewed', 'pick', 'maybe', 'reject']);

function isPhotoFile(filePath) {
  return PHOTO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isVideoFile(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isMediaFile(filePath) {
  return isPhotoFile(filePath) || isVideoFile(filePath);
}

function mediaKind(filePath) {
  return isVideoFile(filePath) ? 'video' : 'photo';
}

function canDirectPreview(filePath) {
  return DIRECT_PREVIEW_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function makeAssetId(filePath) {
  const normalized = path.resolve(filePath).replaceAll('\\', '/').toLowerCase();
  return crypto.createHash('sha1').update(normalized).digest('hex');
}

function sanitizeFileName(value, fallback = '未命名项目') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizeStatus(status) {
  return VALID_STATUSES.has(status) ? status : 'unreviewed';
}

function summarizeAssets(assets = []) {
  const summary = {
    total: assets.length,
    unreviewed: 0,
    pick: 0,
    maybe: 0,
    reject: 0,
    issues: 0
  };

  for (const asset of assets) {
    summary[normalizeStatus(asset.status)] += 1;
    if (asset.analysis?.flags?.length) summary.issues += 1;
  }

  return summary;
}

module.exports = {
  PHOTO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  DIRECT_PREVIEW_EXTENSIONS,
  VALID_STATUSES,
  isPhotoFile,
  isVideoFile,
  isMediaFile,
  mediaKind,
  canDirectPreview,
  makeAssetId,
  sanitizeFileName,
  normalizeStatus,
  summarizeAssets
};
