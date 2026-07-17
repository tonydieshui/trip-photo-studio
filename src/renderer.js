const api = window.photoStudio;

const STATUS = {
  unreviewed: { label: '未筛选', symbol: '·' },
  pick: { label: '保留', symbol: '✓' },
  maybe: { label: '待定', symbol: '?' },
  reject: { label: '淘汰', symbol: '×' }
};
const ANALYSIS_VERSION = 3;

const COLOR_FILTER_LABELS = {
  all: '全部颜色',
  'family-red': '红色主调',
  'family-orange': '橙色主调',
  'family-yellow': '黄色主调',
  'family-green': '绿色主调',
  'family-cyan': '青色主调',
  'family-blue': '蓝色主调',
  'family-purple': '紫色主调',
  'family-pink': '粉色主调',
  'family-neutral': '中性色调',
  'harmony-complementary': '互补色',
  'harmony-analogous': '邻近色',
  'harmony-monochrome': '单色系',
  'harmony-multicolor': '多彩画面',
  'preset-morandi': '莫兰迪色系',
  'preset-pastel': '柔和粉彩',
  'preset-earthy': '大地色系',
  'preset-vivid': '高饱和色彩',
  'preset-black-white': '黑白灰',
  'preset-teal-orange': '青橙电影感',
  'preset-sunset': '日落色系',
  'preset-forest': '森系色彩',
  'preset-cool-clean': '清冷色调',
  'preset-golden': '金色暖调'
};

const els = {
  welcomeView: document.querySelector('#welcome-view'),
  projectView: document.querySelector('#project-view'),
  projectList: document.querySelector('#project-list'),
  projectCount: document.querySelector('#project-count'),
  projectTitle: document.querySelector('#project-title'),
  projectPath: document.querySelector('#project-path'),
  analysisStatus: document.querySelector('#analysis-status'),
  workspaceSwitch: document.querySelector('#media-workspace-switch'),
  photoWorkspaceCount: document.querySelector('#photo-workspace-count'),
  videoWorkspaceCount: document.querySelector('#video-workspace-count'),
  summaryTotalLabel: document.querySelector('#summary-total-label'),
  summaryIssuesLabel: document.querySelector('#summary-issues-label'),
  shortcutHint: document.querySelector('#shortcut-hint'),
  insightsContent: document.querySelector('#insights-content'),
  videoOverview: document.querySelector('#video-overview'),
  videoOverviewContent: document.querySelector('#video-overview-content'),
  restartAnalysisButton: document.querySelector('#restart-analysis-button'),
  gallery: document.querySelector('#gallery'),
  resultCount: document.querySelector('#result-count'),
  loadSentinel: document.querySelector('#load-sentinel'),
  searchInput: document.querySelector('#search-input'),
  sortSelect: document.querySelector('#sort-select'),
  featureFilter: document.querySelector('#feature-filter'),
  videoFeatureFilter: document.querySelector('#video-feature-filter'),
  colorFilterOptions: document.querySelector('#color-filter-options'),
  colorFilterLabel: document.querySelector('#color-filter-label'),
  colorLab: document.querySelector('#color-lab'),
  gridSize: document.querySelector('#grid-size'),
  importModal: document.querySelector('#import-modal'),
  chooseFolderButton: document.querySelector('#choose-folder-button'),
  folderPickerTitle: document.querySelector('#folder-picker-title'),
  folderPickerPath: document.querySelector('#folder-picker-path'),
  projectNameInput: document.querySelector('#project-name-input'),
  createProjectButton: document.querySelector('#create-project-button'),
  exportButton: document.querySelector('#export-button'),
  rescanButton: document.querySelector('#rescan-button'),
  reviewOverlay: document.querySelector('#review-overlay'),
  reviewImageWrap: document.querySelector('#review-image-wrap'),
  reviewImage: document.querySelector('#review-image'),
  reviewVideo: document.querySelector('#review-video'),
  reviewCounter: document.querySelector('#review-counter'),
  reviewFileName: document.querySelector('#review-file-name'),
  reviewFileMeta: document.querySelector('#review-file-meta'),
  ratingRow: document.querySelector('#rating-row'),
  qualityScore: document.querySelector('#quality-score'),
  qualityFlags: document.querySelector('#quality-flags'),
  photoSummary: document.querySelector('#photo-summary'),
  styleTags: document.querySelector('#style-tags'),
  paletteStrip: document.querySelector('#palette-strip'),
  colorStory: document.querySelector('#color-story'),
  analysisMetrics: document.querySelector('#analysis-metrics'),
  fileDetails: document.querySelector('#file-details'),
  videoDurationLabel: document.querySelector('#video-duration-label'),
  videoClipCopy: document.querySelector('#video-clip-copy'),
  videoPlayhead: document.querySelector('#video-playhead'),
  videoClipTimeline: document.querySelector('#video-clip-timeline'),
  videoTimelineEnd: document.querySelector('#video-timeline-end'),
  videoClipList: document.querySelector('#video-clip-list'),
  setVideoIn: document.querySelector('#set-video-in'),
  setVideoOut: document.querySelector('#set-video-out'),
  deleteVideoClip: document.querySelector('#delete-video-clip'),
  previousPhoto: document.querySelector('#previous-photo'),
  nextPhoto: document.querySelector('#next-photo'),
  zoomOut: document.querySelector('#zoom-out'),
  zoomIn: document.querySelector('#zoom-in'),
  zoomFit: document.querySelector('#zoom-fit'),
  zoomSlider: document.querySelector('#zoom-slider'),
  zoomLevel: document.querySelector('#zoom-level'),
  toast: document.querySelector('#toast')
};

let libraryState = { version: 1, activeProjectId: null, projects: [] };
let activeFilter = 'all';
let searchQuery = '';
let sortMode = 'newest';
let activeFeatureFilter = 'all';
let activeColorFilter = 'all';
let activeVideoFeatureFilter = 'all';
let activeWorkspace = 'photo';
let visibleLimit = 160;
let filteredAssets = [];
let reviewAssetId = null;
let loadedReviewAssetId = null;
let selectedVideoClipId = null;
let selectedSource = null;
let nameWasEdited = false;
let loadObserver = null;
let toastTimer = null;
let reviewZoom = 1;
let reviewPanX = 0;
let reviewPanY = 0;
let reviewBaseWidth = 1;
let reviewBaseHeight = 1;
let panning = false;
let panOrigin = null;
const analysisProgress = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function activeProject() {
  return libraryState.projects.find((project) => project.id === libraryState.activeProjectId) || null;
}

function assetKind(asset) {
  return asset?.kind === 'video' ? 'video' : 'photo';
}

function assetsForWorkspace(project, workspace = activeWorkspace) {
  return (project?.assets || []).filter((asset) => assetKind(asset) === workspace);
}

function isVideoWorkspace() {
  return activeWorkspace === 'video';
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const hours = Math.floor(minutes / 60);
  const minutePart = String(minutes % 60).padStart(2, '0');
  const secondPart = String(remainder).padStart(2, '0');
  return hours ? `${String(hours).padStart(2, '0')}:${minutePart}:${secondPart}` : `${minutePart}:${secondPart}`;
}

function videoOrientation(asset) {
  const video = asset?.video || {};
  if (!video.width || !video.height) return 'unknown';
  return video.width < video.height ? 'portrait' : 'landscape';
}

function videoClips(asset) {
  return (asset?.video?.clips || [])
    .filter((clip) => Number.isFinite(Number(clip?.start)) && Number.isFinite(Number(clip?.end)) && Number(clip.end) > Number(clip.start))
    .sort((left, right) => Number(left.start) - Number(right.start) || Number(left.end) - Number(right.end));
}

function hasVideoClips(asset) {
  return videoClips(asset).length > 0;
}

function totalClipDuration(asset) {
  return videoClips(asset).reduce((total, clip) => total + Number(clip.end) - Number(clip.start), 0);
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, Number(bytes || 0));
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#756a82';
}

function matchesFeature(asset, filter) {
  const analysis = asset.analysis;
  if (filter === 'all') return true;
  if (!analysis || analysis.state !== 'done' || analysis.version !== ANALYSIS_VERSION) return false;
  if (filter === 'portrait' || filter === 'landscape') return analysis.orientation === filter;
  if (filter === 'warm' || filter === 'cool') return analysis.colorTone === filter;
  if (filter === 'low-saturation') return Number(analysis.saturation) < 16;
  if (filter === 'vivid') return Number(analysis.saturation) > 48;
  if (filter === 'dark') return Number(analysis.brightness) < 70;
  if (filter === 'bright') return Number(analysis.brightness) > 176;
  if (filter === 'minimal') return analysis.styleTags?.includes('极简画面');
  if (filter === 'high-score') return Number(analysis.technicalScore ?? analysis.score) >= 85;
  return true;
}

function matchesColor(asset, filter) {
  if (filter === 'all') return true;
  const analysis = asset.analysis;
  if (!analysis || analysis.state !== 'done' || analysis.version !== ANALYSIS_VERSION) return false;
  const profile = analysis.colorProfile;
  if (!profile) return false;
  if (filter.startsWith('family-')) return profile.families?.includes(filter.slice(7));
  if (filter.startsWith('harmony-')) return profile.harmonies?.includes(filter.slice(8));
  if (filter.startsWith('preset-')) return profile.presets?.includes(filter.slice(7));
  return true;
}

function matchesVideoFeature(asset, filter) {
  if (filter === 'all') return true;
  const video = asset.video || {};
  const duration = Number(video.duration || 0);
  if (filter === 'portrait' || filter === 'landscape') return videoOrientation(asset) === filter;
  if (filter === 'short') return duration > 0 && duration <= 15;
  if (filter === 'medium') return duration > 15 && duration <= 60;
  if (filter === 'long') return duration > 60;
  if (filter === 'trimmed') return hasVideoClips(asset);
  return true;
}

function projectSummary(project, workspace = null) {
  const assets = workspace ? assetsForWorkspace(project, workspace) : (project?.assets || []);
  const summary = {
    total: assets.length,
    unreviewed: 0,
    pick: 0,
    maybe: 0,
    reject: 0,
    issues: 0
  };
  for (const asset of assets) {
    summary[STATUS[asset.status] ? asset.status : 'unreviewed'] += 1;
    if (workspace === 'video') {
      if (hasVideoClips(asset)) summary.issues += 1;
    } else if (asset.analysis?.flags?.length) {
      summary.issues += 1;
    }
  }
  return summary;
}

function showToast(message, type = 'normal', duration = 3600) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast${type === 'error' ? ' error' : ''}`;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, duration);
}

function renderProjects() {
  els.projectCount.textContent = String(libraryState.projects.length);
  if (!libraryState.projects.length) {
    els.projectList.innerHTML = '<div class="project-list-empty">导入一个本地旅行素材文件夹后，旅行项目会出现在这里。</div>';
    return;
  }

  els.projectList.innerHTML = libraryState.projects.map((project) => {
    const summary = projectSummary(project);
    const photoCount = assetsForWorkspace(project, 'photo').length;
    const videoCount = assetsForWorkspace(project, 'video').length;
    return `
      <button class="project-list-button ${project.id === libraryState.activeProjectId ? 'active' : ''}" data-project-id="${project.id}" type="button">
        <span class="project-thumb">◇</span>
        <span class="project-list-copy">
          <strong>${escapeHtml(project.name)}</strong>
          <small>${photoCount} 张照片 · ${videoCount} 段视频 · ${summary.pick} 项保留</small>
        </span>
        <span class="project-list-count">${summary.total}</span>
      </button>
    `;
  }).join('');
}

function updateFilterButtons() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === activeFilter);
  });
  document.querySelectorAll('[data-summary-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.summaryFilter === activeFilter);
  });
}

function renderColorFilters(project) {
  const photos = assetsForWorkspace(project, 'photo');
  const buttons = els.colorFilterOptions.querySelectorAll('[data-color-filter]');
  buttons.forEach((button) => {
    const filter = button.dataset.colorFilter;
    const count = filter === 'all'
      ? photos.length
      : photos.filter((asset) => matchesColor(asset, filter)).length;
    button.classList.toggle('active', filter === activeColorFilter);
    const counter = button.querySelector('small');
    if (counter) counter.textContent = String(count);
    button.title = `${COLOR_FILTER_LABELS[filter] || filter} · ${count} 张`;
  });
  els.colorFilterLabel.textContent = COLOR_FILTER_LABELS[activeColorFilter] || '颜色筛选';
  els.colorLab.classList.toggle('filtering', activeColorFilter !== 'all');
}

function calculateFilteredAssets(project) {
  const query = searchQuery.trim().toLocaleLowerCase('zh-CN');
  const list = assetsForWorkspace(project).filter((asset) => {
    const statusMatch = activeFilter === 'all'
      || (activeFilter === 'issues' && (isVideoWorkspace()
        ? hasVideoClips(asset)
        : asset.analysis?.flags?.length))
      || asset.status === activeFilter;
    if (!statusMatch) return false;
    if (isVideoWorkspace()) {
      if (!matchesVideoFeature(asset, activeVideoFeatureFilter)) return false;
    } else {
      if (!matchesFeature(asset, activeFeatureFilter)) return false;
      if (!matchesColor(asset, activeColorFilter)) return false;
    }
    if (!query) return true;
    const understandingText = [
      asset.analysis?.summary,
      ...(asset.analysis?.styleTags || []),
      ...(isVideoWorkspace() ? ['视频', formatDuration(asset.video?.duration)] : [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    return asset.name.toLocaleLowerCase('zh-CN').includes(query)
      || asset.path.toLocaleLowerCase('zh-CN').includes(query)
      || understandingText.includes(query);
  });

  return list.sort((a, b) => {
    if (sortMode === 'oldest') return a.modifiedAt - b.modifiedAt || a.name.localeCompare(b.name, 'zh-CN');
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh-CN');
    if (sortMode === 'rating') return b.rating - a.rating || b.modifiedAt - a.modifiedAt;
    if (sortMode === 'score') return (b.analysis?.score ?? -1) - (a.analysis?.score ?? -1) || b.modifiedAt - a.modifiedAt;
    return b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name, 'zh-CN');
  });
}

function renderAnalysisStatus(project) {
  if (isVideoWorkspace()) {
    const videos = assetsForWorkspace(project, 'video');
    const marked = videos.reduce((total, asset) => total + videoClips(asset).length, 0);
    els.analysisStatus.textContent = marked ? `已标记 ${marked} 段片段` : `${videos.length} 段视频素材`;
    els.analysisStatus.classList.remove('running');
    return;
  }
  const progress = analysisProgress.get(project.id);
  const photos = assetsForWorkspace(project, 'photo');
  const pending = photos.filter((asset) => (
    asset.analysis?.state === 'pending' || asset.analysis?.version !== ANALYSIS_VERSION
  )).length;
  if (progress?.running) {
    els.analysisStatus.textContent = `深入理解 ${progress.completed} / ${progress.total}`;
    els.analysisStatus.classList.add('running');
  } else if (pending > 0) {
    els.analysisStatus.textContent = `等待理解 ${pending} 张`;
    els.analysisStatus.classList.add('running');
  } else {
    els.analysisStatus.textContent = '视觉理解完成';
    els.analysisStatus.classList.remove('running');
  }
}

function projectInsights(project) {
  const photos = assetsForWorkspace(project, 'photo');
  const analyses = photos
    .map((asset) => asset.analysis)
    .filter((analysis) => analysis?.state === 'done' && analysis.version === ANALYSIS_VERSION);
  const total = photos.length;
  const averageScore = analyses.length
    ? Math.round(analyses.reduce((sum, analysis) => sum + Number(analysis.technicalScore || 0), 0) / analyses.length)
    : null;
  const portraitCount = analyses.filter((analysis) => analysis.orientation === 'portrait').length;
  const toneCounts = { warm: 0, cool: 0, neutral: 0 };
  const tagCounts = new Map();
  const colorCounts = new Map();

  for (const analysis of analyses) {
    toneCounts[analysis.colorTone] = (toneCounts[analysis.colorTone] || 0) + 1;
    for (const tag of analysis.styleTags || []) {
      if (['横幅构图', '竖幅构图', '方形构图'].includes(tag)) continue;
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    for (const color of analysis.palette?.slice(0, 2) || []) {
      const current = colorCounts.get(color.name) || { name: color.name, hex: color.hex, weight: 0 };
      current.weight += Number(color.weight || 0);
      colorCounts.set(color.name, current);
    }
  }

  const leadingTone = Object.entries(toneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
  const toneLabel = { warm: '暖色倾向', cool: '冷色倾向', neutral: '中性色倾向' }[leadingTone];
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => tag);
  const colors = [...colorCounts.values()].sort((a, b) => b.weight - a.weight).slice(0, 5);

  return {
    analyzed: analyses.length,
    total,
    averageScore,
    portraitRatio: analyses.length ? Math.round((portraitCount / analyses.length) * 100) : 0,
    toneLabel,
    topTags,
    colors
  };
}

function videoInsights(project) {
  const videos = assetsForWorkspace(project, 'video');
  const totalDuration = videos.reduce((sum, asset) => sum + Number(asset.video?.duration || 0), 0);
  const portraitCount = videos.filter((asset) => videoOrientation(asset) === 'portrait').length;
  const markedCount = videos.reduce((total, asset) => total + videoClips(asset).length, 0);
  const metadataCount = videos.filter((asset) => Number(asset.video?.duration || 0) > 0).length;
  return { total: videos.length, totalDuration, portraitCount, markedCount, metadataCount };
}

function renderInsights(project) {
  const insights = projectInsights(project);
  const tags = insights.topTags.length ? insights.topTags.join(' · ') : '等待生成风格标签';
  const palette = insights.colors.length
    ? insights.colors.map((color) => `<span style="background:${safeColor(color.hex)}" title="${escapeHtml(color.name)}"></span>`).join('')
    : '<span class="palette-placeholder"></span>';
  els.insightsContent.innerHTML = `
    <article class="insight-stat">
      <span>已理解</span><strong>${insights.analyzed}<small> / ${insights.total}</small></strong>
      <em>本地分析进度</em>
    </article>
    <article class="insight-stat">
      <span>平均技术分</span><strong>${insights.averageScore ?? '—'}</strong>
      <em>仅评价技术状态</em>
    </article>
    <article class="insight-stat">
      <span>画幅与色调</span><strong>${insights.portraitRatio}% <small>竖幅</small></strong>
      <em>${insights.toneLabel}</em>
    </article>
    <article class="insight-stat wide">
      <span>常见视觉特征</span><strong class="insight-tags">${escapeHtml(tags)}</strong>
      <em>按整组照片汇总</em>
    </article>
    <article class="insight-palette">
      <span>项目色板</span><div>${palette}</div>
    </article>
  `;
}

function renderVideoOverview(project) {
  const insights = videoInsights(project);
  els.videoOverviewContent.innerHTML = `
    <article class="video-overview-stat">
      <span>视频素材</span><strong>${insights.total}</strong>
      <em>${insights.metadataCount} 段已读取时长</em>
    </article>
    <article class="video-overview-stat">
      <span>累计时长</span><strong>${formatDuration(insights.totalDuration)}</strong>
      <em>按已读取的素材汇总</em>
    </article>
    <article class="video-overview-stat">
      <span>竖屏素材</span><strong>${insights.portraitCount}</strong>
      <em>适合短视频与朋友圈</em>
    </article>
    <article class="video-overview-stat accent">
      <span>已标记片段</span><strong>${insights.markedCount}</strong>
      <em>已设置入点或出点</em>
    </article>
  `;
}

function renderSummary(project) {
  const summary = projectSummary(project, activeWorkspace);
  const kindLabel = isVideoWorkspace() ? '视频' : '照片';
  for (const key of ['total', 'unreviewed', 'pick', 'maybe', 'issues']) {
    document.querySelector(`#count-${key}`).textContent = String(summary[key]);
  }
  els.summaryTotalLabel.textContent = `全部${kindLabel}`;
  els.summaryIssuesLabel.textContent = isVideoWorkspace() ? '已标记片段' : '质量提示';
  els.exportButton.textContent = summary.pick ? `导出保留${kindLabel} · ${summary.pick}` : `导出保留${kindLabel}`;
}

function renderGallery(project) {
  filteredAssets = calculateFilteredAssets(project);
  const shown = filteredAssets.slice(0, visibleLimit);
  const total = assetsForWorkspace(project).length;
  const unit = isVideoWorkspace() ? '段视频' : '张照片';
  els.resultCount.textContent = filteredAssets.length === total
    ? `共 ${filteredAssets.length} ${unit}`
    : `显示 ${filteredAssets.length} / ${total} ${unit}`;

  if (!shown.length) {
    els.gallery.innerHTML = `<div class="gallery-empty">这个筛选条件下没有${isVideoWorkspace() ? '视频' : '照片'}</div>`;
    observeLoadSentinel(false);
    return;
  }

  els.gallery.innerHTML = shown.map((asset) => {
    if (assetKind(asset) === 'video') return videoCardMarkup(asset);
    const status = STATUS[asset.status] || STATUS.unreviewed;
    const flags = asset.analysis?.flags || [];
    const score = asset.analysis?.score;
    const rating = asset.rating > 0 ? '★'.repeat(asset.rating) : '';
    const palette = asset.analysis?.palette?.slice(0, 5) || [];
    const styleTag = asset.analysis?.colorProfile?.labels?.[0]
      || asset.analysis?.styleTags?.find((tag) => !tag.includes('构图'));
    return `
      <article class="photo-card status-${asset.status}" data-asset-id="${asset.id}">
        <button class="photo-open-button" data-open-asset="${asset.id}" type="button" aria-label="查看 ${escapeHtml(asset.name)}">
          <div class="photo-media">
            <img src="travel-photo://thumb/${asset.id}" loading="lazy" alt="${escapeHtml(asset.name)}" />
            <div class="card-top-badges">
              <span class="format-badge">${escapeHtml(asset.ext.replace('.', '').toUpperCase())}</span>
              ${score == null ? '' : `<span class="score-badge">质量 ${score}</span>`}
            </div>
            ${flags.length ? `<span class="issue-badge">${escapeHtml(flags[0])}</span>` : ''}
            ${styleTag ? `<span class="style-badge">${escapeHtml(styleTag)}</span>` : ''}
            ${palette.length ? `<div class="card-palette">${palette.map((color) => `<i style="background:${safeColor(color.hex)}"></i>`).join('')}</div>` : ''}
          </div>
          <div class="photo-copy">
            <span>
              <strong>${escapeHtml(asset.name)}</strong>
              <small>${formatDate(asset.modifiedAt)} · ${formatBytes(asset.size)}</small>
            </span>
            <span>
              <span class="status-badge">${status.symbol} ${status.label}</span>
              <small class="rating-mini">${rating}</small>
            </span>
          </div>
        </button>
        <div class="quick-actions" aria-label="快速筛选">
          <button data-quick-status="pick" data-asset-id="${asset.id}" type="button" title="保留">✓</button>
          <button data-quick-status="maybe" data-asset-id="${asset.id}" type="button" title="待定">?</button>
          <button data-quick-status="reject" data-asset-id="${asset.id}" type="button" title="淘汰">×</button>
        </div>
      </article>
    `;
  }).join('');

  if (isVideoWorkspace()) wireVideoPreviews();
  observeLoadSentinel(shown.length < filteredAssets.length);
}

function videoCardMarkup(asset) {
  const status = STATUS[asset.status] || STATUS.unreviewed;
  const rating = asset.rating > 0 ? '★'.repeat(asset.rating) : '';
  const duration = Number(asset.video?.duration || 0);
  const orientation = videoOrientation(asset);
  const isTrimmed = hasVideoClips(asset);
  return `
    <article class="photo-card video-card ${orientation === 'portrait' ? 'video-portrait' : ''} status-${asset.status}" data-asset-id="${asset.id}">
      <button class="photo-open-button" data-open-asset="${asset.id}" type="button" aria-label="查看视频 ${escapeHtml(asset.name)}">
        <div class="photo-media video-media">
          <video class="video-card-preview" data-video-preview="${asset.id}" data-preview-src="travel-photo://original/${asset.id}" muted loop playsinline preload="none"></video>
          <div class="video-poster-fallback"><span>▶</span></div>
          <div class="card-top-badges">
            <span class="format-badge">${escapeHtml(asset.ext.replace('.', '').toUpperCase())}</span>
            <span class="video-duration-badge">${duration ? formatDuration(duration) : '读取时长…'}</span>
          </div>
          <span class="video-play-badge">▶ 悬停预览</span>
          ${orientation !== 'unknown' ? `<span class="video-orientation-badge">${orientation === 'portrait' ? '竖屏' : '横屏'}</span>` : ''}
          ${isTrimmed ? '<span class="video-trim-badge">已标记片段</span>' : ''}
        </div>
        <div class="photo-copy">
          <span>
            <strong>${escapeHtml(asset.name)}</strong>
            <small>${formatDate(asset.modifiedAt)} · ${formatBytes(asset.size)}${duration ? ` · ${formatDuration(duration)}` : ''}</small>
          </span>
          <span>
            <span class="status-badge">${status.symbol} ${status.label}</span>
            <small class="rating-mini">${rating}</small>
          </span>
        </div>
      </button>
      <div class="quick-actions" aria-label="快速筛选">
        <button data-quick-status="pick" data-asset-id="${asset.id}" type="button" title="保留">✓</button>
        <button data-quick-status="maybe" data-asset-id="${asset.id}" type="button" title="待定">?</button>
        <button data-quick-status="reject" data-asset-id="${asset.id}" type="button" title="淘汰">×</button>
      </div>
    </article>
  `;
}

async function persistVideoMetadata(assetId, videoElement) {
  const project = activeProject();
  const asset = project?.assets.find((item) => item.id === assetId);
  if (!project || !asset || assetKind(asset) !== 'video') return;
  const next = {
    ...asset.video,
    duration: Number.isFinite(videoElement.duration) ? videoElement.duration : 0,
    width: Number(videoElement.videoWidth || 0),
    height: Number(videoElement.videoHeight || 0)
  };
  const changed = Math.abs(Number(asset.video?.duration || 0) - next.duration) > 0.1
    || Number(asset.video?.width || 0) !== next.width
    || Number(asset.video?.height || 0) !== next.height;
  if (!changed) return;
  asset.video = next;
  if (isVideoWorkspace()) renderVideoOverview(project);
  try {
    await api.updateAsset({ projectId: project.id, assetId, patch: { video: next } });
  } catch {
    showToast('无法保存这段视频的本地信息', 'error');
  }
}

function wireVideoPreviews() {
  els.gallery.querySelectorAll('[data-video-preview]').forEach((video) => {
    const assetId = video.dataset.videoPreview;
    const card = video.closest('.video-card');
    video.addEventListener('loadedmetadata', () => persistVideoMetadata(assetId, video), { once: true });
    video.addEventListener('error', () => card?.classList.add('video-preview-error'), { once: true });
    card?.addEventListener('mouseenter', () => {
      if (!video.getAttribute('src')) {
        video.src = video.dataset.previewSrc;
        video.load();
      }
      video.play().catch(() => undefined);
    });
    card?.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });
  });
}

function renderActiveProject() {
  const project = activeProject();
  if (!project) {
    els.welcomeView.hidden = false;
    els.projectView.hidden = true;
    return;
  }

  els.welcomeView.hidden = true;
  els.projectView.hidden = false;
  if (!assetsForWorkspace(project, activeWorkspace).length) {
    activeWorkspace = assetsForWorkspace(project, activeWorkspace === 'photo' ? 'video' : 'photo').length
      ? (activeWorkspace === 'photo' ? 'video' : 'photo')
      : 'photo';
  }
  els.projectView.classList.toggle('video-mode', isVideoWorkspace());
  els.projectTitle.textContent = project.name;
  els.projectPath.textContent = project.sourcePath;
  els.projectPath.parentElement.title = project.sourcePath;
  renderMediaWorkspace(project);
  renderAnalysisStatus(project);
  renderSummary(project);
  renderInsights(project);
  renderVideoOverview(project);
  updateFilterButtons();
  renderColorFilters(project);
  renderGallery(project);
}

function renderMediaWorkspace(project) {
  const photos = assetsForWorkspace(project, 'photo').length;
  const videos = assetsForWorkspace(project, 'video').length;
  els.photoWorkspaceCount.textContent = String(photos);
  els.videoWorkspaceCount.textContent = String(videos);
  els.workspaceSwitch.querySelectorAll('[data-workspace]').forEach((button) => {
    const workspace = button.dataset.workspace;
    button.classList.toggle('active', workspace === activeWorkspace);
    button.disabled = workspace === 'photo' ? photos === 0 : videos === 0;
  });
  els.shortcutHint.textContent = isVideoWorkspace()
    ? '悬停视频可静音预览，点开后可设置入点 / 出点'
    : '点开照片后可用 P / U / X 快速筛选';
}

function renderAll() {
  renderProjects();
  renderActiveProject();
}

function observeLoadSentinel(enabled) {
  if (loadObserver) loadObserver.disconnect();
  if (!enabled) return;
  loadObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      visibleLimit += 160;
      const project = activeProject();
      if (project) renderGallery(project);
    }
  }, { rootMargin: '500px' });
  loadObserver.observe(els.loadSentinel);
}

async function selectProject(projectId) {
  if (!libraryState.projects.some((project) => project.id === projectId)) return;
  libraryState.activeProjectId = projectId;
  activeFilter = 'all';
  activeFeatureFilter = 'all';
  activeColorFilter = 'all';
  activeVideoFeatureFilter = 'all';
  activeWorkspace = assetsForWorkspace(activeProject(), 'photo').length ? 'photo' : 'video';
  searchQuery = '';
  els.searchInput.value = '';
  els.featureFilter.value = 'all';
  els.videoFeatureFilter.value = 'all';
  visibleLimit = 160;
  renderAll();
  await api.setActiveProject(projectId);
}

function setWorkspace(workspace) {
  if (!['photo', 'video'].includes(workspace) || workspace === activeWorkspace) return;
  const project = activeProject();
  if (!assetsForWorkspace(project, workspace).length) {
    showToast(workspace === 'video' ? '当前项目还没有视频素材' : '当前项目还没有照片素材', 'error');
    return;
  }
  closeReview();
  activeWorkspace = workspace;
  activeFilter = 'all';
  activeFeatureFilter = 'all';
  activeColorFilter = 'all';
  activeVideoFeatureFilter = 'all';
  searchQuery = '';
  els.searchInput.value = '';
  els.featureFilter.value = 'all';
  els.videoFeatureFilter.value = 'all';
  visibleLimit = 160;
  renderActiveProject();
}

function setColorFilter(filter) {
  activeColorFilter = COLOR_FILTER_LABELS[filter] ? filter : 'all';
  visibleLimit = 160;
  renderActiveProject();
  if (!els.reviewOverlay.hidden && !filteredAssets.some((asset) => asset.id === reviewAssetId)) {
    closeReview();
  }
}

function setFilter(filter) {
  activeFilter = filter;
  visibleLimit = 160;
  renderActiveProject();
  if (!els.reviewOverlay.hidden && !filteredAssets.some((asset) => asset.id === reviewAssetId)) {
    closeReview();
  }
}

async function updateAsset(assetId, patch) {
  const project = activeProject();
  const asset = project?.assets.find((item) => item.id === assetId);
  if (!project || !asset) return;

  const previous = { status: asset.status, rating: asset.rating, video: { ...(asset.video || {}) } };
  const reviewWasOpen = !els.reviewOverlay.hidden && reviewAssetId === assetId;
  const previousIndex = filteredAssets.findIndex((item) => item.id === assetId);
  Object.assign(asset, patch);
  renderProjects();
  renderActiveProject();

  if (reviewWasOpen) {
    if (filteredAssets.some((item) => item.id === assetId)) {
      reviewAssetId = assetId;
    } else {
      reviewAssetId = filteredAssets[Math.min(Math.max(previousIndex, 0), filteredAssets.length - 1)]?.id || null;
    }
    if (reviewAssetId) renderReview();
    else closeReview();
  }

  try {
    await api.updateAsset({ projectId: project.id, assetId, patch });
  } catch (error) {
    Object.assign(asset, previous);
    renderAll();
    if (reviewWasOpen) {
      reviewAssetId = assetId;
      renderReview();
    }
    showToast(error.message || '保存筛选结果失败', 'error');
  }
}

function openReview(assetId) {
  if (!filteredAssets.some((asset) => asset.id === assetId)) return;
  reviewAssetId = assetId;
  els.reviewOverlay.hidden = false;
  renderReview();
}

function closeReview() {
  reviewAssetId = null;
  loadedReviewAssetId = null;
  selectedVideoClipId = null;
  els.reviewOverlay.hidden = true;
  els.reviewOverlay.classList.remove('video-review');
  els.reviewImage.removeAttribute('src');
  els.reviewVideo.pause();
  els.reviewVideo.removeAttribute('src');
  els.reviewVideo.load();
}

function updateZoomUi() {
  const percentage = Math.round(reviewZoom * 100);
  els.zoomSlider.value = String(Math.max(10, Math.min(500, percentage)));
  els.zoomLevel.textContent = `${percentage}%`;
  els.reviewImageWrap.classList.toggle('can-pan', reviewZoom > 1.001);
}

function applyReviewTransform() {
  els.reviewImage.style.width = `${reviewBaseWidth}px`;
  els.reviewImage.style.height = `${reviewBaseHeight}px`;
  els.reviewImage.style.transform = `translate(${reviewPanX}px, ${reviewPanY}px) scale(${reviewZoom})`;
  updateZoomUi();
}

function calculateReviewFit() {
  if (!els.reviewImage.naturalWidth || !els.reviewImage.naturalHeight) return;
  const style = getComputedStyle(els.reviewImageWrap);
  const availableWidth = Math.max(
    1,
    els.reviewImageWrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  );
  const availableHeight = Math.max(
    1,
    els.reviewImageWrap.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
  );
  const fitScale = Math.min(
    availableWidth / els.reviewImage.naturalWidth,
    availableHeight / els.reviewImage.naturalHeight,
    1
  );
  reviewBaseWidth = Math.max(1, Math.floor(els.reviewImage.naturalWidth * fitScale));
  reviewBaseHeight = Math.max(1, Math.floor(els.reviewImage.naturalHeight * fitScale));
  reviewZoom = 1;
  reviewPanX = 0;
  reviewPanY = 0;
  applyReviewTransform();
}

function resetReviewZoom() {
  reviewZoom = 1;
  reviewPanX = 0;
  reviewPanY = 0;
  applyReviewTransform();
  if (els.reviewImage.complete && els.reviewImage.naturalWidth) {
    requestAnimationFrame(calculateReviewFit);
  }
}

function setReviewZoom(nextZoom) {
  reviewZoom = Math.max(0.1, Math.min(5, Number(nextZoom) || 1));
  if (reviewZoom <= 1) {
    reviewPanX = 0;
    reviewPanY = 0;
  }
  applyReviewTransform();
}

function metricMarkup(label, value, detail) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  return `
    <div class="analysis-metric">
      <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(detail)}</strong></div>
      <div class="metric-track"><i style="width:${safeValue}%"></i></div>
    </div>
  `;
}

function renderReview() {
  const project = activeProject();
  const asset = project?.assets.find((item) => item.id === reviewAssetId);
  if (!project || !asset) {
    closeReview();
    return;
  }

  const index = filteredAssets.findIndex((item) => item.id === asset.id);
  els.reviewCounter.textContent = `${index + 1} / ${filteredAssets.length}`;
  els.reviewFileName.textContent = asset.name;
  els.reviewFileMeta.textContent = `${asset.ext.replace('.', '').toUpperCase()} · ${formatBytes(asset.size)}`;
  els.previousPhoto.disabled = index <= 0;
  els.nextPhoto.disabled = index < 0 || index >= filteredAssets.length - 1;

  const isVideo = assetKind(asset) === 'video';
  els.reviewOverlay.classList.toggle('video-review', isVideo);
  els.reviewImage.hidden = isVideo;
  els.reviewVideo.hidden = !isVideo;
  if (isVideo) {
    els.reviewImageWrap.classList.remove('can-pan', 'panning');
    if (loadedReviewAssetId !== asset.id) {
      loadedReviewAssetId = asset.id;
      selectedVideoClipId = videoClips(asset)[0]?.id || null;
      els.reviewVideo.onloadedmetadata = () => {
        persistVideoMetadata(asset.id, els.reviewVideo);
        const currentAsset = activeProject()?.assets.find((item) => item.id === asset.id);
        const firstClip = videoClips(currentAsset || asset)[0];
        if (firstClip?.start > 0) {
          els.reviewVideo.currentTime = Math.min(firstClip.start, Math.max(0, els.reviewVideo.duration - 0.1));
        }
        if (reviewAssetId === asset.id) renderVideoReview(currentAsset || asset);
      };
      els.reviewVideo.ontimeupdate = () => {
        const currentAsset = activeProject()?.assets.find((item) => item.id === asset.id);
        if (reviewAssetId === asset.id && currentAsset) updateVideoPlayhead(currentAsset);
      };
      els.reviewVideo.onseeked = () => {
        const currentAsset = activeProject()?.assets.find((item) => item.id === asset.id);
        if (reviewAssetId === asset.id && currentAsset) updateVideoPlayhead(currentAsset);
      };
      els.reviewVideo.onerror = () => showToast('当前视频格式无法在应用内预览，但仍可标记和导出原文件', 'error', 6000);
      els.reviewVideo.src = `travel-photo://original/${asset.id}`;
    }
    renderReviewControls(asset);
    renderVideoReview(asset);
    return;
  }

  els.reviewVideo.pause();

  const originalUrl = `travel-photo://original/${asset.id}`;
  const thumbnailUrl = `travel-photo://thumb/${asset.id}`;
  if (loadedReviewAssetId !== asset.id) {
    loadedReviewAssetId = asset.id;
    resetReviewZoom();
    els.reviewImage.onload = () => calculateReviewFit();
    els.reviewImage.onerror = () => {
      if (els.reviewImage.src !== thumbnailUrl) els.reviewImage.src = thumbnailUrl;
    };
    els.reviewImage.src = originalUrl;
  }

  renderReviewControls(asset);

  const analysis = asset.analysis || {};
  const flags = analysis.flags || [];
  const score = analysis.technicalScore ?? analysis.score;
  const hasUnderstanding = analysis.state === 'done' && analysis.version === ANALYSIS_VERSION;
  els.photoSummary.textContent = hasUnderstanding
    ? analysis.summary
    : analysis.state === 'unsupported' ? '当前格式暂时无法生成视觉理解。' : '正在本地理解这张照片…';
  els.styleTags.innerHTML = hasUnderstanding
    ? (analysis.styleTags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')
    : '<span class="muted-tag">等待分析</span>';
  els.paletteStrip.innerHTML = hasUnderstanding && analysis.palette?.length
    ? analysis.palette.map((color) => `
        <span style="background:${safeColor(color.hex)}" title="${escapeHtml(color.name)} · ${color.weight}%">
          <small>${escapeHtml(color.name)}</small>
        </span>
      `).join('')
    : '<span class="empty-palette">尚未生成色板</span>';
  const colorProfile = analysis.colorProfile;
  els.colorStory.textContent = hasUnderstanding && colorProfile
    ? `以${colorProfile.dominantFamilyLabel || '中性色'}为主${colorProfile.labels?.length ? `，识别为${colorProfile.labels.join('、')}` : ''}。色板平均饱和度 ${colorProfile.averageSaturation}% · 平均明度 ${colorProfile.averageBrightness}%。`
    : '等待生成颜色关系与氛围判断。';
  els.analysisMetrics.innerHTML = hasUnderstanding
    ? [
        metricMarkup('曝光平衡', analysis.metrics?.exposure, String(analysis.metrics?.exposure ?? '—')),
        metricMarkup('清晰细节', analysis.metrics?.clarity, String(analysis.clarity ?? '—')),
        metricMarkup('对比层次', analysis.metrics?.contrast, String(analysis.contrast ?? '—')),
        metricMarkup('色彩饱和', analysis.metrics?.saturation, `${analysis.saturation ?? '—'}%`),
        metricMarkup('冷暖倾向', analysis.metrics?.warmth, analysis.colorTone === 'warm' ? '偏暖' : analysis.colorTone === 'cool' ? '偏冷' : '中性')
      ].join('')
    : '';

  els.qualityScore.textContent = score == null ? '等待分析' : `技术分 ${score}`;
  els.qualityFlags.innerHTML = flags.length
    ? flags.map((flag) => `<span class="quality-flag">${escapeHtml(flag)}</span>`).join('')
    : '<span class="quality-flag clear">暂无明显技术问题</span>';

  els.fileDetails.innerHTML = `
    <dt>修改时间</dt><dd>${formatDate(asset.modifiedAt)}</dd>
    <dt>文件大小</dt><dd>${formatBytes(asset.size)}</dd>
    <dt>画幅方向</dt><dd>${analysis.orientation === 'portrait' ? '竖幅' : analysis.orientation === 'landscape' ? '横幅' : analysis.orientation === 'square' ? '近方形' : '—'}</dd>
    <dt>平均亮度</dt><dd>${analysis.brightness ?? '—'} / 255</dd>
    <dt>动态范围</dt><dd>${analysis.dynamicRange ?? '—'} / 255</dd>
    <dt>对比度</dt><dd>${analysis.contrast ?? '—'}</dd>
    <dt>饱和度</dt><dd>${analysis.saturation ?? '—'}%</dd>
    <dt>颜色判断</dt><dd>${escapeHtml(analysis.colorProfile?.labels?.join('、') || analysis.colorProfile?.dominantFamilyLabel || '—')}</dd>
    <dt>暗部剪切</dt><dd>${analysis.shadowClip ?? '—'}%</dd>
    <dt>高光剪切</dt><dd>${analysis.highlightClip ?? '—'}%</dd>
    <dt>构图倾向</dt><dd>${escapeHtml(analysis.composition?.label || '—')}</dd>
    <dt>视觉重心</dt><dd>${escapeHtml(analysis.composition?.centerLabel || '—')}</dd>
    <dt>原始位置</dt><dd>${escapeHtml(asset.path)}</dd>
  `;
}

function renderReviewControls(asset) {
  document.querySelectorAll('[data-review-status]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewStatus === asset.status);
  });
  els.ratingRow.innerHTML = Array.from({ length: 6 }, (_, rating) => `
    <button class="rating-button ${asset.rating === rating ? 'active' : ''}" data-rating="${rating}" type="button" title="${rating} 星">
      ${rating === 0 ? '0' : '★'}
    </button>
  `).join('');
}

function renderVideoReview(asset) {
  const video = asset.video || {};
  const duration = Number(video.duration || els.reviewVideo.duration || 0);
  const clips = videoClips(asset);
  const draftStart = Number.isFinite(Number(video.draftStart)) ? Number(video.draftStart) : null;
  if (!clips.some((clip) => clip.id === selectedVideoClipId)) {
    selectedVideoClipId = clips[0]?.id || null;
  }
  const selectedClip = clips.find((clip) => clip.id === selectedVideoClipId) || null;
  const selectedDuration = totalClipDuration(asset);
  els.reviewFileMeta.textContent = `${asset.ext.replace('.', '').toUpperCase()} · ${formatBytes(asset.size)}${duration ? ` · ${formatDuration(duration)}` : ''}`;
  els.videoDurationLabel.textContent = duration
    ? `原片 ${formatDuration(duration)} · ${clips.length} 段`
    : '正在读取时长';
  els.videoClipCopy.textContent = !duration
    ? '视频时长读取后，即可标记适合放进 Vlog 的多个片段。'
    : draftStart != null
      ? `入点已设在 ${formatDuration(draftStart)}；继续播放后点击“设为出点并添加”。`
      : clips.length
        ? `已保存 ${clips.length} 段候选片段，共 ${formatDuration(selectedDuration)}。点击下方片段可定位并选择。`
        : '播放到想保留的开始位置，点击“设为入点”；结束位置点击“设为出点并添加”。';
  els.videoClipList.innerHTML = clips.length
    ? clips.map((clip, index) => `
        <button class="video-clip-list-item ${clip.id === selectedVideoClipId ? 'active' : ''}" data-select-video-clip="${escapeHtml(clip.id)}" type="button">
          <span>片段 ${index + 1}</span>
          <strong>${formatDuration(clip.start)} → ${formatDuration(clip.end)}</strong>
          <small>${formatDuration(clip.end - clip.start)} · 点击定位</small>
        </button>
      `).join('')
    : '<div class="video-clip-empty">尚未添加候选片段</div>';
  els.setVideoOut.disabled = draftStart == null;
  els.deleteVideoClip.disabled = !selectedClip;
  renderVideoTimeline(asset);
  const orientation = videoOrientation(asset);
  els.fileDetails.innerHTML = `
    <dt>修改时间</dt><dd>${formatDate(asset.modifiedAt)}</dd>
    <dt>文件大小</dt><dd>${formatBytes(asset.size)}</dd>
    <dt>视频时长</dt><dd>${duration ? formatDuration(duration) : '正在读取'}</dd>
    <dt>画面尺寸</dt><dd>${video.width && video.height ? `${video.width} × ${video.height}` : '正在读取'}</dd>
    <dt>画幅方向</dt><dd>${orientation === 'portrait' ? '竖屏' : orientation === 'landscape' ? '横屏' : '正在读取'}</dd>
    <dt>候选片段</dt><dd>${clips.length ? `${clips.length} 段 · 共 ${formatDuration(selectedDuration)}` : '尚未标记'}</dd>
    <dt>原始位置</dt><dd>${escapeHtml(asset.path)}</dd>
  `;
}

function renderVideoTimeline(asset) {
  const duration = Number(asset.video?.duration || els.reviewVideo.duration || 0);
  const clips = videoClips(asset);
  const draftStart = Number.isFinite(Number(asset.video?.draftStart)) ? Number(asset.video.draftStart) : null;
  els.videoTimelineEnd.textContent = duration ? formatDuration(duration) : '读取中';
  if (!duration) {
    els.videoClipTimeline.innerHTML = '<span class="video-timeline-loading">读取视频时间轴…</span>';
    els.videoPlayhead.textContent = '当前位置 00:00';
    return;
  }
  els.videoClipTimeline.innerHTML = `
    <i class="video-timeline-playhead" style="left:${Math.min(100, Math.max(0, (Number(els.reviewVideo.currentTime || 0) / duration) * 100))}%"></i>
    ${draftStart != null ? `<i class="video-timeline-draft" style="left:${Math.min(100, Math.max(0, (draftStart / duration) * 100))}%"></i>` : ''}
    ${clips.map((clip, index) => {
      const left = Math.min(100, Math.max(0, (Number(clip.start) / duration) * 100));
      const width = Math.max(0.7, Math.min(100 - left, ((Number(clip.end) - Number(clip.start)) / duration) * 100));
      return `<button class="video-timeline-clip ${clip.id === selectedVideoClipId ? 'active' : ''}" data-select-video-clip="${escapeHtml(clip.id)}" style="left:${left}%;width:${width}%" type="button" title="片段 ${index + 1}：${formatDuration(clip.start)} → ${formatDuration(clip.end)}"></button>`;
    }).join('')}
  `;
  updateVideoPlayhead(asset);
}

function updateVideoPlayhead(asset) {
  const duration = Number(asset.video?.duration || els.reviewVideo.duration || 0);
  const current = Number(els.reviewVideo.currentTime || 0);
  els.videoPlayhead.textContent = `当前位置 ${formatDuration(current)}`;
  const indicator = els.videoClipTimeline.querySelector('.video-timeline-playhead');
  if (indicator && duration) indicator.style.left = `${Math.min(100, Math.max(0, (current / duration) * 100))}%`;
}

function navigateReview(direction) {
  const index = filteredAssets.findIndex((asset) => asset.id === reviewAssetId);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= filteredAssets.length) return;
  reviewAssetId = filteredAssets[nextIndex].id;
  renderReview();
}

function openImportDialog() {
  selectedSource = null;
  nameWasEdited = false;
  els.projectNameInput.value = '';
  els.folderPickerTitle.textContent = '选择照片和视频素材文件夹';
  els.folderPickerPath.textContent = '支持包含多个相机子文件夹';
  els.createProjectButton.disabled = true;
  els.createProjectButton.textContent = '开始导入';
  els.importModal.hidden = false;
}

function closeImportDialog() {
  if (els.createProjectButton.disabled && selectedSource) return;
  els.importModal.hidden = true;
}

async function chooseSourceFolder() {
  try {
    const selection = await api.chooseSource();
    if (!selection) return;
    selectedSource = selection;
    els.folderPickerTitle.textContent = selection.suggestedName;
    els.folderPickerPath.textContent = selection.path;
    if (!nameWasEdited || !els.projectNameInput.value.trim()) {
      els.projectNameInput.value = selection.suggestedName;
    }
    els.createProjectButton.disabled = false;
  } catch (error) {
    showToast(error.message || '无法选择文件夹', 'error');
  }
}

async function createProject() {
  if (!selectedSource || els.createProjectButton.disabled) return;
  const name = els.projectNameInput.value.trim() || selectedSource.suggestedName;
  els.createProjectButton.disabled = true;
  els.createProjectButton.textContent = '正在扫描素材…';
  els.chooseFolderButton.disabled = true;

  try {
    const result = await api.createProject({ name, sourcePath: selectedSource.path });
    libraryState = result.state;
    els.importModal.hidden = true;
    activeFilter = 'all';
    activeFeatureFilter = 'all';
    activeColorFilter = 'all';
    activeVideoFeatureFilter = 'all';
    activeWorkspace = assetsForWorkspace(activeProject(), 'photo').length ? 'photo' : 'video';
    searchQuery = '';
    els.featureFilter.value = 'all';
    els.videoFeatureFilter.value = 'all';
    visibleLimit = 160;
    renderAll();
    const warnings = result.warnings?.length || 0;
    showToast(warnings ? `导入完成，另有 ${warnings} 个文件或目录无法读取` : '导入完成，照片理解与视频信息读取正在进行');
  } catch (error) {
    showToast(error.message || '导入失败', 'error', 5000);
  } finally {
    els.createProjectButton.disabled = false;
    els.createProjectButton.textContent = '开始导入';
    els.chooseFolderButton.disabled = false;
  }
}

async function rescanProject() {
  const project = activeProject();
  if (!project) return;
  els.rescanButton.disabled = true;
  els.rescanButton.textContent = '正在扫描…';
  try {
    const result = await api.rescanProject(project.id);
    const index = libraryState.projects.findIndex((item) => item.id === project.id);
    libraryState.projects[index] = result.project;
    visibleLimit = 160;
    renderAll();
    showToast(result.warnings?.length ? `扫描完成，${result.warnings.length} 项无法读取` : '素材文件夹已更新');
  } catch (error) {
    showToast(error.message || '重新扫描失败', 'error');
  } finally {
    els.rescanButton.disabled = false;
    els.rescanButton.textContent = '重新扫描';
  }
}

async function exportPicks() {
  const project = activeProject();
  if (!project) return;
  const kindLabel = isVideoWorkspace() ? '视频' : '照片';
  const pickCount = assetsForWorkspace(project).filter((asset) => asset.status === 'pick').length;
  if (!pickCount) {
    showToast(`先把喜欢的${kindLabel}标记为“保留”，再进行导出`, 'error');
    return;
  }

  els.exportButton.disabled = true;
  els.exportButton.textContent = '选择导出位置…';
  try {
    const result = await api.exportPicks({ projectId: project.id, kind: activeWorkspace });
    if (result.canceled) return;
    showToast(`已安全复制 ${result.copied} ${isVideoWorkspace() ? '段视频' : '张照片'}到：${result.outputDirectory}`, 'normal', 7000);
  } catch (error) {
    showToast(error.message || '导出失败', 'error', 5000);
  } finally {
    els.exportButton.disabled = false;
    renderSummary(project);
  }
}

function setVideoMarker(marker) {
  const project = activeProject();
  const asset = project?.assets.find((item) => item.id === reviewAssetId);
  if (!asset || assetKind(asset) !== 'video') return;
  const duration = Number(asset.video?.duration || els.reviewVideo.duration || 0);
  if (!duration || !Number.isFinite(els.reviewVideo.currentTime)) {
    showToast('视频正在读取，稍后再标记片段', 'error');
    return;
  }
  const currentTime = Math.max(0, Math.min(duration, els.reviewVideo.currentTime));
  const next = { ...(asset.video || {}), duration, clips: videoClips(asset).map((clip) => ({ ...clip })) };
  if (marker === 'in') {
    next.draftStart = currentTime;
    selectedVideoClipId = null;
    showToast(`已设入点 ${formatDuration(currentTime)}，继续播放后设出点即可添加片段`);
  } else if (marker === 'out') {
    const draftStart = Number(next.draftStart);
    if (!Number.isFinite(draftStart)) {
      showToast('请先设置入点，再设置出点', 'error');
      return;
    }
    if (currentTime - draftStart < 0.1) {
      showToast('出点需要在入点之后', 'error');
      return;
    }
    const id = `clip-${Date.now()}-${Math.round(currentTime * 1000)}`;
    next.clips.push({ id, start: draftStart, end: currentTime });
    next.clips.sort((left, right) => left.start - right.start || left.end - right.end);
    next.draftStart = null;
    selectedVideoClipId = id;
    showToast(`已添加片段 ${formatDuration(draftStart)} → ${formatDuration(currentTime)}`);
  } else if (marker === 'delete') {
    if (!selectedVideoClipId) {
      showToast('先点击时间轴或片段列表，选择要删除的片段', 'error');
      return;
    }
    const index = next.clips.findIndex((clip) => clip.id === selectedVideoClipId);
    if (index < 0) return;
    next.clips.splice(index, 1);
    selectedVideoClipId = next.clips[Math.min(index, next.clips.length - 1)]?.id || null;
    showToast('已删除所选片段');
  }
  updateAsset(asset.id, { video: next });
}

function selectVideoClip(clipId) {
  const asset = activeProject()?.assets.find((item) => item.id === reviewAssetId);
  const clip = videoClips(asset).find((item) => item.id === clipId);
  if (!asset || !clip) return;
  selectedVideoClipId = clip.id;
  els.reviewVideo.currentTime = clip.start;
  renderVideoReview(asset);
}

document.querySelector('#import-trigger').addEventListener('click', openImportDialog);
document.querySelector('#welcome-import').addEventListener('click', openImportDialog);
els.chooseFolderButton.addEventListener('click', chooseSourceFolder);
els.createProjectButton.addEventListener('click', createProject);
els.projectNameInput.addEventListener('input', () => {
  nameWasEdited = true;
});
document.querySelectorAll('[data-close-import]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!els.createProjectButton.disabled || !selectedSource) els.importModal.hidden = true;
  });
});

els.projectList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-project-id]');
  if (button) selectProject(button.dataset.projectId);
});

els.workspaceSwitch.addEventListener('click', (event) => {
  const button = event.target.closest('[data-workspace]');
  if (button) setWorkspace(button.dataset.workspace);
});

document.querySelector('#status-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (button) setFilter(button.dataset.filter);
});

document.querySelector('.summary-strip').addEventListener('click', (event) => {
  const button = event.target.closest('[data-summary-filter]');
  if (button) setFilter(button.dataset.summaryFilter);
});

els.gallery.addEventListener('click', (event) => {
  const quickButton = event.target.closest('[data-quick-status]');
  if (quickButton) {
    event.preventDefault();
    updateAsset(quickButton.dataset.assetId, { status: quickButton.dataset.quickStatus });
    return;
  }
  const openButton = event.target.closest('[data-open-asset]');
  if (openButton) openReview(openButton.dataset.openAsset);
});

els.searchInput.addEventListener('input', (event) => {
  searchQuery = event.target.value;
  visibleLimit = 160;
  renderActiveProject();
});

els.sortSelect.addEventListener('change', (event) => {
  sortMode = event.target.value;
  visibleLimit = 160;
  renderActiveProject();
});

els.featureFilter.addEventListener('change', (event) => {
  activeFeatureFilter = event.target.value;
  visibleLimit = 160;
  renderActiveProject();
});

els.videoFeatureFilter.addEventListener('change', (event) => {
  activeVideoFeatureFilter = event.target.value;
  visibleLimit = 160;
  renderActiveProject();
});

els.colorFilterOptions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-color-filter]');
  if (button) setColorFilter(button.dataset.colorFilter);
});

els.gridSize.addEventListener('input', (event) => {
  document.documentElement.style.setProperty('--card-min', `${event.target.value}px`);
});

document.querySelector('#open-source').addEventListener('click', () => {
  const project = activeProject();
  if (project) api.revealProjectSource(project.id);
});
document.querySelector('#rescan-button').addEventListener('click', rescanProject);
document.querySelector('#export-button').addEventListener('click', exportPicks);

els.restartAnalysisButton.addEventListener('click', async () => {
  const project = activeProject();
  if (!project) return;
  activeFeatureFilter = 'all';
  activeColorFilter = 'all';
  els.featureFilter.value = 'all';
  for (const asset of assetsForWorkspace(project, 'photo')) {
    asset.analysis = { version: ANALYSIS_VERSION, state: 'pending', score: null, flags: [] };
  }
  renderAll();
  els.restartAnalysisButton.disabled = true;
  els.restartAnalysisButton.textContent = '正在重新分析…';
  try {
    await api.restartAnalysis(project.id);
    showToast('已开始重新理解这组照片，分析会在后台进行');
  } catch (error) {
    showToast(error.message || '无法重新分析', 'error');
  } finally {
    els.restartAnalysisButton.disabled = false;
    els.restartAnalysisButton.textContent = '重新深入分析';
  }
});

document.querySelector('#remove-project-button').addEventListener('click', async () => {
  const project = activeProject();
  if (!project) return;
  const confirmed = window.confirm(`只从旅图整理台中移除“${project.name}”？\n\n原始照片不会被删除。`);
  if (!confirmed) return;
  try {
    libraryState = await api.removeProject(project.id);
    activeFilter = 'all';
    activeFeatureFilter = 'all';
    activeColorFilter = 'all';
    activeVideoFeatureFilter = 'all';
    activeWorkspace = 'photo';
    searchQuery = '';
    renderAll();
    showToast('项目记录已移除，原始照片未受影响');
  } catch (error) {
    showToast(error.message || '移除项目失败', 'error');
  }
});

document.querySelector('#close-review').addEventListener('click', closeReview);
els.previousPhoto.addEventListener('click', () => navigateReview(-1));
els.nextPhoto.addEventListener('click', () => navigateReview(1));
document.querySelector('#reveal-asset').addEventListener('click', () => {
  if (reviewAssetId) api.revealAsset(reviewAssetId);
});
els.setVideoIn.addEventListener('click', () => setVideoMarker('in'));
els.setVideoOut.addEventListener('click', () => setVideoMarker('out'));
els.deleteVideoClip.addEventListener('click', () => setVideoMarker('delete'));
els.videoClipTimeline.addEventListener('click', (event) => {
  const clip = event.target.closest('[data-select-video-clip]');
  if (clip) {
    selectVideoClip(clip.dataset.selectVideoClip);
    return;
  }
  const asset = activeProject()?.assets.find((item) => item.id === reviewAssetId);
  const duration = Number(asset?.video?.duration || els.reviewVideo.duration || 0);
  if (!duration) return;
  const bounds = els.videoClipTimeline.getBoundingClientRect();
  const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  els.reviewVideo.currentTime = duration * position;
});
els.videoClipList.addEventListener('click', (event) => {
  const clip = event.target.closest('[data-select-video-clip]');
  if (clip) selectVideoClip(clip.dataset.selectVideoClip);
});

els.zoomOut.addEventListener('click', () => setReviewZoom(reviewZoom / 1.25));
els.zoomIn.addEventListener('click', () => setReviewZoom(reviewZoom * 1.25));
els.zoomFit.addEventListener('click', calculateReviewFit);
els.zoomSlider.addEventListener('input', (event) => {
  setReviewZoom(Number(event.target.value) / 100);
});

els.reviewImageWrap.addEventListener('wheel', (event) => {
  if (els.reviewOverlay.hidden || els.reviewOverlay.classList.contains('video-review')) return;
  event.preventDefault();
  setReviewZoom(reviewZoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
}, { passive: false });

els.reviewImageWrap.addEventListener('dblclick', () => {
  if (els.reviewOverlay.classList.contains('video-review')) return;
  setReviewZoom(reviewZoom > 1.01 ? 1 : 2);
});

els.reviewImageWrap.addEventListener('pointerdown', (event) => {
  if (els.reviewOverlay.classList.contains('video-review') || reviewZoom <= 1.001 || event.button !== 0) return;
  panning = true;
  panOrigin = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    panX: reviewPanX,
    panY: reviewPanY
  };
  els.reviewImageWrap.classList.add('panning');
  els.reviewImageWrap.setPointerCapture(event.pointerId);
});

els.reviewImageWrap.addEventListener('pointermove', (event) => {
  if (!panning || !panOrigin) return;
  reviewPanX = panOrigin.panX + event.clientX - panOrigin.pointerX;
  reviewPanY = panOrigin.panY + event.clientY - panOrigin.pointerY;
  applyReviewTransform();
});

function stopPanning(event) {
  if (!panning) return;
  panning = false;
  panOrigin = null;
  els.reviewImageWrap.classList.remove('panning');
  if (event?.pointerId != null && els.reviewImageWrap.hasPointerCapture(event.pointerId)) {
    els.reviewImageWrap.releasePointerCapture(event.pointerId);
  }
}

els.reviewImageWrap.addEventListener('pointerup', stopPanning);
els.reviewImageWrap.addEventListener('pointercancel', stopPanning);

window.addEventListener('resize', () => {
  if (!els.reviewOverlay.hidden && !els.reviewOverlay.classList.contains('video-review')) calculateReviewFit();
});

document.querySelectorAll('[data-review-status]').forEach((button) => {
  button.addEventListener('click', () => {
    if (reviewAssetId) updateAsset(reviewAssetId, { status: button.dataset.reviewStatus });
  });
});

els.ratingRow.addEventListener('click', (event) => {
  const button = event.target.closest('[data-rating]');
  if (button && reviewAssetId) updateAsset(reviewAssetId, { rating: Number(button.dataset.rating) });
});

document.addEventListener('keydown', (event) => {
  const tagName = document.activeElement?.tagName;
  const typing = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  if (!els.importModal.hidden || typing) {
    if (event.key === 'Escape' && !els.importModal.hidden && !els.createProjectButton.disabled) {
      els.importModal.hidden = true;
    }
    return;
  }
  if (els.reviewOverlay.hidden) return;

  if (event.key === 'Escape') closeReview();
  else if (event.key === 'ArrowLeft') navigateReview(-1);
  else if (event.key === 'ArrowRight') navigateReview(1);
  else if (event.key.toLowerCase() === 'p') updateAsset(reviewAssetId, { status: 'pick' });
  else if (event.key.toLowerCase() === 'u') updateAsset(reviewAssetId, { status: 'maybe' });
  else if (event.key.toLowerCase() === 'x') updateAsset(reviewAssetId, { status: 'reject' });
  else if (!els.reviewOverlay.classList.contains('video-review') && (event.key === '+' || event.key === '=')) setReviewZoom(reviewZoom * 1.25);
  else if (!els.reviewOverlay.classList.contains('video-review') && (event.key === '-' || event.key === '_')) setReviewZoom(reviewZoom / 1.25);
  else if (!els.reviewOverlay.classList.contains('video-review') && event.key.toLowerCase() === 'f') calculateReviewFit();
  else if (/^[0-5]$/.test(event.key)) updateAsset(reviewAssetId, { rating: Number(event.key) });
});

api.onScanProgress(({ scanned }) => {
  if (!els.importModal.hidden) els.createProjectButton.textContent = `已找到 ${scanned} 项素材…`;
  if (els.rescanButton.disabled) els.rescanButton.textContent = `已找到 ${scanned} 项素材…`;
});

api.onAnalysisProgress((progress) => {
  const project = libraryState.projects.find((item) => item.id === progress.projectId);
  if (!project) return;
  analysisProgress.set(progress.projectId, progress);
  for (const update of progress.assets || []) {
    const asset = project.assets.find((item) => item.id === update.id);
    if (asset) asset.analysis = update.analysis;
  }
  renderProjects();
  if (project.id === libraryState.activeProjectId) renderActiveProject();
});

api.onExportProgress(({ projectId, copied, total }) => {
  if (activeProject()?.id === projectId) {
    els.exportButton.textContent = `正在复制 ${copied} / ${total}`;
  }
});

async function boot() {
  try {
    libraryState = await api.getState();
    renderAll();
    const smokeParams = new URLSearchParams(window.location.search);
    const smokeColorFilter = smokeParams.get('smokeColorFilter');
    if (smokeColorFilter && COLOR_FILTER_LABELS[smokeColorFilter]) {
      setColorFilter(smokeColorFilter);
    }
    const smokeWorkspace = smokeParams.get('smokeWorkspace');
    if (smokeWorkspace === 'photo' || smokeWorkspace === 'video') {
      setWorkspace(smokeWorkspace);
    }
    if (smokeParams.get('smokeReview') === '1') {
      const preferredName = smokeParams.get('smokeReviewFile');
      const project = activeProject();
      const firstAsset = project?.assets?.find((asset) => asset.name === preferredName) || project?.assets?.[0];
      if (firstAsset) openReview(firstAsset.id);
    }
  } catch (error) {
    showToast(error.message || '无法读取本地素材库', 'error', 6000);
  }
}

boot();
