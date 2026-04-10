/* =========================================================
   TG Drive – TMDB / Movies Panel   (tmdb.js v4)
   ========================================================= */

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';

let tmdbCurrentTab = 'trending';
let tmdbCurrentPage = 1;
let tmdbSearchQuery = '';

// ── Open / Close ──────────────────────────────────────────
function openTmdbPanel() {
    const panel = document.getElementById('tmdb-panel');
    const overlay = document.getElementById('mobile-overlay');
    if (!panel) return;
    panel.classList.add('open');
    overlay?.classList.add('active');
    // Load default tab
    tmdbLoadTab('trending');
}

function closeTmdbPanel() {
    const panel = document.getElementById('tmdb-panel');
    const overlay = document.getElementById('mobile-overlay');
    panel?.classList.remove('open');
    // Only remove overlay if sidebar isn't open
    const sidebar = document.getElementById('sidebar');
    if (!sidebar?.classList.contains('active')) {
        overlay?.classList.remove('active');
    }
}

// ── Loader helpers ────────────────────────────────────────
function tmdbShowLoader() {
    const loader = document.getElementById('tmdb-loader');
    const grid   = document.getElementById('tmdb-grid');
    if (loader) loader.style.display = 'flex';
    if (grid)   grid.innerHTML = '';
}

function tmdbHideLoader() {
    const loader = document.getElementById('tmdb-loader');
    if (loader) loader.style.display = 'none';
}

// ── Tab loader ────────────────────────────────────────────
async function tmdbLoadTab(tab) {
    tmdbCurrentTab = tab;

    // Update active tab button
    document.querySelectorAll('.tmdb-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    tmdbShowLoader();

    try {
        let data;
        if (tab === 'trending') {
            data = await tmdbFetch('/api/tmdb/trending?media_type=all&time_window=week');
        } else if (tab === 'movies') {
            data = await tmdbFetch('/api/tmdb/trending?media_type=movie&time_window=week');
        } else if (tab === 'tv') {
            data = await tmdbFetch('/api/tmdb/trending?media_type=tv&time_window=week');
        } else if (tab === 'search') {
            if (!tmdbSearchQuery) { tmdbHideLoader(); return; }
            data = await tmdbFetch(`/api/tmdb/search?query=${encodeURIComponent(tmdbSearchQuery)}&page=1`);
        }
        tmdbHideLoader();
        tmdbRenderGrid(data?.results || []);
    } catch (e) {
        tmdbHideLoader();
        const grid = document.getElementById('tmdb-grid');
        if (grid) {
            if (e.message && e.message.includes('503')) {
                grid.innerHTML = '<div class="tmdb-no-results">⚙️ TMDB_API_KEY not configured.<br>Add <code>TMDB_API_KEY</code> to your environment variables.</div>';
            } else {
                grid.innerHTML = '<div class="tmdb-no-results">⚠️ Failed to load content. Check your TMDB API key.</div>';
            }
        }
        console.error('TMDB error:', e);
    }
}

// ── Fetch wrapper ─────────────────────────────────────────
async function tmdbFetch(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
    return resp.json();
}

// ── Render grid ───────────────────────────────────────────
function tmdbRenderGrid(items) {
    const grid = document.getElementById('tmdb-grid');
    if (!grid) return;

    if (!items.length) {
        grid.innerHTML = '<div class="tmdb-no-results">No results found.</div>';
        return;
    }

    // Filter out person results
    const filtered = items.filter(i => i.media_type !== 'person' && (i.poster_path || i.title || i.name));

    grid.innerHTML = filtered.map(item => {
        const title    = item.title || item.name || 'Unknown';
        const year     = (item.release_date || item.first_air_date || '').slice(0, 4);
        const rating   = item.vote_average ? item.vote_average.toFixed(1) : '';
        const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
        const poster   = item.poster_path
            ? `<img class="tmdb-card-poster" src="${TMDB_IMG_BASE}${item.poster_path}" alt="${escapeHtml(title)}" loading="lazy" />`
            : `<div class="tmdb-card-poster-placeholder">${mediaType === 'tv' ? '📺' : '🎬'}</div>`;

        return `<div class="tmdb-card" data-id="${item.id}" data-type="${escapeHtml(mediaType)}">
            ${poster}
            <div class="tmdb-card-body">
                <p class="tmdb-card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</p>
                <p class="tmdb-card-meta">
                    ${year ? `<span>${year}</span>` : ''}
                    ${rating ? `<span class="tmdb-rating">⭐ ${rating}</span>` : ''}
                </p>
            </div>
        </div>`;
    }).join('');
}

// ── Detail modal ──────────────────────────────────────────
async function tmdbOpenDetail(id, mediaType) {
    const modal = document.getElementById('tmdb-detail');
    const content = document.getElementById('tmdb-detail-content');
    if (!modal || !content) return;

    content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:80px 0;width:100%"><div class="tmdb-spinner"></div></div>`;
    modal.classList.add('open');

    try {
        const data = await tmdbFetch(`/api/tmdb/${mediaType}/${id}`);
        tmdbRenderDetail(data, mediaType);
    } catch (e) {
        content.innerHTML = '<div class="tmdb-no-results" style="width:100%">⚠️ Failed to load details.</div>';
    }
}

function tmdbRenderDetail(data, mediaType) {
    const content = document.getElementById('tmdb-detail-content');
    if (!content) return;

    const title    = data.title || data.name || 'Unknown';
    const year     = (data.release_date || data.first_air_date || '').slice(0, 4);
    const rating   = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
    const runtime  = data.runtime ? `${data.runtime} min` : (data.episode_run_time?.[0] ? `~${data.episode_run_time[0]} min/ep` : '');
    const overview = data.overview || 'No description available.';
    const tagline  = data.tagline || '';
    const genres   = (data.genres || []).map(g => `<span class="tmdb-genre-tag">${escapeHtml(g.name)}</span>`).join('');
    const cast     = (data.credits?.cast || []).slice(0, 6).map(c => escapeHtml(c.name)).join(', ');
    const director = (data.credits?.crew || []).find(c => c.job === 'Director');

    // Find trailer
    const trailerKey = findTrailerKey(data.videos?.results || []);

    const posterHtml = data.poster_path
        ? `<img src="${TMDB_IMG_ORIGINAL}${data.poster_path}" alt="${escapeHtml(title)}" style="width:100%;height:100%;object-fit:cover;display:block" />`
        : `<div class="tmdb-detail-poster-placeholder">${mediaType === 'tv' ? '📺' : '🎬'}</div>`;

    content.innerHTML = `
        <div class="tmdb-detail-poster">${posterHtml}</div>
        <div class="tmdb-detail-info">
            ${tagline ? `<p class="tmdb-detail-tagline">"${escapeHtml(tagline)}"</p>` : ''}
            <h2 class="tmdb-detail-title">${escapeHtml(title)}</h2>
            <div class="tmdb-detail-meta-row">
                <span class="tmdb-badge tmdb-badge-rating">⭐ ${rating}/10</span>
                ${year ? `<span class="tmdb-badge">${year}</span>` : ''}
                ${runtime ? `<span class="tmdb-badge">🕒 ${runtime}</span>` : ''}
                ${data.status ? `<span class="tmdb-badge">${escapeHtml(data.status)}</span>` : ''}
                ${mediaType === 'tv' && data.number_of_seasons ? `<span class="tmdb-badge">${data.number_of_seasons} Season${data.number_of_seasons > 1 ? 's' : ''}</span>` : ''}
            </div>
            ${genres ? `<div class="tmdb-genre-list">${genres}</div>` : ''}
            <p class="tmdb-detail-overview">${escapeHtml(overview)}</p>
            ${director ? `<div class="tmdb-cast-row"><strong>Director:</strong> ${escapeHtml(director.name)}</div>` : ''}
            ${cast ? `<div class="tmdb-cast-row"><strong>Cast:</strong> ${cast}</div>` : ''}
            ${trailerKey && /^[A-Za-z0-9_-]{6,20}$/.test(trailerKey)
                ? `<button class="tmdb-trailer-btn" data-trailer-key="${escapeHtml(trailerKey)}">
                    ▶ Watch Trailer
                </button>`
                : `<span style="font-size:0.85rem;color:var(--text-muted)">No trailer available</span>`
            }
        </div>`;

    // Attach trailer button listener after rendering (avoids inline onclick)
    const trailerBtn = content.querySelector('.tmdb-trailer-btn');
    if (trailerBtn) {
        trailerBtn.addEventListener('click', () => {
            tmdbPlayTrailer(trailerBtn.dataset.trailerKey);
        });
    }
}

function findTrailerKey(videos) {
    if (!videos.length) return null;
    const official = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official);
    const any      = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    const teaser   = videos.find(v => v.type === 'Teaser'  && v.site === 'YouTube');
    return (official || any || teaser)?.key || null;
}

function tmdbPlayTrailer(key) {
    const wrap = document.createElement('div');
    wrap.className = 'tmdb-trailer-iframe-wrap';
    wrap.innerHTML = `
        <iframe src="https://www.youtube.com/embed/${key}?autoplay=1&rel=0" allowfullscreen allow="autoplay"></iframe>
        <button class="tmdb-trailer-close-btn" onclick="this.parentElement.remove()">✕ Close Trailer</button>`;
    document.body.appendChild(wrap);
}

// ── Search ────────────────────────────────────────────────
function tmdbDoSearch() {
    const input = document.getElementById('tmdb-search-input');
    const query = input?.value.trim();
    if (!query) return;
    tmdbSearchQuery = query;

    // Show search tab
    const searchTab = document.getElementById('tmdb-search-tab');
    if (searchTab) searchTab.style.display = '';

    tmdbLoadTab('search');
}

// ── Escape helper ─────────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Close button
    document.getElementById('tmdb-close-btn')?.addEventListener('click', closeTmdbPanel);

    // Close detail modal
    document.getElementById('tmdb-detail-close')?.addEventListener('click', () => {
        document.getElementById('tmdb-detail')?.classList.remove('open');
    });
    document.getElementById('tmdb-detail')?.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('open');
    });

    // Card click via event delegation (avoids inline onclick on each card)
    document.getElementById('tmdb-grid')?.addEventListener('click', e => {
        const card = e.target.closest('.tmdb-card');
        if (!card) return;
        const id = parseInt(card.dataset.id, 10);
        const mediaType = card.dataset.type;
        if (id && (mediaType === 'movie' || mediaType === 'tv')) {
            tmdbOpenDetail(id, mediaType);
        }
    });

    // Tabs
    document.querySelectorAll('.tmdb-tab').forEach(btn => {
        btn.addEventListener('click', () => tmdbLoadTab(btn.dataset.tab));
    });

    // Search
    document.getElementById('tmdb-search-btn')?.addEventListener('click', tmdbDoSearch);
    document.getElementById('tmdb-search-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') tmdbDoSearch();
    });
});
