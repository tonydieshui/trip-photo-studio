const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  shell
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');

const {
  canDirectPreview,
  isMediaFile,
  isVideoFile,
  makeAssetId,
  mediaKind,
  normalizeStatus,
  sanitizeFileName
} = require('./core');
const { ANALYSIS_VERSION, analyzeBitmap } = require('./photo-analysis');

const APP_NAME = '旅图整理台';
const STATE_VERSION = 1;
const THUMB_SIZE = 720;
const SMOKE_TEST = process.env.TRIP_PHOTO_SMOKE_TEST === '1';
const SMOKE_SCREENSHOT = process.env.TRIP_PHOTO_SCREENSHOT_PATH || '';
const SMOKE_SOURCE = process.env.TRIP_PHOTO_SMOKE_SOURCE || '';
const SMOKE_REVIEW = process.env.TRIP_PHOTO_SMOKE_REVIEW === '1';
const SMOKE_REVIEW_FILE = process.env.TRIP_PHOTO_SMOKE_REVIEW_FILE || '';
const SMOKE_COLOR_FILTER = process.env.TRIP_PHOTO_SMOKE_COLOR_FILTER || '';
const SMOKE_WORKSPACE = process.env.TRIP_PHOTO_SMOKE_WORKSPACE || '';
const CUSTOM_USER_DATA = process.env.TRIP_PHOTO_USER_DATA || '';

if (CUSTOM_USER_DATA) {
  const customUserDataPath = path.resolve(CUSTOM_USER_DATA);
  fs.mkdirSync(customUserDataPath, { recursive: true });
  app.setPath('userData', customUserDataPath);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'travel-photo',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

app.setName(APP_NAME);

let mainWindow = null;
let stateFile = '';
let thumbnailDirectory = '';
let libraryState = createEmptyState();
let saveQueue = Promise.resolve();
let assetIndex = new Map();
const thumbnailTasks = new Map();
const analyzingProjects = new Set();

function createEmptyState() {
  return {
    version: STATE_VERSION,
    activeProjectId: null,
    projects: []
  };
}

function normalizeVideoData(value = {}) {
  const duration = Math.max(0, Number(value?.duration || 0));
  const maximum = duration || Number.MAX_SAFE_INTEGER;
  const normalizeClip = (clip, index) => {
    const start = Math.max(0, Math.min(maximum, Number(clip?.start ?? clip?.in ?? 0)));
    const end = Math.max(start, Math.min(maximum, Number(clip?.end ?? clip?.out ?? 0)));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.05) return null;
    return {
      id: String(clip?.id || `clip-${index}-${Math.round(start * 1000)}-${Math.round(end * 1000)}`),
      start,
      end
    };
  };
  let sourceClips = Array.isArray(value?.clips) ? value.clips : [];
  if (!sourceClips.length && duration) {
    const legacyStart = Math.max(0, Math.min(duration, Number(value?.trimStart || 0)));
    const rawLegacyEnd = value?.trimEnd == null ? duration : Number(value.trimEnd);
    const legacyEnd = Math.max(legacyStart, Math.min(duration, rawLegacyEnd));
    if (legacyStart > 0 || value?.trimEnd != null) sourceClips = [{ id: 'legacy-clip', start: legacyStart, end: legacyEnd }];
  }
  const clips = sourceClips
    .map(normalizeClip)
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const draftStartValue = value?.draftStart == null ? null : Number(value.draftStart);
  const draftStart = Number.isFinite(draftStartValue) && draftStartValue >= 0 && draftStartValue < maximum
    ? Math.min(maximum, draftStartValue)
    : null;
  return {
    duration,
    width: Math.max(0, Math.round(Number(value?.width || 0))),
    height: Math.max(0, Math.round(Number(value?.height || 0))),
    clips,
    draftStart
  };
}

function normalizeLoadedState(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.projects)) {
    return createEmptyState();
  }

  const projects = value.projects.map((project) => ({
    id: String(project.id || crypto.randomUUID()),
    name: String(project.name || '未命名项目'),
    sourcePath: String(project.sourcePath || ''),
    createdAt: Number(project.createdAt || Date.now()),
    updatedAt: Number(project.updatedAt || Date.now()),
    assets: Array.isArray(project.assets)
      ? project.assets.map((asset) => {
          const assetPath = String(asset.path || '');
          const kind = asset.kind === 'video' || isVideoFile(assetPath) ? 'video' : 'photo';
          return {
            id: String(asset.id || makeAssetId(assetPath || crypto.randomUUID())),
            path: assetPath,
            name: String(asset.name || path.basename(assetPath || '未知文件')),
            ext: String(asset.ext || path.extname(assetPath || '').toLowerCase()),
            kind,
            size: Number(asset.size || 0),
            modifiedAt: Number(asset.modifiedAt || 0),
            status: normalizeStatus(asset.status),
            rating: Math.max(0, Math.min(5, Number(asset.rating || 0))),
            video: kind === 'video' ? normalizeVideoData(asset.video) : null,
            analysis: kind === 'photo'
              ? (asset.analysis && typeof asset.analysis === 'object'
                  ? asset.analysis
                  : { state: 'pending', score: null, flags: [] })
              : { state: 'not-applicable', score: null, flags: [] }
          };
        })
      : []
  }));

  const activeProjectId = projects.some((project) => project.id === value.activeProjectId)
    ? value.activeProjectId
    : projects[0]?.id || null;

  return { version: STATE_VERSION, activeProjectId, projects };
}

async function loadState() {
  try {
    const raw = await fsp.readFile(stateFile, 'utf8');
    libraryState = normalizeLoadedState(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('读取本地素材库失败：', error);
    libraryState = createEmptyState();
  }
  rebuildAssetIndex();
}

function queueStateSave() {
  const payload = JSON.stringify(libraryState, null, 2);
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => fsp.writeFile(stateFile, payload, 'utf8'));
  return saveQueue;
}

function rebuildAssetIndex() {
  assetIndex = new Map();
  for (const project of libraryState.projects) {
    for (const asset of project.assets) {
      assetIndex.set(asset.id, asset);
    }
  }
}

function getProject(projectId) {
  return libraryState.projects.find((project) => project.id === projectId);
}

function notify(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function scanMediaFolder(sourcePath, existingAssets = []) {
  const existingByPath = new Map(
    existingAssets.map((asset) => [path.resolve(asset.path).toLowerCase(), asset])
  );
  const assets = [];
  const warnings = [];
  const pendingDirectories = [sourcePath];
  let visited = 0;

  while (pendingDirectories.length) {
    const currentDirectory = pendingDirectories.pop();
    let entries;
    try {
      entries = await fsp.readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      warnings.push(`无法读取：${currentDirectory}`);
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !isMediaFile(fullPath)) continue;

      try {
        const stats = await fsp.stat(fullPath);
        const existing = existingByPath.get(path.resolve(fullPath).toLowerCase());
        const kind = mediaKind(fullPath);
        const unchanged = existing && existing.size === stats.size && existing.modifiedAt === stats.mtimeMs;
        assets.push({
          id: existing?.id || makeAssetId(fullPath),
          path: fullPath,
          name: entry.name,
          ext: path.extname(entry.name).toLowerCase(),
          kind,
          size: stats.size,
          modifiedAt: stats.mtimeMs,
          status: normalizeStatus(existing?.status),
          rating: Math.max(0, Math.min(5, Number(existing?.rating || 0))),
          video: kind === 'video' && unchanged ? normalizeVideoData(existing.video) : (kind === 'video' ? normalizeVideoData() : null),
          analysis: kind === 'photo'
            ? (unchanged ? existing.analysis : { state: 'pending', score: null, flags: [] })
            : { state: 'not-applicable', score: null, flags: [] }
        });
        visited += 1;
        if (visited % 150 === 0) {
          notify('scan-progress', { scanned: visited, sourcePath });
        }
      } catch {
        warnings.push(`无法读取文件信息：${fullPath}`);
      }
    }
  }

  assets.sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name, 'zh-CN'));
  return { assets, warnings };
}

function thumbnailPathFor(asset) {
  return path.join(thumbnailDirectory, `${asset.id}.jpg`);
}

async function createThumbnail(asset) {
  if (asset.kind === 'video') return null;
  const cachePath = thumbnailPathFor(asset);
  try {
    const buffer = await fsp.readFile(cachePath);
    const image = nativeImage.createFromBuffer(buffer);
    if (!image.isEmpty()) return { buffer, image };
  } catch {
    // 缓存不存在时继续生成。
  }

  let image = await nativeImage.createThumbnailFromPath(asset.path, {
    width: THUMB_SIZE,
    height: THUMB_SIZE
  });

  if (image.isEmpty()) {
    image = nativeImage.createFromPath(asset.path);
    if (!image.isEmpty()) {
      const size = image.getSize();
      if (size.width > THUMB_SIZE || size.height > THUMB_SIZE) {
        image = image.resize({ width: THUMB_SIZE, height: THUMB_SIZE, quality: 'good' });
      }
    }
  }

  if (image.isEmpty()) return null;

  const buffer = image.toJPEG(84);
  await fsp.mkdir(thumbnailDirectory, { recursive: true });
  await fsp.writeFile(cachePath, buffer);
  return { buffer, image };
}

async function ensureThumbnail(asset) {
  if (thumbnailTasks.has(asset.id)) return thumbnailTasks.get(asset.id);
  const task = createThumbnail(asset).finally(() => thumbnailTasks.delete(asset.id));
  thumbnailTasks.set(asset.id, task);
  return task;
}

function analyzeImage(image) {
  if (!image || image.isEmpty()) {
    return {
      state: 'unsupported',
      version: ANALYSIS_VERSION,
      score: null,
      brightness: null,
      detail: null,
      flags: ['暂不支持预览']
    };
  }

  const originalSize = image.getSize();
  const width = Math.min(256, Math.max(1, originalSize.width));
  const sample = image.resize({ width, quality: 'good' });
  const size = sample.getSize();
  return analyzeBitmap(sample.toBitmap(), size.width, size.height, originalSize);
}

async function analyzeProject(projectId, force = false) {
  if (analyzingProjects.has(projectId)) return;
  const project = getProject(projectId);
  if (!project) return;

  const photos = project.assets.filter((asset) => asset.kind === 'photo');
  const pending = force
    ? photos
    : photos.filter((asset) => (
        !asset.analysis
        || asset.analysis.state === 'pending'
        || asset.analysis.version !== ANALYSIS_VERSION
      ));
  if (!pending.length) return;

  analyzingProjects.add(projectId);
  let completed = 0;
  let batch = [];

  notify('analysis-progress', {
    projectId,
    completed,
    total: pending.length,
    running: true,
    assets: []
  });

  try {
    for (const asset of pending) {
      try {
        const thumbnail = await ensureThumbnail(asset);
        asset.analysis = analyzeImage(thumbnail?.image);
      } catch {
        asset.analysis = {
          state: 'error',
          version: ANALYSIS_VERSION,
          score: null,
          brightness: null,
          detail: null,
          flags: ['分析失败']
        };
      }

      completed += 1;
      batch.push({ id: asset.id, analysis: asset.analysis });

      if (batch.length >= 12 || completed === pending.length) {
        project.updatedAt = Date.now();
        await queueStateSave();
        notify('analysis-progress', {
          projectId,
          completed,
          total: pending.length,
          running: completed < pending.length,
          assets: batch
        });
        batch = [];
      }
    }
  } finally {
    analyzingProjects.delete(projectId);
  }
}

function placeholderSvg(asset) {
  const extension = String(asset?.ext || 'FILE').replace('.', '').toUpperCase().slice(0, 6);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2a1c3b"/>
          <stop offset="1" stop-color="#110c19"/>
        </linearGradient>
      </defs>
      <rect width="720" height="720" fill="url(#g)"/>
      <path d="M210 170h220l80 80v300H210z" fill="none" stroke="#69737d" stroke-width="18"/>
      <path d="M430 170v90h80" fill="none" stroke="#69737d" stroke-width="18"/>
      <text x="360" y="405" text-anchor="middle" fill="#f0a4da" font-family="Segoe UI, sans-serif" font-size="72" font-weight="700">${extension}</text>
      <text x="360" y="475" text-anchor="middle" fill="#b5a8c1" font-family="Segoe UI, sans-serif" font-size="24">原文件可正常筛选与导出</text>
    </svg>
  `, 'utf8');
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mts': 'video/mp2t',
    '.m2ts': 'video/mp2t',
    '.mpg': 'video/mpeg',
    '.mpeg': 'video/mpeg',
    '.3gp': 'video/3gpp'
  }[extension] || 'application/octet-stream';
}

async function streamAssetFile(asset, request) {
  const stats = await fsp.stat(asset.path);
  const total = stats.size;
  const rangeHeader = request.headers.get('range');
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': mimeTypeFor(asset.path),
    'Cache-Control': 'private, max-age=3600'
  };

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) return new Response('Invalid range', { status: 416 });
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : total - 1;
    if (!match[1] && match[2]) {
      const suffixLength = Math.min(total, Number(match[2]));
      start = total - suffixLength;
      end = total - 1;
    }
    start = Math.max(0, Math.min(total - 1, start));
    end = Math.max(start, Math.min(total - 1, end));
    const stream = fs.createReadStream(asset.path, { start, end, highWaterMark: 1024 * 1024 });
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${total}`
      }
    });
  }

  const stream = fs.createReadStream(asset.path, { highWaterMark: 1024 * 1024 });
  return new Response(Readable.toWeb(stream), {
    headers: { ...commonHeaders, 'Content-Length': String(total) }
  });
}

async function handlePhotoProtocol(request) {
  try {
    const url = new URL(request.url);
    const assetId = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const asset = assetIndex.get(assetId);
    if (!asset) return new Response('Not found', { status: 404 });

    if (url.hostname === 'thumb') {
      if (asset.kind === 'video') {
        return new Response(placeholderSvg(asset), {
          headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }
        });
      }
      const thumbnail = await ensureThumbnail(asset);
      if (!thumbnail) {
        return new Response(placeholderSvg(asset), {
          headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }
        });
      }
      return new Response(thumbnail.buffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    }

    if (url.hostname === 'original') {
      if (asset.kind === 'video') {
        return streamAssetFile(asset, request);
      }
      if (!canDirectPreview(asset.path)) {
        const thumbnail = await ensureThumbnail(asset);
        if (thumbnail) {
          return new Response(thumbnail.buffer, {
            headers: { 'Content-Type': 'image/jpeg' }
          });
        }
        return new Response(placeholderSvg(asset), {
          headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }
        });
      }
      return streamAssetFile(asset, request);
    }
  } catch (error) {
    console.error('读取图片失败：', error);
  }
  return new Response('Not found', { status: 404 });
}

async function createUniqueDirectory(parent, baseName) {
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index + 1})`;
    const candidate = path.join(parent, `${baseName}${suffix}`);
    try {
      await fsp.mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('无法创建导出文件夹');
}

async function uniqueDestinationPath(directory, fileName) {
  const parsed = path.parse(fileName);
  for (let index = 0; index < 10000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index + 1})`;
    const candidate = path.join(directory, `${parsed.name}${suffix}${parsed.ext}`);
    try {
      await fsp.access(candidate, fs.constants.F_OK);
    } catch {
      return candidate;
    }
  }
  throw new Error(`无法为 ${fileName} 生成唯一文件名`);
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-state', () => libraryState);

  ipcMain.handle('dialog:choose-source', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择照片和视频素材文件夹',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const sourcePath = result.filePaths[0];
    return { path: sourcePath, suggestedName: path.basename(sourcePath) };
  });

  ipcMain.handle('project:create', async (_event, input) => {
    const sourcePath = path.resolve(String(input?.sourcePath || ''));
    const stats = await fsp.stat(sourcePath);
    if (!stats.isDirectory()) throw new Error('请选择有效的文件夹');

    const { assets, warnings } = await scanMediaFolder(sourcePath);
    if (!assets.length) throw new Error('这个文件夹及其子文件夹中没有找到支持的照片或视频');

    const now = Date.now();
    const project = {
      id: crypto.randomUUID(),
      name: sanitizeFileName(input?.name || path.basename(sourcePath)),
      sourcePath,
      createdAt: now,
      updatedAt: now,
      assets
    };

    libraryState.projects.unshift(project);
    libraryState.activeProjectId = project.id;
    rebuildAssetIndex();
    await queueStateSave();
    setImmediate(() => analyzeProject(project.id));
    return { state: libraryState, warnings };
  });

  ipcMain.handle('project:set-active', async (_event, projectId) => {
    if (getProject(projectId)) {
      libraryState.activeProjectId = projectId;
      await queueStateSave();
      setImmediate(() => analyzeProject(projectId));
    }
    return libraryState.activeProjectId;
  });

  ipcMain.handle('project:rescan', async (_event, projectId) => {
    const project = getProject(projectId);
    if (!project) throw new Error('项目不存在');
    const { assets, warnings } = await scanMediaFolder(project.sourcePath, project.assets);
    project.assets = assets;
    project.updatedAt = Date.now();
    rebuildAssetIndex();
    await queueStateSave();
    setImmediate(() => analyzeProject(project.id));
    return { project, warnings };
  });

  ipcMain.handle('project:remove', async (_event, projectId) => {
    libraryState.projects = libraryState.projects.filter((project) => project.id !== projectId);
    if (libraryState.activeProjectId === projectId) {
      libraryState.activeProjectId = libraryState.projects[0]?.id || null;
    }
    rebuildAssetIndex();
    await queueStateSave();
    return libraryState;
  });

  ipcMain.handle('project:reveal-source', (_event, projectId) => {
    const project = getProject(projectId);
    if (project) return shell.openPath(project.sourcePath);
    return '项目不存在';
  });

  ipcMain.handle('asset:reveal', (_event, assetId) => {
    const asset = assetIndex.get(assetId);
    if (asset) shell.showItemInFolder(asset.path);
  });

  ipcMain.handle('asset:update', async (_event, input) => {
    const project = getProject(input?.projectId);
    const asset = project?.assets.find((item) => item.id === input?.assetId);
    if (!asset) throw new Error('素材不存在');

    if (input.patch && Object.hasOwn(input.patch, 'status')) {
      asset.status = normalizeStatus(input.patch.status);
    }
    if (input.patch && Object.hasOwn(input.patch, 'rating')) {
      asset.rating = Math.max(0, Math.min(5, Number(input.patch.rating || 0)));
    }
    if (asset.kind === 'video' && input.patch && Object.hasOwn(input.patch, 'video')) {
      asset.video = normalizeVideoData({ ...asset.video, ...input.patch.video });
    }
    project.updatedAt = Date.now();
    await queueStateSave();
    return asset;
  });

  ipcMain.handle('analysis:restart', async (_event, projectId) => {
    const project = getProject(projectId);
    if (!project) throw new Error('项目不存在');
    for (const asset of project.assets) {
      if (asset.kind === 'photo') {
        asset.analysis = { state: 'pending', score: null, flags: [] };
      }
    }
    await queueStateSave();
    setImmediate(() => analyzeProject(projectId, true));
    return true;
  });

  ipcMain.handle('project:export-picks', async (_event, input) => {
    const projectId = typeof input === 'string' ? input : input?.projectId;
    const kind = typeof input === 'object' && input?.kind === 'video' ? 'video' : 'photo';
    const project = getProject(projectId);
    if (!project) throw new Error('项目不存在');
    const picks = project.assets.filter((asset) => asset.kind === kind && asset.status === 'pick');
    const kindLabel = kind === 'video' ? '视频' : '照片';
    if (!picks.length) throw new Error(`还没有标记为“保留”的${kindLabel}`);

    const result = await dialog.showOpenDialog(mainWindow, {
      title: `选择精选${kindLabel}的导出位置`,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const exportRoot = path.resolve(result.filePaths[0]);
    const relativeToSource = path.relative(path.resolve(project.sourcePath), exportRoot);
    const isInsideSource = relativeToSource === ''
      || (!relativeToSource.startsWith('..') && !path.isAbsolute(relativeToSource));
    if (isInsideSource) {
      throw new Error(`请选择原素材文件夹以外的位置，避免精选${kindLabel}在重新扫描时被重复导入`);
    }

    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const exportName = `${sanitizeFileName(project.name)}-精选${kindLabel}-${stamp}`;
    const outputDirectory = await createUniqueDirectory(exportRoot, exportName);
    let copied = 0;

    for (const asset of picks) {
      const destination = await uniqueDestinationPath(outputDirectory, asset.name);
      await fsp.copyFile(asset.path, destination, fs.constants.COPYFILE_EXCL);
      copied += 1;
      notify('export-progress', { projectId, copied, total: picks.length });
    }

    const note = [
      `项目：${project.name}`,
      `原素材目录：${project.sourcePath}`,
      `导出时间：${new Date().toLocaleString('zh-CN')}`,
      `精选${kindLabel}：${copied} ${kind === 'video' ? '段' : '张'}`,
      '',
      kind === 'video'
        ? '当前版本会安全复制完整视频原文件；设置的入点和出点记录在“视频片段清单.json”中，原视频不会被裁切或修改。'
        : '本文件夹由“旅图整理台”生成。原始照片未被移动或修改。'
    ].join('\r\n');
    await fsp.writeFile(path.join(outputDirectory, '导出说明.txt'), note, 'utf8');
    if (kind === 'video') {
      const clipManifest = picks.map((asset) => ({
        file: asset.name,
        sourcePath: asset.path,
        duration: Number(asset.video?.duration || 0),
        clips: (asset.video?.clips || []).map((clip) => ({
          id: String(clip.id),
          in: Number(clip.start || 0),
          out: Number(clip.end || 0)
        }))
      }));
      await fsp.writeFile(
        path.join(outputDirectory, '视频片段清单.json'),
        JSON.stringify(clipManifest, null, 2),
        'utf8'
      );
    }

    return { canceled: false, copied, outputDirectory };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#f7f2fb',
    title: APP_NAME,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const smokeQuery = {};
  if (SMOKE_REVIEW) {
    smokeQuery.smokeReview = '1';
    smokeQuery.smokeReviewFile = SMOKE_REVIEW_FILE;
  }
  if (SMOKE_COLOR_FILTER) smokeQuery.smokeColorFilter = SMOKE_COLOR_FILTER;
  if (SMOKE_WORKSPACE) smokeQuery.smokeWorkspace = SMOKE_WORKSPACE;
  mainWindow.loadFile(
    path.join(__dirname, 'index.html'),
    Object.keys(smokeQuery).length ? { query: smokeQuery } : undefined
  );
  mainWindow.once('ready-to-show', () => {
    if (!SMOKE_TEST) mainWindow.show();
  });
  if (SMOKE_TEST) {
    mainWindow.webContents.once('did-finish-load', async () => {
      if (SMOKE_SCREENSHOT) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const screenshot = await mainWindow.webContents.capturePage();
        await fsp.mkdir(path.dirname(path.resolve(SMOKE_SCREENSHOT)), { recursive: true });
        await fsp.writeFile(path.resolve(SMOKE_SCREENSHOT), screenshot.toPNG());
        console.log(`TRIP_PHOTO_STUDIO_SCREENSHOT=${path.resolve(SMOKE_SCREENSHOT)}`);
      }
      console.log('TRIP_PHOTO_STUDIO_SMOKE_OK');
      setTimeout(() => app.quit(), 350);
    });
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  stateFile = path.join(app.getPath('userData'), 'library-state.json');
  thumbnailDirectory = path.join(app.getPath('userData'), 'thumbnails');
  await fsp.mkdir(path.dirname(stateFile), { recursive: true });
  await fsp.mkdir(thumbnailDirectory, { recursive: true });
  await loadState();

  let smokeProjectId = null;
  if (SMOKE_TEST && SMOKE_SOURCE) {
    const sourcePath = path.resolve(SMOKE_SOURCE);
    const { assets } = await scanMediaFolder(sourcePath);
    const now = Date.now();
    smokeProjectId = crypto.randomUUID();
    libraryState = {
      version: STATE_VERSION,
      activeProjectId: smokeProjectId,
      projects: [{
        id: smokeProjectId,
        name: '界面验证项目',
        sourcePath,
        createdAt: now,
        updatedAt: now,
        assets
      }]
    };
    rebuildAssetIndex();
    await queueStateSave();
  }

  protocol.handle('travel-photo', handlePhotoProtocol);
  registerIpcHandlers();
  createWindow();
  const initialProjectId = smokeProjectId || libraryState.activeProjectId;
  if (initialProjectId) setImmediate(() => analyzeProject(initialProjectId));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  queueStateSave();
});
