/* Telegram shell for PvZ-Portable 0.2.6 with a native viewport/input bridge. */
'use strict';

(() => {
    const cacheStatus = document.getElementById('cache-status');
    const retryButton = document.getElementById('bundle-retry-btn');
    const bundleProgress = document.getElementById('bundle-progress');
    const bundleProgressLabel = document.getElementById('bundle-progress-label');
    const canvas = document.getElementById('canvas');
    const gameContainer = document.getElementById('canvas-container');
    const gameStage = document.getElementById('game-stage');
    const gameOptions = document.getElementById('game-options');
    const gameOptionsButton = document.getElementById('game-options-btn');
    const gameOptionsDismiss = document.getElementById('game-options-dismiss');
    const fullscreenButton = document.getElementById('fullscreen-btn');
    const gameStatus = document.getElementById('game-save-status');
    const storageStatus = document.getElementById('save-storage-status');
    const resumeOverlay = document.getElementById('resume-overlay');
    const telegram = window.Telegram && window.Telegram.WebApp;
    const inTelegram = !!(telegram && telegram.initData);
    const maxResourceBytes = 256 * 1024 * 1024;
    let cacheDbPromise;
    let restorePromise;
    let restoring = true;
    let resourceBusy = false;
    let launching = false;
    let mainLoopActive = false;
    let lifecyclePaused = false;
    let cacheChain = Promise.resolve();
    let bundleLoadInFlight = false;
    let bundleAttempt = 0;
    let viewportFrame = 0;
    let bundleState = {phase: 'loading', revision: null, cacheHit: false, downloadedBytes: 0, totalBytes: 0};

    function status(message, error = false) {
        cacheStatus.textContent = message;
        cacheStatus.classList.toggle('error', error);
    }

    function supported(version) {
        return inTelegram && typeof telegram.isVersionAtLeast === 'function' && telegram.isVersionAtLeast(version);
    }

    function setViewportProperty(name, value) {
        const style = document.documentElement.style;
        const pixels = Math.round(value * 100) / 100 + 'px';
        if (style.getPropertyValue(name) !== pixels) style.setProperty(name, pixels);
    }

    function isFullscreen() {
        return supported('8.0') ? !!telegram.isFullscreen : !!document.fullscreenElement;
    }

    function applyViewport() {
        viewportFrame = 0;
        const viewport = window.visualViewport;
        const width = Math.max(1, viewport ? viewport.width : window.innerWidth);
        const visibleHeight = Math.max(1, viewport ? viewport.height : window.innerHeight);
        const height = inTelegram && telegram.viewportHeight > 0
            ? Math.min(visibleHeight, telegram.viewportHeight) : visibleHeight;
        setViewportProperty('--app-width', width);
        setViewportProperty('--app-height', height);
        setViewportProperty('--app-left', viewport ? viewport.offsetLeft : 0);
        setViewportProperty('--app-top', viewport ? viewport.offsetTop : 0);
        const nativeSafe = inTelegram ? telegram.safeAreaInset || {} : {};
        const contentSafe = inTelegram ? telegram.contentSafeAreaInset || {} : {};
        for (const side of ['top', 'right', 'bottom', 'left']) {
            const inset = Math.max(0, nativeSafe[side] || 0) + Math.max(0, contentSafe[side] || 0);
            setViewportProperty('--tg-safe-' + side, inset);
        }
        gameContainer.classList.toggle('game-landscape', width > height);
        const full = isFullscreen();
        fullscreenButton.setAttribute('aria-label', full ? 'выйти из полного экрана' : 'на весь экран');
        fullscreenButton.setAttribute('aria-pressed', String(full));
        fullscreenButton.title = full ? 'выйти из полного экрана' : 'на весь экран';
        document.getElementById('fullscreen-label').textContent = full ? 'выйти из полного экрана' : 'на весь экран';
        if (gameStarted) resizeCanvas();
    }

    function updateViewport() {
        if (!viewportFrame) viewportFrame = requestAnimationFrame(applyViewport);
    }

    function setOptionsOpen(open, restoreFocus = false, holdDismiss = false) {
        gameOptions.hidden = !open;
        gameOptionsDismiss.hidden = !open && !holdDismiss;
        gameOptionsButton.setAttribute('aria-expanded', String(open));
        if (open) document.getElementById('game-options-close').focus({preventScroll: true});
        else if (restoreFocus) gameOptionsButton.focus({preventScroll: true});
    }

    function absorbDrawerTap(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === 'pointerdown' || event.type === 'mousedown' || event.type === 'touchstart') {
            // Keep the transparent shield through release/click, so dismissing
            // the drawer cannot deliver half a gesture to the native game.
            setOptionsOpen(false, false, true);
            if (event.type === 'pointerdown' && gameOptionsDismiss.setPointerCapture) {
                gameOptionsDismiss.setPointerCapture(event.pointerId);
            }
        } else if (/up$|end$|cancel$|^click$/.test(event.type)) {
            requestAnimationFrame(() => {
                if (gameOptions.hidden) gameOptionsDismiss.hidden = true;
            });
        }
    }

    function keyEscape() {
        if (!gameOptions.hidden) { setOptionsOpen(false, true); return; }
        if (!gameStarted || lifecyclePaused) return;
        canvas.focus({preventScroll: true});
        const options = {key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true};
        canvas.dispatchEvent(new KeyboardEvent('keydown', options));
        canvas.dispatchEvent(new KeyboardEvent('keyup', options));
    }

    function renderSaveStatus(state = saveStorageState) {
        const descriptions = {
            idle: '',
            restoring: 'чтение сохранений…',
            restored: state.fileCount ? 'сохранения восстановлены' : 'пока нет сохранений',
            writing: 'запись файлов сохранений…',
            persisted: state.fileCount ? 'файлы сохранений записаны' : 'пока нет сохранений',
            error: 'ошибка записи: экспортируй сохранения'
        };
        const text = descriptions[state.phase] || '';
        gameStatus.textContent = text;
        gameStatus.classList.toggle('error', state.phase === 'error');
        gameOptionsButton.classList.toggle('has-error', state.phase === 'error');
        storageStatus.textContent = state.phase === 'error'
            ? 'хранилище сохранений недоступно: ' + state.error + '. экспортируй архив перед закрытием.'
            : text;
        storageStatus.classList.toggle('error', state.phase === 'error');
        gameStatus.title = state.phase === 'error' ? state.error : 'для сохранения текущего уровня: меню → главное меню';
    }

    function suspendForVisibility() {
        if (!gameStarted || !mainLoopActive || lifecyclePaused || typeof Module.pauseMainLoop !== 'function') return;
        if (window.PvzWide && typeof window.PvzWide.cancelPointer === 'function') window.PvzWide.cancelPointer();
        // This suspends Emscripten's scheduler, not a toggle in the native game UI.
        Module.pauseMainLoop();
        lifecyclePaused = true;
        resumeOverlay.hidden = false;
        console.info('[PvZ lifecycle] main loop suspended');
    }

    function resumeFromVisibility() {
        if (!lifecyclePaused || !gameStarted || document.visibilityState === 'hidden' || (supported('8.0') && telegram.isActive === false)) return;
        updateViewport();
        Module.resumeMainLoop();
        lifecyclePaused = false;
        resumeOverlay.hidden = true;
        canvas.focus({preventScroll: true});
        console.info('[PvZ lifecycle] main loop resumed');
    }

    async function fullscreen() {
        try {
            if (supported('8.0') && typeof telegram.requestFullscreen === 'function') {
                if (telegram.isFullscreen && typeof telegram.exitFullscreen === 'function') {
                    telegram.exitFullscreen();
                    if (typeof telegram.unlockOrientation === 'function') telegram.unlockOrientation();
                } else {
                    telegram.requestFullscreen();
                    if (gameContainer.classList.contains('game-landscape') && typeof telegram.lockOrientation === 'function') telegram.lockOrientation();
                }
            } else if (document.fullscreenElement) {
                await document.exitFullscreen();
                if (screen.orientation && typeof screen.orientation.unlock === 'function') screen.orientation.unlock();
            } else if (gameContainer.requestFullscreen) {
                await gameContainer.requestFullscreen();
                if (screen.orientation && typeof screen.orientation.lock === 'function') {
                    try { await screen.orientation.lock('landscape'); } catch (_) { /* Optional on phones. */ }
                }
            } else {
                gameStatus.textContent = 'поверни телефон горизонтально';
            }
        } catch (error) {
            gameStatus.textContent = 'полный экран недоступен';
            console.info('Fullscreen request declined:', error);
        }
        updateViewport();
    }

    function openCache() {
        if (cacheDbPromise) return cacheDbPromise;
        cacheDbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
            const request = indexedDB.open('pvz-telegram-resources', 2);
            let finished = false;
            const fail = error => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                cacheDbPromise = null;
                reject(error);
            };
            const timer = setTimeout(() => fail(new Error('Storage did not respond')), 5000);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('resources')) db.createObjectStore('resources', {keyPath: 'path'});
                if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata');
            };
            request.onsuccess = () => {
                if (finished) { request.result.close(); return; }
                finished = true;
                clearTimeout(timer);
                request.result.onversionchange = () => { request.result.close(); cacheDbPromise = null; };
                resolve(request.result);
            };
            request.onerror = () => fail(request.error);
            request.onblocked = () => fail(new Error('Storage blocked by another tab'));
        });
        return cacheDbPromise;
    }

    async function readResources() {
        const db = await openCache();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['resources', 'metadata'], 'readonly');
            const files = tx.objectStore('resources').getAll();
            const metadata = tx.objectStore('metadata').get('bundle');
            tx.oncomplete = () => resolve({records: files.result, metadata: metadata.result});
            tx.onerror = () => reject(tx.error || new Error('Resource read failed'));
            tx.onabort = () => reject(tx.error || new Error('Resource read aborted'));
        });
    }

    async function sha256(data) {
        if (!globalThis.crypto || !crypto.subtle) throw new Error('проверка загрузки требует https');
        const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function writeResources(entries, manifest) {
        // Hash before opening the transaction: no awaits inside an IndexedDB write.
        const records = [];
        for (const [path, blob] of entries) records.push({path, blob, sha256: await sha256(blob)});
        const db = await openCache();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['resources', 'metadata'], 'readwrite');
            const store = tx.objectStore('resources');
            store.clear();
            for (const record of records) store.put(record);
            const metadata = tx.objectStore('metadata');
            if (manifest) metadata.put({revision: manifest.revision, archiveSha256: manifest.archiveSha256, fileCount: records.length, totalBytes: records.reduce((sum, item) => sum + item.blob.size, 0)}, 'bundle');
            else metadata.delete('bundle');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error('Resource write failed'));
            tx.onabort = () => reject(tx.error || new Error('Resource write aborted'));
        });
    }

    function resourceSetValid(entries) {
        return entries.has('main.pak') && [...entries.keys()].some(path => path.startsWith('properties/'));
    }

    async function restoreMatchingBundle(manifest) {
        const {records, metadata} = await readResources();
        if (!metadata || metadata.revision !== manifest.revision || metadata.archiveSha256 !== manifest.archiveSha256 || metadata.fileCount !== records.length) return false;
        const recovered = new Map();
        let totalBytes = 0;
        for (const record of records) {
            if (normalizeResourcePath(record.path) !== record.path || !(record.blob instanceof Blob) || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) return false;
            if (record.sha256 !== await sha256(record.blob)) return false;
            recovered.set(record.path, record.blob);
            totalBytes += record.blob.size;
        }
        if (!resourceSetValid(recovered) || totalBytes !== metadata.totalBytes) return false;
        collectedFiles.clear();
        for (const [path, blob] of recovered) collectedFiles.set(path, blob);
        return true;
    }

    function validateManifest(manifest, manifestUrl) {
        const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
        if (!manifest || manifest.version !== 1 || !hash(manifest.revision) || !hash(manifest.archiveSha256) || manifest.revision !== manifest.archiveSha256) throw new Error('неверная версия игровых файлов');
        if (!Number.isSafeInteger(manifest.archiveBytes) || manifest.archiveBytes < 1 || manifest.archiveBytes > maxResourceBytes) throw new Error('неверный размер игровых файлов');
        if (!Array.isArray(manifest.chunks) || !manifest.chunks.length || manifest.chunks.length > 256) throw new Error('неверный список частей игры');
        const seen = new Set();
        let total = 0;
        for (const chunk of manifest.chunks) {
            if (!chunk || typeof chunk.url !== 'string' || !/^[a-zA-Z0-9._/-]+$/.test(chunk.url) || chunk.url.startsWith('/') || chunk.url.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('неверный путь игровых файлов');
            const url = new URL(chunk.url, manifestUrl);
            if (url.origin !== location.origin || !url.pathname.startsWith(new URL('.', manifestUrl).pathname) || seen.has(url.href)) throw new Error('неверный адрес игровых файлов');
            if (!Number.isSafeInteger(chunk.bytes) || chunk.bytes < 1 || !hash(chunk.sha256)) throw new Error('неверное описание части игры');
            seen.add(url.href);
            total += chunk.bytes;
        }
        if (total !== manifest.archiveBytes) throw new Error('размер частей игры не совпадает');
        return manifest;
    }

    async function downloadBundle(manifest, manifestUrl, reloadCache = false) {
        const received = manifest.chunks.map(() => 0);
        const parts = new Array(manifest.chunks.length);
        let nextIndex = 0;
        const controller = new AbortController();
        const updateProgress = () => {
            bundleState.downloadedBytes = received.reduce((sum, count) => sum + count, 0);
            bundleProgress.max = manifest.archiveBytes;
            bundleProgress.value = bundleState.downloadedBytes;
            bundleProgressLabel.textContent = (bundleState.downloadedBytes / 1048576).toFixed(1) + ' / ' + (manifest.archiveBytes / 1048576).toFixed(1) + ' мб';
        };
        updateProgress();
        const worker = async () => {
            while (nextIndex < manifest.chunks.length) {
                const index = nextIndex++;
                const chunk = manifest.chunks[index];
                const url = new URL(chunk.url, manifestUrl);
                url.searchParams.set('v', manifest.revision);
                const response = await fetch(url, {signal: controller.signal, cache: reloadCache ? 'reload' : 'force-cache', redirect: 'error'});
                if (!response.ok) throw new Error('загрузка части ' + (index + 1) + ': http ' + response.status);
                const bytes = new Uint8Array(chunk.bytes);
                let offset = 0;
                if (response.body && response.body.getReader) {
                    const reader = response.body.getReader();
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        if (offset + value.length > bytes.length) { await reader.cancel(); throw new Error('неверный размер части игры'); }
                        bytes.set(value, offset);
                        offset += value.length;
                        received[index] = offset;
                        updateProgress();
                    }
                } else {
                    const data = new Uint8Array(await response.arrayBuffer());
                    if (data.length !== bytes.length) throw new Error('неверный размер части игры');
                    bytes.set(data);
                    offset = data.length;
                    received[index] = offset;
                    updateProgress();
                }
                if (offset !== chunk.bytes || await sha256(bytes) !== chunk.sha256) throw new Error('часть игры повреждена; повтори загрузку');
                parts[index] = bytes;
            }
        };
        try { await Promise.all([worker(), worker()]); }
        catch (error) { controller.abort(); throw error; }
        status('проверка игровых файлов…');
        const archive = new Blob(parts, {type: 'application/zip'});
        parts.length = 0;
        if (archive.size !== manifest.archiveBytes || await sha256(archive) !== manifest.archiveSha256) throw new Error('архив игры повреждён; повтори загрузку');
        return archive;
    }

    async function loadBundledResources() {
        if (bundleLoadInFlight || gameStarted) return;
        bundleLoadInFlight = true;
        bundleAttempt++;
        restoring = true;
        bundleState = {phase: 'loading', revision: null, cacheHit: false, downloadedBytes: 0, totalBytes: 0};
        retryButton.hidden = true;
        retryButton.disabled = true;
        dropZone.classList.remove('bundle-error');
        bundleProgress.removeAttribute('value');
        bundleProgressLabel.textContent = 'подготовка…';
        refreshUI();
        let cacheWarning = false;
        try {
            if (!globalThis.crypto || !crypto.subtle) throw new Error('для запуска игры нужен https');
            status('подготовка игры…');
            const manifestUrl = new URL('game-data/manifest.json', document.baseURI);
            const response = await fetch(manifestUrl, {cache: 'no-cache', redirect: 'error'});
            if (!response.ok) throw new Error('игровые файлы недоступны: http ' + response.status);
            const manifest = validateManifest(await response.json(), manifestUrl);
            bundleState.revision = manifest.revision;
            bundleState.totalBytes = manifest.archiveBytes;
            status('проверка игры на устройстве…');
            try { bundleState.cacheHit = await restoreMatchingBundle(manifest); }
            catch (error) { console.warn('[PvZ resources] cache read unavailable', error); }
            if (!bundleState.cacheHit) {
                status('загрузка игры…');
                const archive = await downloadBundle(manifest, manifestUrl, bundleAttempt > 1);
                status('подготовка игровых файлов…');
                // Internal bootstrap skips waiting on its own restore promise.
                await importResourceZip(archive, browseZipBtn, {bootstrap: true});
                status('сохранение игры на устройстве…');
                cacheChain = writeResources(new Map(collectedFiles), manifest);
                try { await cacheChain; }
                catch (error) { cacheWarning = true; console.warn('[PvZ resources] cache write unavailable', error); }
            }
            bundleState.phase = 'ready';
            status(cacheWarning ? 'игра готова · при следующем запуске файлы загрузятся заново' : 'всё готово · нажми «играть»');
            console.info('[PvZ resources] bundle ready', {revision: manifest.revision, cacheHit: bundleState.cacheHit, fileCount: collectedFiles.size});
        } catch (error) {
            bundleState.phase = 'error';
            status('не удалось подготовить игру: ' + error.message, true);
            retryButton.hidden = false;
            dropZone.classList.add('bundle-error');
            console.error('[PvZ resources] preparation failed', error);
        } finally {
            restoring = false;
            bundleLoadInFlight = false;
            retryButton.disabled = false;
            refreshUI();
        }
    }

    const baseRefresh = refreshUI;
    refreshUI = function() {
        baseRefresh();
        const ready = bundleState.phase === 'ready' && !restoring && !bundleLoadInFlight && resourceSetValid(collectedFiles);
        dropZone.classList.toggle('ready', ready);
        dropZone.classList.toggle('preparing', bundleState.phase === 'loading');
        if (!ready) {
            dropZone.removeAttribute('tabindex');
            dropZone.removeAttribute('role');
            dropZone.removeAttribute('aria-label');
        } else dropZone.setAttribute('aria-label', 'играть');
    };

    // Replace only the import transport. The engine receives the same original bytes.
    importResourceZip = async function(file, button = browseZipBtn, options = {}) {
        if (restoring && !options.bootstrap) await restorePromise;
        if (resourceBusy || gameStarted) throw new Error('импорт сейчас недоступен');
        if (file.size > maxResourceBytes) throw new Error('архив больше 256 мб');
        resourceBusy = true;
        const label = button.innerHTML;
        button.disabled = true;
        button.textContent = 'чтение архива…';
        try {
            const zip = await JSZip.loadAsync(file);
            const staged = new Map();
            let total = 0;
            for (const [path, entry] of Object.entries(zip.files)) {
                if (entry.dir) continue;
                const rawPath = entry.unsafeOriginalName || path;
                if (safeParts(rawPath).length === 0) throw new Error('в архиве найден некорректный путь');
                const destination = normalizeResourcePath(rawPath);
                if (!destination) continue;
                if (staged.has(destination)) throw new Error('повторяющийся файл: ' + destination);
                const bytes = await entry.async('uint8array');
                total += bytes.length;
                if (total > maxResourceBytes) throw new Error('ресурсы больше 256 мб');
                staged.set(destination, new File([bytes], destination.split('/').pop()));
            }
            if (!resourceSetValid(staged)) throw new Error('нужны main.pak и папка properties');
            const header = new Uint8Array(await staged.get('main.pak').slice(0, 8).arrayBuffer());
            if (header.length < 8 || header[0] !== 0x37 || header[1] !== 0xbd || header[2] !== 0x37 || header[3] !== 0x4d) {
                throw new Error('main.pak не похож на архив pc-версии plants vs. zombies');
            }
            collectedFiles.clear();
            for (const [path, value] of staged) collectedFiles.set(path, value);
        } catch (error) {
            status('не удалось загрузить архив: ' + error.message, true);
            console.error('Resource import failed:', error);
            throw error;
        } finally {
            resourceBusy = false;
            button.disabled = false;
            button.innerHTML = label;
            refreshUI();
        }
    };

    const baseStart = startGame;
    startGame = async function() {
        if (restoring || resourceBusy || launching || gameStarted || bundleState.phase !== 'ready' || !resourceSetValid(collectedFiles)) return;
        launching = true;
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        try {
            await baseStart();
            mainLoopActive = gameStarted;
            if (document.visibilityState === 'hidden' || (supported('8.0') && telegram.isActive === false)) suspendForVisibility();
        } finally { launching = false; }
    };

    retryButton.addEventListener('click', () => { restorePromise = loadBundledResources(); });
    // The upstream IDs remain for host compatibility, but resource selection is
    // not a product flow. Also prevent dropping a ZIP onto the play button.
    for (const type of ['dragover', 'dragleave', 'drop']) dropZone.addEventListener(type, event => {
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    document.getElementById('game-menu-btn').addEventListener('click', () => {
        setOptionsOpen(false);
        keyEscape();
    });
    fullscreenButton.addEventListener('click', fullscreen);
    gameOptionsButton.addEventListener('click', () => setOptionsOpen(gameOptions.hidden));
    document.getElementById('game-options-close').addEventListener('click', () => setOptionsOpen(false, true));
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'click']) {
        gameOptionsDismiss.addEventListener(type, absorbDrawerTap, {capture: true, passive: false});
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !gameOptions.hidden) {
            event.preventDefault();
            event.stopImmediatePropagation();
            setOptionsOpen(false, true);
        }
    }, true);
    document.getElementById('resume-game-btn').addEventListener('click', resumeFromVisibility);
    reselectLink.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); reselectLink.click(); }
    });

    if (inTelegram) {
        document.getElementById('host-label').textContent = 'telegram';
        telegram.ready();
        telegram.expand();
        if (supported('6.1')) {
            telegram.setHeaderColor('#101b12');
            telegram.setBackgroundColor('#101b12');
            telegram.BackButton.onClick(keyEscape);
        }
        if (supported('7.7') && telegram.disableVerticalSwipes) telegram.disableVerticalSwipes();
        telegram.onEvent('viewportChanged', updateViewport);
        if (supported('8.0')) {
            telegram.onEvent('deactivated', () => {
                suspendForVisibility();
                void syncSavesSafely();
            });
            telegram.onEvent('activated', updateViewport);
            telegram.onEvent('safeAreaChanged', updateViewport);
            telegram.onEvent('contentSafeAreaChanged', updateViewport);
            telegram.onEvent('fullscreenChanged', updateViewport);
            telegram.onEvent('fullscreenFailed', () => {
                gameStatus.textContent = 'полный экран недоступен; поверни телефон горизонтально';
                updateViewport();
            });
        }
    }

    window.addEventListener('pvz:started', () => {
        canvas.focus({preventScroll: true});
        updateViewport();
        if (supported('6.1')) telegram.BackButton.show();
        if (supported('6.2')) telegram.enableClosingConfirmation();
        renderSaveStatus();
    });
    window.addEventListener('pvz:stopped', () => {
        mainLoopActive = false;
        lifecyclePaused = false;
        resumeOverlay.hidden = true;
        setOptionsOpen(false);
        if (supported('6.1')) telegram.BackButton.hide();
        if (supported('6.2')) telegram.disableClosingConfirmation();
    });
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateViewport);
        window.visualViewport.addEventListener('scroll', updateViewport);
    }
    if (typeof ResizeObserver === 'function') {
        const stageObserver = new ResizeObserver(updateViewport);
        stageObserver.observe(gameStage);
    }
    document.addEventListener('fullscreenchange', updateViewport);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') suspendForVisibility();
    });
    window.addEventListener('pagehide', suspendForVisibility);
    window.addEventListener('pvz:save-status', event => renderSaveStatus(event.detail));
    updateViewport();
    renderSaveStatus();

    // An explicit test/embedding interface; it does not change game state or unlock modes.
    window.PvzHost = Object.freeze({
        version: '0.2.6-telegram.3-wide',
        ready: window.moduleReadyPromise,
        importResources: file => importResourceZip(file),
        retryResources: () => { restorePromise = loadBundledResources(); return restorePromise; },
        start: () => startGame(),
        syncSaves: () => syncSaves(),
        menu: keyEscape,
        fullscreen,
        getState: () => ({gameStarted, lifecyclePaused, saveStorage: {...saveStorageState}, bundle: {...bundleState}, resourcesReady: bundleState.phase === 'ready' && resourceSetValid(collectedFiles), resourceFiles: collectedFiles.size, resourceBusy, restoring, inTelegram, status: cacheStatus.textContent}),
        cacheSettled: () => cacheChain,
        resourcesSettled: () => restorePromise,
        clearResourceCache: async () => { await writeResources(new Map(), null); }
    });
    window.moduleReadyPromise.catch(error => status('не удалось загрузить движок: ' + error.message, true));
    restorePromise = loadBundledResources();
})();
