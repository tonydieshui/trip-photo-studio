const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canDirectPreview,
  isPhotoFile,
  isVideoFile,
  isMediaFile,
  mediaKind,
  makeAssetId,
  normalizeStatus,
  sanitizeFileName,
  summarizeAssets
} = require('../src/core');

test('识别常见照片和 RAW 文件', () => {
  assert.equal(isPhotoFile('C:/photos/a.JPG'), true);
  assert.equal(isPhotoFile('C:/photos/a.CR3'), true);
  assert.equal(isPhotoFile('C:/photos/a.mp4'), false);
});

test('识别常见旅行视频并区分素材类型', () => {
  assert.equal(isVideoFile('C:/travel/clip.MP4'), true);
  assert.equal(isVideoFile('C:/travel/camera.MTS'), true);
  assert.equal(isVideoFile('C:/travel/photo.jpg'), false);
  assert.equal(isMediaFile('C:/travel/clip.mov'), true);
  assert.equal(mediaKind('C:/travel/clip.webm'), 'video');
  assert.equal(mediaKind('C:/travel/photo.jpeg'), 'photo');
});

test('区分可直接预览格式', () => {
  assert.equal(canDirectPreview('a.jpeg'), true);
  assert.equal(canDirectPreview('a.nef'), false);
});

test('相同路径生成稳定素材 ID', () => {
  assert.equal(makeAssetId('C:/Photos/A.jpg'), makeAssetId('c:/photos/a.jpg'));
});

test('清理 Windows 文件夹名称中的非法字符', () => {
  assert.equal(sanitizeFileName('北海道:夏天?'), '北海道-夏天-');
  assert.equal(sanitizeFileName('  '), '未命名项目');
});

test('非法状态回退为未筛选', () => {
  assert.equal(normalizeStatus('pick'), 'pick');
  assert.equal(normalizeStatus('deleted'), 'unreviewed');
});

test('汇总筛选状态和质量提示', () => {
  const summary = summarizeAssets([
    { status: 'pick', analysis: { flags: [] } },
    { status: 'maybe', analysis: { flags: ['可能偏暗'] } },
    { status: 'unknown' }
  ]);
  assert.deepEqual(summary, {
    total: 3,
    unreviewed: 1,
    pick: 1,
    maybe: 1,
    reject: 0,
    issues: 1
  });
});
