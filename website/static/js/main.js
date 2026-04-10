/* =========================================================
   TG Drive – main.js v3
   Grid/List view · Sort · Skeleton · Loading bar
   ========================================================= */

// ── Constants ─────────────────────────────────────────────
const SKELETON_TIMEOUT_MS = 12000;

const FILE_TYPE_EXTENSIONS = {
    image:   ['jpg','jpeg','png','gif','webp','bmp','svg','ico','avif','tiff'],
    video:   ['mp4','mkv','avi','mov','webm','ts','flv','wmv','ogv','m4v','3gp'],
    audio:   ['mp3','wav','flac','aac','ogg','m4a','opus','wma','alac'],
    pdf:     ['pdf'],
    archive: ['zip','rar','7z','tar','gz','bz2','xz','lz4','zst'],
    code:    ['js','ts','py','java','c','cpp','h','cs','go','rs','php','html','css',
              'json','xml','yaml','yml','sh','bash','sql','kt','swift','dart','rb',
              'lua','vue','jsx','tsx','scss','sass','less','r','m'],
    doc:     ['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','txt','rtf','csv','md'],
};

// ── State ────────────────────────────────────────────────
let currentDirectoryData = null;
let currentView      = localStorage.getItem('view')      || 'list';
let currentSortField = localStorage.getItem('sortField') || 'date';
let currentSortDir   = localStorage.getItem('sortDir')   || 'desc';

// ── Top Loading Bar ───────────────────────────────────────
let _loadTimer = null;

function startLoadingBar() {
    const bar = document.getElementById('top-progress-bar');
    if (!bar) return;
    if (_loadTimer) clearTimeout(_loadTimer);
    bar.style.transition = 'none';
    bar.style.opacity    = '1';
    bar.style.width      = '0%';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            bar.style.transition = 'width 0.2s ease';
            bar.style.width      = '8%';
            _loadTimer = setTimeout(() => {
                bar.style.transition = 'width 2.2s cubic-bezier(0.1, 0.5, 0.2, 1)';
                bar.style.width      = '72%';
            }, 220);
        });
    });
}

function finishLoadingBar() {
    const bar = document.getElementById('top-progress-bar');
    if (!bar) return;
    if (_loadTimer) { clearTimeout(_loadTimer); _loadTimer = null; }
    bar.style.transition = 'width 0.28s ease';
    bar.style.width      = '100%';
    setTimeout(() => {
        bar.style.transition = 'opacity 0.3s ease';
        bar.style.opacity    = '0';
        setTimeout(() => {
            bar.style.transition = 'none';
            bar.style.width      = '0%';
        }, 320);
    }, 350);
}

// ── Skeleton Loaders ─────────────────────────────────────
let _skelTimer = null;

function showSkeletons() {
    const skCont = document.getElementById('skeleton-container');
    const listV  = document.getElementById('list-view');
    const gridV  = document.getElementById('grid-view');
    if (!skCont) return;

    if (listV) listV.style.display = 'none';
    if (gridV) gridV.style.display = 'none';

    let html = '';
    if (currentView === 'grid') {
        html = '<div class="skeleton-grid">';
        for (let i = 0; i < 12; i++) {
            html += `<div class="sk-card">
                <div class="sk-thumb skeleton-pulse"></div>
                <div class="sk-card-name skeleton-pulse"></div>
                <div class="sk-card-meta skeleton-pulse"></div>
            </div>`;
        }
        html += '</div>';
    } else {
        html = '<div class="skeleton-list">';
        for (let i = 0; i < 9; i++) {
            html += `<div class="sk-row">
                <div class="sk-icon skeleton-pulse"></div>
                <div class="sk-name skeleton-pulse"></div>
                <div class="sk-size skeleton-pulse"></div>
                <div class="sk-date skeleton-pulse"></div>
                <div class="sk-btn skeleton-pulse"></div>
            </div>`;
        }
        html += '</div>';
    }

    skCont.innerHTML = html;
    skCont.style.display = 'block';
    if (_skelTimer) clearTimeout(_skelTimer);
    _skelTimer = setTimeout(hideSkeletons, SKELETON_TIMEOUT_MS);
}

function hideSkeletons() {
    if (_skelTimer) { clearTimeout(_skelTimer); _skelTimer = null; }
    const skCont = document.getElementById('skeleton-container');
    const listV  = document.getElementById('list-view');
    const gridV  = document.getElementById('grid-view');
    if (skCont) { skCont.innerHTML = ''; skCont.style.display = 'none'; }

    if (currentView === 'grid') {
        if (listV) listV.style.display = 'none';
        if (gridV) gridV.style.display = 'grid';
    } else {
        if (listV) listV.style.display = 'table';
        if (gridV) gridV.style.display = 'none';
    }
}

// ── File-type helpers ─────────────────────────────────────
function getFileType(name) {
    const ext = (name || '').toLowerCase().split('.').pop();
    for (const [type, exts] of Object.entries(FILE_TYPE_EXTENSIONS)) {
        if (exts.includes(ext)) return type;
    }
    return 'other';
}

const FILE_EMOJIS = {
    image:'🖼', video:'🎬', audio:'🎵', pdf:'📄',
    archive:'📦', code:'💻', doc:'📝', other:'📁'
};

function getFileEmoji(type) { return FILE_EMOJIS[type] || '📁'; }

// ── Sort helper ───────────────────────────────────────────
function getSortedItems(data) {
    const entries = Object.entries(data);
    const folders = entries.filter(([, v]) => v.type === 'folder');
    const files   = entries.filter(([, v]) => v.type === 'file');
    const dir     = currentSortDir === 'asc' ? 1 : -1;

    const cmp = (a, b) => {
        const A = a[1], B = b[1];
        switch (currentSortField) {
            case 'name':
                return A.name.toLowerCase().localeCompare(B.name.toLowerCase()) * dir;
            case 'date':
                return (new Date(A.upload_date) - new Date(B.upload_date)) * dir;
            case 'size':
                return ((A.size || 0) - (B.size || 0)) * dir;
            default: return 0;
        }
    };

    folders.sort(cmp);
    files.sort(cmp);
    return [...folders, ...files];
}

// ── Date formatter ────────────────────────────────────────
function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return dateStr; }
}

// ── More-options HTML builder ─────────────────────────────
function buildMoreOptionsHtml(item, isTrash) {
    const base = `<div data-path="${item.path}" id="more-option-${item.id}" data-name="${item.name}" class="more-options"><input class="more-options-focus" readonly style="height:0;width:0;border:none;position:absolute">`;
    if (isTrash) {
        return base +
            `<div id="restore-${item.id}" data-path="${item.path}"><img src="static/assets/load-icon.svg"> Restore</div><hr>` +
            `<div id="delete-${item.id}" data-path="${item.path}"><img src="static/assets/trash-icon.svg"> Delete</div></div>`;
    }
    if (item.type === 'folder') {
        return base +
            `<div id="rename-${item.id}"><img src="static/assets/pencil-icon.svg"> Rename</div><hr>` +
            `<div id="trash-${item.id}"><img src="static/assets/trash-icon.svg"> Trash</div><hr>` +
            `<div id="folder-share-${item.id}"><img src="static/assets/share-icon.svg"> Share</div></div>`;
    }
    return base +
        `<div id="rename-${item.id}"><img src="static/assets/pencil-icon.svg"> Rename</div><hr>` +
        `<div id="trash-${item.id}"><img src="static/assets/trash-icon.svg"> Trash</div><hr>` +
        `<div id="share-${item.id}"><img src="static/assets/share-icon.svg"> Share</div></div>`;
}

// ── Render: List View ─────────────────────────────────────
function renderListView(sorted, isTrash) {
    const listV = document.getElementById('list-view');
    const gridV = document.getElementById('grid-view');
    if (listV) listV.style.display = 'table';
    if (gridV) gridV.style.display = 'none';

    let html = '';
    for (const [, item] of sorted) {
        if (item.type === 'folder') {
            html += `<tr data-path="${item.path}" data-id="${item.id}" class="body-tr folder-tr">
                <td><div class="td-align"><img src="static/assets/folder-solid-icon.svg" class="item-icon">${item.name}</div></td>
                <td><div class="td-align">—</div></td>
                <td class="date-col"><div class="td-align date-text">${formatDate(item.upload_date)}</div></td>
                <td><div class="td-align"><button data-id="${item.id}" class="more-btn"><img src="static/assets/more-icon.svg" class="rotate-90"></button></div></td>
            </tr>`;
        } else {
            const size     = convertBytes(item.size);
            const fileType = getFileType(item.name);
            html += `<tr data-path="${item.path}" data-id="${item.id}" data-name="${item.name}" class="body-tr file-tr">
                <td><div class="td-align"><img src="static/assets/file-icon.svg" class="item-icon file-icon-img type-${fileType}">${item.name}</div></td>
                <td><div class="td-align">${size}</div></td>
                <td class="date-col"><div class="td-align date-text">${formatDate(item.upload_date)}</div></td>
                <td><div class="td-align"><button data-id="${item.id}" class="more-btn"><img src="static/assets/more-icon.svg" class="rotate-90"></button></div></td>
            </tr>`;
        }
    }
    document.getElementById('directory-data').innerHTML = html;
}

// ── Render: Grid View ─────────────────────────────────────
function renderGridView(sorted, isTrash) {
    const listV = document.getElementById('list-view');
    const gridV = document.getElementById('grid-view');
    if (listV) listV.style.display = 'none';
    if (gridV) gridV.style.display = 'grid';

    let html = '';
    for (const [, item] of sorted) {
        if (item.type === 'folder') {
            html += `<div class="grid-card folder-card" data-path="${item.path}" data-id="${item.id}" data-name="${item.name}">
                <div class="card-thumb folder-thumb">
                    <img src="static/assets/folder-solid-icon.svg" class="card-icon-img" />
                </div>
                <div class="card-body">
                    <p class="card-name" title="${item.name}">${item.name}</p>
                    <p class="card-meta">${formatDate(item.upload_date)}</p>
                </div>
                <button class="more-btn card-more-btn" data-id="${item.id}">
                    <img src="static/assets/more-icon.svg" class="rotate-90">
                </button>
            </div>`;
        } else {
            const size     = convertBytes(item.size);
            const fileType = getFileType(item.name);
            const emoji    = getFileEmoji(fileType);
            const ext      = (item.name.split('.').pop() || '').toUpperCase().slice(0, 6);
            html += `<div class="grid-card file-card" data-path="${item.path}" data-id="${item.id}" data-name="${item.name}">
                <div class="card-thumb file-thumb type-${fileType}">
                    <span class="card-file-emoji">${emoji}</span>
                    <span class="card-ext">${ext}</span>
                </div>
                <div class="card-body">
                    <p class="card-name" title="${item.name}">${item.name}</p>
                    <p class="card-meta">${size} · ${formatDate(item.upload_date)}</p>
                </div>
                <button class="more-btn card-more-btn" data-id="${item.id}">
                    <img src="static/assets/more-icon.svg" class="rotate-90">
                </button>
            </div>`;
        }
    }
    if (gridV) gridV.innerHTML = html;
}

// ── Attach event listeners ────────────────────────────────
function attachEventListeners(isTrash) {
    if (!isTrash) {
        document.querySelectorAll('.folder-tr, .folder-card').forEach(el => {
            el.ondblclick = openFolder;
        });
        document.querySelectorAll('.file-tr, .file-card').forEach(el => {
            el.ondblclick = openFile;
        });
    }

    document.querySelectorAll('.more-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openMoreButton(btn);
        });
    });
}

// ── Main renderDirectory ──────────────────────────────────
function renderDirectory() {
    if (!currentDirectoryData) return;
    const data    = currentDirectoryData['contents'];
    const isTrash = getCurrentPath().startsWith('/trash');
    const sorted  = getSortedItems(data);

    // Clear more-options portal
    const portal = document.getElementById('more-options-portal');
    if (portal) {
        let moreHtml = '';
        for (const [, item] of sorted) {
            moreHtml += buildMoreOptionsHtml(item, isTrash);
        }
        portal.innerHTML = moreHtml;
    }

    if (currentView === 'grid') {
        renderGridView(sorted, isTrash);
    } else {
        renderListView(sorted, isTrash);
    }

    attachEventListeners(isTrash);
    updateToolbarUI();
}

// ── showDirectory – called by apiHandler.js ───────────────
function showDirectory(data) {
    currentDirectoryData = data;
    finishLoadingBar();
    hideSkeletons();
    renderDirectory();
}

// ── Update toolbar UI ─────────────────────────────────────
function updateToolbarUI() {
    const fieldSel = document.getElementById('sort-field');
    const dirBtn   = document.getElementById('sort-dir-btn');
    const listBtn  = document.getElementById('list-view-btn');
    const gridBtn  = document.getElementById('grid-view-btn');

    if (fieldSel) fieldSel.value = currentSortField;
    if (dirBtn) {
        dirBtn.classList.toggle('sort-desc', currentSortDir === 'desc');
        dirBtn.title = currentSortDir === 'asc' ? 'Ascending' : 'Descending';
    }
    if (listBtn) listBtn.classList.toggle('active', currentView === 'list');
    if (gridBtn) gridBtn.classList.toggle('active', currentView === 'grid');
}

// ── Search ────────────────────────────────────────────────
document.getElementById('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const query = document.getElementById('file-search').value.trim();
    if (!query) { alert('Search field is empty'); return; }
    window.location = '/?path=/search_' + encodeURI(query);
});

// ── DOMContentLoaded ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    // Input validation listeners
    ['new-folder-name', 'rename-name', 'file-search'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', validateInput);
    });

    // Restore sort/view state
    currentView      = localStorage.getItem('view')      || 'list';
    currentSortField = localStorage.getItem('sortField') || 'date';
    currentSortDir   = localStorage.getItem('sortDir')   || 'desc';
    updateToolbarUI();

    // ── Load directory ──
    if (getCurrentPath().includes('/share_')) {
        showSkeletons();
        startLoadingBar();
        getCurrentDirectory();
    } else if (getPassword() === null) {
        document.getElementById('bg-blur').style.zIndex   = '2';
        document.getElementById('bg-blur').style.opacity  = '0.1';
        document.getElementById('get-password').style.zIndex  = '3';
        document.getElementById('get-password').style.opacity = '1';
    } else {
        showSkeletons();
        startLoadingBar();
        getCurrentDirectory();
    }

    // ── Theme toggle ──
    const themeBtn  = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon');
    const body      = document.body;

    function applyThemeIcon(isDark) {
        if (!themeIcon) return;
        themeIcon.setAttribute('viewBox', '0 0 24 24');
        if (isDark) {
            themeIcon.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>';
        } else {
            themeIcon.innerHTML = '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>';
        }
    }

    if (localStorage.getItem('theme') === 'dark') {
        body.classList.add('dark-mode');
        applyThemeIcon(true);
    }

    themeBtn?.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        const isDark = body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        applyThemeIcon(isDark);
    });

    // ── Sidebar toggle (desktop collapse + mobile overlay) ──
    const sidebarEl  = document.getElementById('sidebar');
    const overlayEl  = document.getElementById('mobile-overlay');
    const containerEl = document.querySelector('.container');
    const toggleBtn  = document.getElementById('sidebar-toggle-btn');

    if (localStorage.getItem('sidebar') === 'collapsed') {
        containerEl?.classList.add('sidebar-collapsed');
    }

    toggleBtn?.addEventListener('click', e => {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            sidebarEl?.classList.toggle('active');
            overlayEl?.classList.toggle('active');
        } else {
            containerEl?.classList.toggle('sidebar-collapsed');
            const collapsed = containerEl?.classList.contains('sidebar-collapsed');
            localStorage.setItem('sidebar', collapsed ? 'collapsed' : 'expanded');
        }
    });

    overlayEl?.addEventListener('click', () => {
        sidebarEl?.classList.remove('active');
        overlayEl?.classList.remove('active');
    });

    document.querySelectorAll('.sidebar-menu a').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebarEl?.classList.remove('active');
                overlayEl?.classList.remove('active');
            }
        });
    });

    // ── FAB button ──
    document.getElementById('fab-btn')?.addEventListener('click', () => {
        document.getElementById('new-button')?.click();
    });

    // ── Sort controls ──
    const sortFieldSel = document.getElementById('sort-field');
    const sortDirBtn   = document.getElementById('sort-dir-btn');

    sortFieldSel?.addEventListener('change', () => {
        currentSortField = sortFieldSel.value;
        localStorage.setItem('sortField', currentSortField);
        if (currentDirectoryData) renderDirectory();
    });

    sortDirBtn?.addEventListener('click', () => {
        currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
        localStorage.setItem('sortDir', currentSortDir);
        if (currentDirectoryData) renderDirectory();
        updateToolbarUI();
    });

    // ── View toggle ──
    document.getElementById('list-view-btn')?.addEventListener('click', () => {
        if (currentView === 'list') return;
        currentView = 'list';
        localStorage.setItem('view', 'list');
        if (currentDirectoryData) renderDirectory();
        else updateToolbarUI();
    });

    document.getElementById('grid-view-btn')?.addEventListener('click', () => {
        if (currentView === 'grid') return;
        currentView = 'grid';
        localStorage.setItem('view', 'grid');
        if (currentDirectoryData) renderDirectory();
        else updateToolbarUI();
    });
});
