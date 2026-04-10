function getCurrentPath() {
    const url = new URL(window.location.href);
    const path = url.searchParams.get('path')
    if (path === null) {
        window.location.href = '/?path=/'
        return 'redirect'
    }
    return path
}

function getFolderAuthFromPath() {
    const url = new URL(window.location.href);
    const auth = url.searchParams.get('auth')
    return auth
}

// Changing sidebar section class
if (getCurrentPath() !== '/') {
    const sections = document.querySelector('.sidebar-menu').getElementsByTagName('a')
    sections[0].setAttribute('class', 'unselected-item')

    if (getCurrentPath().includes('/trash')) {
        sections[1].setAttribute('class', 'selected-item')
    }
}

function convertBytes(bytes) {
    const kilobyte = 1024;
    const megabyte = kilobyte * 1024;
    const gigabyte = megabyte * 1024;

    if (bytes >= gigabyte) {
        return (bytes / gigabyte).toFixed(2) + ' GB';
    } else if (bytes >= megabyte) {
        return (bytes / megabyte).toFixed(2) + ' MB';
    } else if (bytes >= kilobyte) {
        return (bytes / kilobyte).toFixed(2) + ' KB';
    } else {
        return bytes + ' bytes';
    }
}

const INPUTS = {}

function validateInput(event) {
    console.log('Validating Input')
    const pattern = /^[a-zA-Z0-9 \-_\\[\]()@#!$%*+={}:;<>,.?/|\\~`]*$/;;
    const input = event.target;
    if (!pattern.test(input.value)) {
        input.value = INPUTS[input.id]
    } else {
        INPUTS[input.id] = input.value
    }
}

function getRootUrl() {
    const url = new URL(window.location.href);
    const protocol = url.protocol; // Get the protocol, e.g., "https:"
    const hostname = url.hostname; // Get the hostname, e.g., "sub.example.com" or "192.168.1.1"
    const port = url.port; // Get the port, e.g., "8080"

    const rootUrl = `${protocol}//${hostname}${port ? ':' + port : ''}`;

    return rootUrl;
}

function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
            alert('Link copied to clipboard!');
        }).catch(function (err) {
            console.error('Could not copy text: ', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            alert('Link copied to clipboard!');
        } else {
            alert('Failed to copy the link.');
        }
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
}

function getPassword() {
    return localStorage.getItem('password')
}

function getRandomId() {
    const length = 6;
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function removeSlash(text) {
    let charactersToRemove = "[/]+"; // Define the characters to remove inside square brackets
    let trimmedStr = text.replace(new RegExp(`^${charactersToRemove}|${charactersToRemove}$`, 'g'), '');
    return trimmedStr;
}

// ── Refresh Thumbnails Modal ────────────────────────────────────────────────

const REFRESH_THUMB_POLL_INTERVAL_MS = 2000;

function openRefreshThumbnailsModal() {
    document.getElementById('refresh-thumb-progress-wrap').style.display = 'none';
    document.getElementById('refresh-thumb-start').disabled = false;
    document.getElementById('refresh-thumb-start').innerText = 'Start';
    document.getElementById('refresh-thumb-bar').style.width = '0%';
    document.getElementById('bg-blur').style.zIndex = '2';
    document.getElementById('bg-blur').style.opacity = '0.1';
    document.getElementById('refresh-thumbnails-modal').style.zIndex = '3';
    document.getElementById('refresh-thumbnails-modal').style.opacity = '1';
}

function closeRefreshThumbnailsModal() {
    document.getElementById('bg-blur').style.opacity = '0';
    setTimeout(() => { document.getElementById('bg-blur').style.zIndex = '-1'; }, 300);
    document.getElementById('refresh-thumbnails-modal').style.opacity = '0';
    setTimeout(() => { document.getElementById('refresh-thumbnails-modal').style.zIndex = '-1'; }, 300);
}

document.getElementById('refresh-thumb-cancel').addEventListener('click', closeRefreshThumbnailsModal);

document.getElementById('refresh-thumb-start').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-thumb-start');
    btn.disabled = true;
    btn.innerText = 'Running…';
    document.getElementById('refresh-thumb-progress-wrap').style.display = 'block';
    document.getElementById('refresh-thumb-status').innerText = 'Status: Starting…';
    document.getElementById('refresh-thumb-count').innerText = '0 / 0 processed';

    try {
        const resp = await postJson('/api/refreshThumbnails', {});
        if (resp.status === 'Invalid password') {
            alert('Invalid password. Please log in as admin first.');
            btn.disabled = false;
            btn.innerText = 'Start';
            return;
        }
        if (resp.status !== 'ok' && resp.status !== 'already_running') {
            alert('Error: ' + resp.status);
            btn.disabled = false;
            btn.innerText = 'Start';
            return;
        }
    } catch (e) {
        alert('Failed to start refresh: ' + e);
        btn.disabled = false;
        btn.innerText = 'Start';
        return;
    }

    // Poll progress
    const interval = setInterval(async () => {
        try {
            const resp = await fetch('/api/refreshThumbnailsProgress');
            const json = await resp.json();
            const p = json.progress;
            const total = p.total || 0;
            const processed = p.processed || 0;
            const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
            document.getElementById('refresh-thumb-bar').style.width = pct + '%';
            document.getElementById('refresh-thumb-count').innerText =
                `${processed} / ${total} processed (${p.succeeded || 0} ✓, ${p.failed || 0} ✗)`;

            if (p.status === 'running') {
                document.getElementById('refresh-thumb-status').innerText = 'Status: Running…';
            } else if (p.status === 'completed') {
                clearInterval(interval);
                document.getElementById('refresh-thumb-status').innerText = 'Status: Completed ✅';
                document.getElementById('refresh-thumb-bar').style.width = '100%';
                btn.innerText = 'Done';
            } else if (p.status === 'failed') {
                clearInterval(interval);
                document.getElementById('refresh-thumb-status').innerText = 'Status: Failed ❌';
                btn.disabled = false;
                btn.innerText = 'Retry';
            } else {
                document.getElementById('refresh-thumb-status').innerText = 'Status: ' + p.status;
            }
        } catch (e) {
            console.error('Error polling thumbnail refresh progress:', e);
        }
    }, REFRESH_THUMB_POLL_INTERVAL_MS);
});