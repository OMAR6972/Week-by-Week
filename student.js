/* Academic Hub - app.js (extracted from index.html, Phase 1) */
    window.addEventListener('DOMContentLoaded', () => {
        if(typeof window.COURSE_DATA === 'undefined') {
            document.getElementById('home-page').innerHTML = `
                <h1 style="color:#ff3b30; margin-top:50px; text-align:center;">DATA ERROR</h1>
                <p style="text-align:center; color:#ccc;">Could not load data. Please check your <b>course_data.js</b> file for a missing comma, unclosed quote, or bracket.</p>
            `;
        }
    });

    let iconMap = {};
    
    // Safety check in case CONFIG is missing in JS
    if(typeof window.CONFIG !== 'undefined' && window.CONFIG.resources) {
        window.CONFIG.resources.forEach(r => iconMap[r.name] = r.icon);
    }

    if(typeof window.MIDTERM_DATA === 'undefined') window.MIDTERM_DATA = [];
    if(typeof window.FINAL_DATA === 'undefined') window.FINAL_DATA = [];
    if(typeof window.SCHEDULE_DATA === 'undefined') window.SCHEDULE_DATA = [];
    if(typeof window.STAFF_DATA === 'undefined') window.STAFF_DATA = [];
    if(typeof window.SUBJECT_DETAILS_DATA === 'undefined') window.SUBJECT_DETAILS_DATA = {};
    
    let currSub = null;
    let currentSubjectView = 'weeks';
    let playlistBadgeFilters = new Set();
    let historySubFilter = new Set();
    // Filter panel open states — survive re-renders
    let fpOpenState = { schedule: false, deadlines: false, usefulBadges: false, playlist: false, history: false, directory: false };
    let deadlineSubFilter = new Set();
    let deadlineTypeFilter = new Set();
    let midtermHiddenSet = (() => {
        try { return new Set(JSON.parse(localStorage.getItem('midtermHidden') || '[]')); }
        catch(e) { return new Set(); }
    })();
    function saveMidtermHidden() {
        try { localStorage.setItem('midtermHidden', JSON.stringify([...midtermHiddenSet])); } catch(e) {}
    }
    let finalHiddenSet = (() => {
        try { return new Set(JSON.parse(localStorage.getItem('finalHidden') || '[]')); }
        catch(e) { return new Set(); }
    })();
    function saveFinalHidden() {
        try { localStorage.setItem('finalHidden', JSON.stringify([...finalHiddenSet])); } catch(e) {}
    }
    // auto-default: if finals data exists → finals (since finals come after midterms period)
    // otherwise → midterms. Persisted in localStorage.
    let examViewMode = (() => {
        try {
            const saved = localStorage.getItem('examViewMode');
            if (saved === 'finals' && window.FINAL_DATA && window.FINAL_DATA.length > 0) return 'finals';
        } catch(e) {}
        return (window.FINAL_DATA && window.FINAL_DATA.length > 0) ? 'finals' : 'midterms';
    })();
    function saveExamViewMode() {
        try { localStorage.setItem('examViewMode', examViewMode); } catch(e) {}
    }
    let currentUsefulFilter = 'All Links';
    let currentUsefulSubject = new Set(); // multi-select subject filter
    let currentUsefulBadgeFilters = new Set(); // multi-select badge filters
    let subjectViewFilters = {};
    let weekNavPrev = null, weekNavNext = null, weekNavFrom = 'weeks';
    let currentContentObj = null;
    let currentContentSourceArr = null;
    let sharePayload = { title: '', text: '', fileBase: 'week-by-week' };
    let hashRouteListenerBound = false;

    function getSubjectDetailsDefaults() {
        return { gradeDistribution: '', examTypes: '', generalNotes: '' };
    }

    function ensureSubjectDetailsEntry(subCode) {
        if (!subCode) return getSubjectDetailsDefaults();
        if (typeof window.SUBJECT_DETAILS_DATA === 'undefined' || !window.SUBJECT_DETAILS_DATA) {
            window.SUBJECT_DETAILS_DATA = {};
        }
        if (!window.SUBJECT_DETAILS_DATA[subCode] || typeof window.SUBJECT_DETAILS_DATA[subCode] !== 'object') {
            window.SUBJECT_DETAILS_DATA[subCode] = getSubjectDetailsDefaults();
        }
        const entry = window.SUBJECT_DETAILS_DATA[subCode];
        if (typeof entry.gradeDistribution !== 'string') entry.gradeDistribution = '';
        if (typeof entry.examTypes !== 'string') entry.examTypes = '';
        if (typeof entry.generalNotes !== 'string') entry.generalNotes = '';
        return entry;
    }

    function getSubjectByCode(subCode) {
        return (window.COURSE_DATA || []).find(s => (s.code || '').toUpperCase() === String(subCode || '').toUpperCase()) || null;
    }

    function getSubjectHashSegment() {
        if (!currSub || !currSub.code) return '';
        if (currentPageId === 'content' && currentContentObj) {
            const inEvents = (currSub.events || []).includes(currentContentObj);
            const num = extractWeekNumber(currentContentObj.title);
            if (inEvents && num !== null) return `${currSub.code}/event${num}`;
            if (num !== null) return `${currSub.code}/week${num}`;
            if (inEvents) return `${currSub.code}/event`;
        }
        if (currentPageId === 'weeks') {
            if (currentSubjectView === 'events') return `${currSub.code}/events`;
            if (currentSubjectView === 'playlists') return `${currSub.code}/links`;
            if (currentSubjectView === 'details') return `${currSub.code}/details`;
            return `${currSub.code}`;
        }
        return '';
    }

    function applySubjectHash() {
        const seg = getSubjectHashSegment();
        if (!seg) return;
        const hash = `#${seg}`;
        if (location.hash === hash) return;
        const state = history.state || { page: currentPageId || 'home' };
        history.replaceState(state, null, hash);
    }

    function applyHashRoute() {
        const raw = decodeURIComponent(String(location.hash || '').replace(/^#/, '').trim());
        if (!raw) {
            nav('home', false);
            return;
        }

        const lower = raw.toLowerCase();
        const pageMap = new Set(['home', 'recent', 'schedule', 'deadlines', 'midterm', 'useful-links', 'timetable', 'directory', 'gpa', 'updates']);
        if (pageMap.has(lower)) {
            if (lower === 'home') nav('home', false);
            else if (lower === 'recent') showRecent();
            else if (lower === 'schedule') showSchedule(false, 'home');
            else if (lower === 'deadlines') showDeadlines(false);
            else if (lower === 'midterm') showMidterms(false, 'home');
            else if (lower === 'useful-links') showUsefulLinks(false, currentUsefulFilter, currentUsefulSubject);
            else if (lower === 'timetable') showTimetable(false);
            else if (lower === 'directory') showDirectory(false);
            else if (lower === 'gpa') showGpa(false);
            else if (lower === 'updates') showUpdates(false);
            return;
        }

        const parts = raw.split('/').filter(Boolean);
        if (!parts.length) {
            nav('home', false);
            return;
        }

        const sub = getSubjectByCode(parts[0]);
        if (!sub) {
            nav('home', false);
            return;
        }

        const routePart = (parts[1] || '').toLowerCase();
        if (!routePart) {
            currentSubjectView = 'weeks';
            showWeeks(sub, false);
            return;
        }

        if (routePart === 'events') {
            currentSubjectView = 'events';
            showWeeks(sub, false);
            return;
        }
        if (routePart === 'event') {
            currentSubjectView = 'events';
            showWeeks(sub, false);
            return;
        }
        if (routePart === 'links' || routePart === 'playlists') {
            currentSubjectView = 'playlists';
            showWeeks(sub, false);
            return;
        }
        if (routePart === 'details') {
            currentSubjectView = 'details';
            showWeeks(sub, false);
            return;
        }

        const weekMatch = routePart.match(/^week(\d+)$/i);
        if (weekMatch) {
            currentSubjectView = 'weeks';
            showWeeks(sub, false);
            const targetNum = parseInt(weekMatch[1], 10);
            const wk = (sub.weeks || []).find(w => extractWeekNumber(w.title) === targetNum);
            if (wk) showContentByObj(wk, false, 'weeks');
            return;
        }

        const eventMatch = routePart.match(/^event(\d+)$/i);
        if (eventMatch) {
            currentSubjectView = 'events';
            showWeeks(sub, false);
            const targetNum = parseInt(eventMatch[1], 10);
            const ev = (sub.events || []).find(w => extractWeekNumber(w.title) === targetNum);
            if (ev) showContentByObj(ev, false, 'events');
            return;
        }

        nav('home', false);
    }
    let currentPageId = 'home';
    let previousPageId = 'home';
    const HIDDEN_SUBJECTS_KEY = 'hiddenSubjectCodes';
    const HIDDEN_WEEKS_KEY = 'hiddenWeekKeys';
    const DEADLINE_STATE_KEY = 'deadlineItemStates';
    const DEADLINE_TODO_DISMISSED_KEY = 'deadlineTodoDismissed';
    let hiddenSubjectSet = (() => {
        try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_SUBJECTS_KEY) || '[]')); }
        catch(e) { return new Set(); }
    })();
    let hiddenWeekSet = (() => {
        try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_WEEKS_KEY) || '[]')); }
        catch(e) { return new Set(); }
    })();
    let deadlineItemStates = (() => {
        try {
            const parsed = JSON.parse(localStorage.getItem(DEADLINE_STATE_KEY) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch(e) {
            return {};
        }
    })();
    let dismissedDeadlineTodoMap = (() => {
        try {
            const parsed = JSON.parse(localStorage.getItem(DEADLINE_TODO_DISMISSED_KEY) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch(e) {
            return {};
        }
    })();

    function saveDeadlineItemStates() {
        try { localStorage.setItem(DEADLINE_STATE_KEY, JSON.stringify(deadlineItemStates)); } catch(e) {}
    }


    function isQuizOrDiscussionTask(taskObj) {
        const hay = `${taskObj && taskObj.name || ''} ${taskObj && taskObj.type || ''}`.toLowerCase();
        return /\bquiz\b|\bexam\b|\bdiscussion\b|\bpresentation\b/.test(hay);
    }

    const DEADLINE_TODO_WINDOW_DAYS = 7;


    function buildScheduleDeadlineSignature(wIndex, tIndex, weekNum, taskObj) {
        return `schedule::${wIndex}::${tIndex}::${weekNum || ''}::${taskObj && taskObj.sub || ''}::${taskObj && taskObj.name || ''}`;
    }

    function buildNewsDeadlineSignature(newsIndex, item) {
        return `news::${newsIndex}::${item && item.sub || ''}::${item && item.title || ''}`;
    }

    function getDeadlineState(signature) {
        return deadlineItemStates[signature] || 'active';
    }

    function setDeadlineState(signature, status) {
        if (!signature) return;
        if (status === 'active') delete deadlineItemStates[signature];
        else deadlineItemStates[signature] = status;
        saveDeadlineItemStates();
    }


    function isScheduleDeadlineOngoingNow(wk, task, nowTs = Date.now()) {
        if (!wk || !task) return false;
        if (!task.deadlineEndDate || String(task.deadlineEndDate).trim() === '') return false;

        const parsedStart = getTaskEffectiveDeadlineMeta(task, wk.week);
        const tsStart = parsedStart.timestamp;
        if (!tsStart) return false;

        const parsedEnd = parseDateMeta(task.deadlineEndDate);
        const tsEnd = parsedEnd.timestamp;
        if (!tsEnd || tsEnd <= tsStart) return false;

        const compareEndTs = parsedEnd.hasTime ? tsEnd : getEndOfDayTimestamp(tsEnd);
        return tsStart <= nowTs && compareEndTs > nowTs;
    }


    function setScheduleDeadlineStatus(wIndex, tIndex, status) {
        const wk = (window.SCHEDULE_DATA || [])[wIndex];
        const task = wk && (wk.tasks || [])[tIndex];
        if (!wk || !task) return;
        const signature = buildScheduleDeadlineSignature(wIndex, tIndex, wk.week, task);
        setDeadlineState(signature, status);
        showToast(status === 'active' ? 'Deadline restored' : 'Deadline hidden', 'todo');
        if (currentPageId === 'deadlines') refreshDeadlinesInPlace();
        populateDeadlinesDropdown();
    }

    function setNewsDeadlineStatus(newsIndex, status) {
        const item = (window.NEWS_DATA || [])[newsIndex];
        if (!item) return;
        const signature = buildNewsDeadlineSignature(newsIndex, item);
        setDeadlineState(signature, status);
        showToast(status === 'active' ? 'Deadline restored' : 'Deadline hidden', 'todo');
        if (currentPageId === 'deadlines') refreshDeadlinesInPlace();
        populateDeadlinesDropdown();
    }

    function refreshDeadlinesInPlace() {
        const y = window.scrollY || 0;
        const prevSkip = _dlSkipFilterRebuild;
        _dlSkipFilterRebuild = true;
        showDeadlines(false);
        _dlSkipFilterRebuild = prevSkip;
        // Silently re-sort home subjects grid so order is correct when user returns
        const grid = document.getElementById('subjects-grid');
        if (grid && grid.children.length > 0) {
            const sorted = getHomepageOrderedSubjects();
            const frag = document.createDocumentFragment();
            sorted.forEach(s => {
                const card = grid.querySelector(`[data-link="#${s.code}"]`);
                if (card) frag.appendChild(card);
            });
            grid.appendChild(frag);
        }
        requestAnimationFrame(() => window.scrollTo(0, y));
    }

    function saveHiddenSubjects() {
        try { localStorage.setItem(HIDDEN_SUBJECTS_KEY, JSON.stringify([...hiddenSubjectSet])); } catch(e) {}
    }

    function saveHiddenWeeks() {
        try { localStorage.setItem(HIDDEN_WEEKS_KEY, JSON.stringify([...hiddenWeekSet])); } catch(e) {}
    }

    function makeWeekHideKey(subCode, section, weekTitle) {
        return `${subCode || ''}::${section || 'weeks'}::${weekTitle || ''}`;
    }

    function parseWeekHideKey(key) {
        const parts = String(key || '').split('::');
        return { subCode: parts[0] || '', section: parts[1] || 'weeks', weekTitle: parts.slice(2).join('::') || '' };
    }

    function getWeekSection(weekObj) {
        if (!currSub || !weekObj) return 'weeks';
        return (currSub.events || []).includes(weekObj) ? 'events' : 'weeks';
    }

    function isWeekHidden(subCode, weekObj, sectionHint = null) {
        if (!subCode || !weekObj) return false;
        const section = sectionHint || getWeekSection(weekObj);
        return hiddenWeekSet.has(makeWeekHideKey(subCode, section, weekObj.title));
    }

    function hideWeek(subCode, weekObj, sectionHint = null) {
        if (!subCode || !weekObj) return;
        const section = sectionHint || getWeekSection(weekObj);
        const key = makeWeekHideKey(subCode, section, weekObj.title);
        if (hiddenWeekSet.has(key)) return;
        hiddenWeekSet.add(key);
        saveHiddenWeeks();
        showToast('Week hidden from view', 'todo');
        if (currentPageId === 'weeks') renderSubjectView(currentSubjectView, false);
        renderHiddenWeeksControls();
        renderHiddenWeeksModalList();
    }

    function unhideWeekByKey(key, opts = {}) {
        if (!hiddenWeekSet.has(key)) return;
        hiddenWeekSet.delete(key);
        saveHiddenWeeks();
        if (!opts.silent) showToast('Week restored', 'todo');
        if (!opts.skipRefresh && currentPageId === 'weeks') renderSubjectView(currentSubjectView, false);
        renderHiddenWeeksControls();
        renderHiddenWeeksModalList();
    }

    function openHiddenWeeksModal() {
        renderHiddenWeeksModalList();
        const modal = document.getElementById('hidden-weeks-modal');
        if (modal) modal.classList.add('active');
    }

    function closeHiddenWeeksModal(event, force = false) {
        if (!force && event && event.target && event.target.id !== 'hidden-weeks-modal') return;
        const modal = document.getElementById('hidden-weeks-modal');
        if (modal) modal.classList.remove('active');
    }

    function renderHiddenWeeksControls() {
        const host = document.getElementById('hidden-weeks-controls');
        if (!host || !currSub || currentPageId !== 'weeks') return;
        if (currentSubjectView === 'playlists' || currentSubjectView === 'details') {
            host.innerHTML = '';
            host.style.display = 'none';
            return;
        }
        const section = currentSubjectView === 'events' ? 'events' : 'weeks';
        const hiddenKeys = [...hiddenWeekSet].filter(k => {
            const p = parseWeekHideKey(k);
            return p.subCode === currSub.code && p.section === section;
        });
        if (hiddenKeys.length === 0) {
            host.innerHTML = '';
            host.style.display = 'none';
            return;
        }
        host.style.display = 'block';
        host.innerHTML = `<button onclick="openHiddenWeeksModal()" style="padding:8px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.04); color:#bbb; font-size:0.8rem; cursor:pointer;">View Hidden Weeks (${hiddenKeys.length})</button>`;
    }

    function renderHiddenWeeksModalList() {
        const list = document.getElementById('hidden-weeks-list');
        if (!list) return;
        if (!currSub) {
            list.innerHTML = '<div style="text-align:center; color:#777; padding:12px 0; font-style:italic;">Open a subject first.</div>';
            return;
        }
        const section = currentSubjectView === 'events' ? 'events' : 'weeks';
        const hiddenKeys = [...hiddenWeekSet].filter(k => {
            const p = parseWeekHideKey(k);
            return p.subCode === currSub.code && p.section === section;
        });
        if (!hiddenKeys.length) {
            list.innerHTML = '<div style="text-align:center; color:#777; padding:12px 0; font-style:italic;">No hidden weeks for this view.</div>';
            return;
        }
        list.innerHTML = hiddenKeys.map(k => {
            const p = parseWeekHideKey(k);
            const escaped = String(k).replace(/'/g, "\\'");
            return `<div class="hidden-subject-row"><div><div style="font-weight:700; color:#eee;">${p.weekTitle}</div><div class="meta">${currSub.code} • ${p.section === 'events' ? 'Exam Materials' : 'Weeks'}</div></div><button class="unhide-one-btn" onclick="unhideWeekByKey('${escaped}')">Unhide</button></div>`;
        }).join('');
    }


    function isSubjectHidden(code) {
        return hiddenSubjectSet.has(code);
    }

    function getVisibleCourseSubjects() {
        return (window.COURSE_DATA || []).filter(s => !isSubjectHidden(s.code));
    }

    function getVisibleScheduleTasks(tasks) {
        return (tasks || []).filter(t => !isSubjectHidden(t.sub));
    }

    function getVisibleStaffData(staff) {
        return (staff || []).map(p => {
            const subjects = (p.subjects || []).filter(sub => !isSubjectHidden(sub));
            return { ...p, subjects };
        }).filter(p => p.subjects.length > 0);
    }

    function refreshCurrentFilteredPage() {
        if (currentPageId === 'home') init();
        else if (currentPageId === 'recent') showRecent();
        else if (currentPageId === 'schedule') renderScheduleContent();
        else if (currentPageId === 'deadlines') showDeadlines(false);
        else if (currentPageId === 'useful-links') {
            currentUsefulSubject = new Set([...currentUsefulSubject].filter(code => !isSubjectHidden(code)));
            showUsefulLinks(false, currentUsefulFilter, currentUsefulSubject, Array.from(currentUsefulBadgeFilters));
        }
        else if (currentPageId === 'directory') renderDirectory();
        populateAllDropdowns();
    }

    function clearSubjectHistoryData(code) {
        if (!code) return;
        const sub = (window.COURSE_DATA || []).find(s => s.code === code);
        if (!sub) return;
        const combined = [...(sub.weeks || []), ...(sub.events || [])];
        combined.forEach(wk => {
            wk.isRecent = false;
            wk.recentDate = '';
            if (wk.resources) {
                Object.keys(wk.resources).forEach(k => {
                    const res = wk.resources[k];
                    if (!res) return;
                    res.isRecent = false;
                    res.recentDate = '';
                });
            }
        });
    }

    function hideSubject(code) {
        if (!code || hiddenSubjectSet.has(code)) return;
        clearSubjectHistoryData(code);
        historySubFilter.delete(code);
        hiddenSubjectSet.add(code);
        saveHiddenSubjects();
        showToast('Subject hidden globally', 'todo');
        refreshCurrentFilteredPage();
        renderHiddenSubjectsModalList();
    }

    function unhideSubject(code) {
        if (!code || !hiddenSubjectSet.has(code)) return;
        hiddenSubjectSet.delete(code);
        saveHiddenSubjects();
        showToast('Subject restored', 'todo');
        refreshCurrentFilteredPage();
        renderHiddenSubjectsModalList();
    }

    function openHiddenSubjectsModal() {
        renderHiddenSubjectsModalList();
        const modal = document.getElementById('hidden-subjects-modal');
        if (modal) modal.classList.add('active');
    }

    function closeHiddenSubjectsModal(event, force = false) {
        if (!force && event && event.target && event.target.id !== 'hidden-subjects-modal') return;
        const modal = document.getElementById('hidden-subjects-modal');
        if (modal) modal.classList.remove('active');
    }

    function renderHiddenSubjectsModalList() {
        const list = document.getElementById('hidden-subjects-list');
        if (!list) return;
        const hiddenCodes = [...hiddenSubjectSet];
        if (!hiddenCodes.length) {
            list.innerHTML = '<div style="text-align:center; color:#777; padding:12px 0; font-style:italic;">No hidden subjects.</div>';
            return;
        }

        const byCode = new Map((window.COURSE_DATA || []).map(s => [s.code, s]));
        list.innerHTML = hiddenCodes.map(code => {
            const sub = byCode.get(code);
            const name = sub ? sub.name : code;
            return `<div class="hidden-subject-row"><div><div style="font-weight:700; color:#eee;">${name}</div><div class="meta">${code}</div></div><button class="unhide-one-btn" onclick="unhideSubject('${code}')">Unhide</button></div>`;
        }).join('');
    }


    function extractWeekNumber(weekName) {
        const m = String(weekName || '').match(/week\s*(\d+)/i) || String(weekName || '').match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }

    function buildWeekHash(subCode, weekObj, isEvent) {
        const code = String(subCode || '').trim();
        if (!code) return '';
        const num = extractWeekNumber(weekObj && weekObj.title);
        if (isEvent) return num !== null ? `#${code}/event${num}` : `#${code}/events`;
        return num !== null ? `#${code}/week${num}` : `#${code}`;
    }


    function clearElementHtml(id) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
        return el;
    }

    function cleanupHeavyViewDom(pageId) {
        if (pageId === 'schedule') {
            clearElementHtml('schedule-view-toggle');
            clearElementHtml('schedule-filter-container');
            clearElementHtml('deliverables-grid');
            return;
        }

        if (pageId === 'deadlines') {
            clearElementHtml('deadlines-filter-bar');
            clearElementHtml('ongoing-list');
            clearElementHtml('upcoming-list');
            clearElementHtml('completed-list');
            clearElementHtml('unscheduled-list');
            const ongoingContainer = document.getElementById('ongoing-container');
            const unscheduledContainer = document.getElementById('unscheduled-container');
            if (ongoingContainer) ongoingContainer.style.display = 'none';
            if (unscheduledContainer) unscheduledContainer.style.display = 'none';
            return;
        }

        if (pageId === 'weeks') {
            clearElementHtml('filter-bar-wrap');
            clearElementHtml('weeks-grid');
            clearElementHtml('playlists-grid');
            return;
        }

        if (pageId === 'content') {
            clearElementHtml('content-badge-container');
            clearElementHtml('week-details');
            clearElementHtml('resources-grid');
            clearElementHtml('week-nav');
            return;
        }
    }

    const NAV_TAB_ORDER = ['home', 'recent', 'schedule', 'deadlines', 'midterm', 'useful-links', 'timetable', 'directory', 'gpa', 'updates'];

    function getPageLabel(pageId) {
        const labels = {
            'home': 'Subjects',
            'recent': 'History',
            'schedule': 'Semester Map',
            'deadlines': 'Deadlines',
            'midterm': 'Midterms / Finals',
            'useful-links': 'Useful Links',
            'timetable': 'Timetable',
            'directory': 'Staff Contacts',
            'gpa': 'GPA Calculator',
            'updates': 'Updates',
            'weeks': (currSub ? `${currSub.code} Material` : 'Subject Material'),
            'content': (currSub ? `${currSub.code}` : 'Material')
        };
        return labels[pageId] || 'Subjects';
    }

    function applyWaterfallToContainer(container, selector = '.card, .recent-card, .update-card') {
        if (!container) return;
        const items = [...container.querySelectorAll(selector)];
        if (!items.length) return;

        items.forEach(el => {
            el.classList.remove('waterfall-item');
            el.style.removeProperty('--wf-delay');
        });

        // Force reflow so re-applying the class reliably restarts animation.
        void container.offsetWidth;

        items.forEach((el, index) => {
            const delay = Math.min(index * 0.1, 1.8);
            el.style.setProperty('--wf-delay', `${delay}s`);
            el.classList.add('waterfall-item');
        });
    }

    function animateActivePageWaterfall() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return;
        applyWaterfallToContainer(activePage);
    }

    function updateBackButtons() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return;
        const backBtns = activePage.querySelectorAll('.back-btn');
        if (!backBtns.length) return;
        const label = getPageLabel(previousPageId);
        backBtns.forEach(btn => { btn.textContent = `← Back to ${label}`; });
    }

    function smartBack() {
        closeModal(null, true);
        closeShareSheet(null, true);
        if (document.getElementById('news-panel').classList.contains('active')) { closeNewsPanel(null, true); return; }
        if (document.querySelector('#home-page.active')) return;
        if (window.history.length > 1) history.back();
        else nav('home', false);
    }

    function openTopLevelTab(tabId) {
        if(tabId === 'home') nav('home');
        else if(tabId === 'recent') showRecent();
        else if(tabId === 'schedule') showSchedule();
        else if(tabId === 'deadlines') showDeadlines();
        else if(tabId === 'midterm') showMidterms(true, 'home');
        else if(tabId === 'useful-links') showUsefulLinks(true, currentUsefulFilter, currentUsefulSubject);
        else if(tabId === 'timetable') showTimetable();
        else if(tabId === 'directory') showDirectory();
        else if(tabId === 'gpa') showGpa();
        else if(tabId === 'updates') showUpdates();
    }

    // Auto-expire "New" badges older than 7 days based on recentDate
    function autoExpireNewBadges() {
        const DAYS_LIMIT = 7;
        const now = new Date();
        const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        function applyNewWindow(item) {
            if (!item || !item.recentDate) return;

            let publishDate = new Date(item.recentDate);
            if (isNaN(publishDate.getTime())) {
                const ts = parseDate(item.recentDate);
                if (!ts) return;
                publishDate = new Date(ts);
            }

            const publishStart = new Date(
                publishDate.getFullYear(),
                publishDate.getMonth(),
                publishDate.getDate()
            );

            // Calculate difference in milliseconds
            const diffTime = Math.abs(nowStart - publishStart);
            const diffDays = diffTime / (1000 * 60 * 60 * 24);

            // If the difference is LESS THAN OR EQUAL TO 7 days, keep NEW badge
            if (diffDays <= DAYS_LIMIT) {
                item.isNew = true;
            } else {
                item.isNew = false;
            }
        }

        window.COURSE_DATA.forEach(sub => {
            [...(sub.weeks || []), ...(sub.events || [])].forEach(wk => {
                applyNewWindow(wk);
                if (wk.resources) {
                    Object.values(wk.resources).forEach(res => {
                        applyNewWindow(res);
                    });
                }
            });
        });
    }

    function parseExamDateTime(exam) {
        if (!exam.date) return 0;
        const base = new Date(exam.date + 'T00:00:00').getTime();
        if (!exam.time) return base + 12 * 60 * 60 * 1000;
        const m = exam.time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (!m) return base + 12 * 60 * 60 * 1000;
        let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
        const ampm = (m[3] || '').toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return base + (h * 60 + min) * 60 * 1000;
    }

    // Shared helpers used by both getSubjectUrgency and the home page exam button
    const _EXAM_DEFAULT_OFFSET = (14 * 60 + 30) * 60 * 1000; // 2:30 PM fallback

    function _examTimestamp(exam) {
        if (!exam || !exam.date) return null;
        const base = new Date(exam.date + 'T00:00:00').getTime();
        if (!exam.time || !String(exam.time).trim()) return base + _EXAM_DEFAULT_OFFSET;
        const m = String(exam.time).match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (!m) return base + _EXAM_DEFAULT_OFFSET;
        let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
        const ampm = (m[3] || '').toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return base + (h * 60 + min) * 60 * 1000;
    }

    function isExamPeriodActive(dataArr, triggerMs) {
        if (!dataArr || !dataArr.length) return false;
        const now = Date.now();
        let firstTs = Infinity, lastEndTs = -Infinity;
        dataArr.forEach(e => {
            const ts = _examTimestamp(e);
            if (!ts || !e.date) return;
            if (ts < firstTs) firstTs = ts;
            const eod = new Date(e.date + 'T00:00:00').getTime() + 24 * 60 * 60 * 1000;
            if (eod > lastEndTs) lastEndTs = eod;
        });
        if (firstTs === Infinity || lastEndTs === -Infinity) return false;
        return (firstTs - now) <= triggerMs && lastEndTs > now;
    }

    function getSubjectUrgency(subCode) {
        const now = Date.now();
        const FINALS_TRIGGER_MS  = 5 * 24 * 60 * 60 * 1000;
        const MIDTERM_TRIGGER_MS = 3 * 24 * 60 * 60 * 1000;
        const GROUP2_OFFSET = 500;

        function endOfDay(dateStr) {
            return new Date(dateStr + 'T00:00:00').getTime() + 24 * 60 * 60 * 1000;
        }

        function nextSubjectExam(dataArr) {
            if (!dataArr) return null;
            let best = null, bestTs = Infinity;
            dataArr.forEach(e => {
                if (e.sub !== subCode || !e.date) return;
                if (endOfDay(e.date) <= now) return;
                const ts = _examTimestamp(e);
                if (ts !== null && ts < bestTs) { best = e; bestTs = ts; }
            });
            return best;
        }

        function deadlineScore() {
            let score = Infinity;
            const typeWeight = { 'quiz': 0.8, 'lab exam': 0.5 };
            if (window.SCHEDULE_DATA) {
                window.SCHEDULE_DATA.forEach((wk, wIndex) => {
                    if (!wk.tasks) return;
                    wk.tasks.forEach((t, tIndex) => {
                        if (t.sub !== subCode || t.isCompleted) return;
                        const sig = buildScheduleDeadlineSignature(wIndex, tIndex, wk.week, t);
                        const st = getDeadlineState(sig);
                        if (st === 'hidden' || st === 'completed') return;
                        const meta = getTaskEffectiveDeadlineMeta(t, wk.week);
                        if (meta.timestamp === 0) return;
                        const compareTs = meta.hasTime ? meta.timestamp : getEndOfDayTimestamp(meta.timestamp);
                        if (compareTs < now) return;
                        const daysLeft = (compareTs - now) / (1000 * 60 * 60 * 24);
                        const name = (t.name || '').toLowerCase();
                        const weight = typeWeight[name] !== undefined ? typeWeight[name] : 1;
                        const s = daysLeft * weight;
                        if (s < score) score = s;
                    });
                });
            }
            return score;
        }

        if (isExamPeriodActive(window.FINAL_DATA, FINALS_TRIGGER_MS)) {
            const exam = nextSubjectExam(window.FINAL_DATA);
            if (exam) return Math.max(0, (_examTimestamp(exam) - now) / (1000 * 60 * 60 * 24));
            return GROUP2_OFFSET + deadlineScore();
        }

        if (isExamPeriodActive(window.MIDTERM_DATA, MIDTERM_TRIGGER_MS)) {
            const exam = nextSubjectExam(window.MIDTERM_DATA);
            if (exam) return Math.max(0, (_examTimestamp(exam) - now) / (1000 * 60 * 60 * 24));
            return GROUP2_OFFSET + deadlineScore();
        }

        return deadlineScore();
    }

    function getHomepageOrderedSubjects() {
        const scores = {};
        const visible = getVisibleCourseSubjects();
        visible.forEach(s => { scores[s.code] = getSubjectUrgency(s.code); });
        return [...visible].sort((a, b) => {
            return scores[a.code] - scores[b.code];
        });
    }

    function renderHiddenSubjectsControls() {
        const host = document.getElementById('hidden-subject-controls');
        if (!host) return;
        const hiddenCodes = [...hiddenSubjectSet];
        if (hiddenCodes.length === 0) {
            host.innerHTML = '';
            return;
        }
        host.innerHTML = `<button onclick="openHiddenSubjectsModal()" style="padding:8px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.04); color:#bbb; font-size:0.8rem; cursor:pointer;">View Hidden Subjects (${hiddenCodes.length})</button>`;
    }

    function init() {
        const grid = document.getElementById('subjects-grid');
        if (grid) grid.innerHTML = '';
        if (typeof window.COURSE_DATA === 'undefined') window.COURSE_DATA = [];

        // Auto-expire "New" badges older than 7 days
        autoExpireNewBadges();

        const sorted = getHomepageOrderedSubjects();

        // Build all cards into a DocumentFragment — single DOM write
        const frag = document.createDocumentFragment();
        sorted.forEach(s => {
            if (!s.weeks) s.weeks = [];
            if (!s.events) s.events = [];
            if (!s.playlists) s.playlists = [];
            s.playlists.forEach(p => {
                if (!p.badges) {
                    p.badges = p.badgeText ? [{ text: p.badgeText, color: p.badgeColor || '#e91e8c' }] : [];
                    delete p.badgeText; delete p.badgeColor;
                }
            });

            const el = document.createElement('div');
            el.className = 'card';
            el.style.position = 'relative';
            el.dataset.link = `#${s.code}`;
            el.innerHTML = `
                <div style="font-family:'Orbitron'; font-size:2.5rem; color:var(--accent-pink); margin-bottom:10px">${s.code}</div>
                <div style="color:#eee; font-size:1.1rem; margin-bottom:20px">${s.name}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; color:#bbb; font-size:0.9rem; border-top:1px solid rgba(233,30,140,0.3); padding-top:15px">
                    <span>${s.credits}</span>${s.subCode ? `<span class="subject-code-label">${s.subCode}</span>` : ''}<span>${s.semester}</span>
                </div>`;
            const hideBtn = document.createElement('button');
            hideBtn.className = 'subject-hide-btn';
            hideBtn.innerHTML = '<span class="eye-icon">👁</span>';
            hideBtn.title = 'Hide subject';
            hideBtn.onclick = (ev) => {
                ev.stopPropagation();
                hideSubject(s.code);
            };
            el.appendChild(hideBtn);
            el.onclick = () => showWeeks(s);
            frag.appendChild(el);
        });
        if (grid) grid.appendChild(frag); // single reflow
        renderHiddenSubjectsControls();

        // Show / update exam period button
        const examBtn = document.getElementById('home-exam-btn');
        if (examBtn) {
            const FINALS_MS  = 5 * 24 * 60 * 60 * 1000;
            const MIDTERM_MS = 3 * 24 * 60 * 60 * 1000;
            const finalsOn   = isExamPeriodActive(window.FINAL_DATA,   FINALS_MS);
            const midtermsOn = isExamPeriodActive(window.MIDTERM_DATA, MIDTERM_MS);
            if (finalsOn) {
                examBtn.textContent = '🏁 Final Exams';
                examBtn.style.cssText = 'background:rgba(217,119,6,0.2); border:2px solid #d97706; color:#d97706; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold; text-transform:uppercase; letter-spacing:2px; transition:0.3s;';
                examBtn.onclick = () => showMidterms();
                examBtn.style.display = '';
            } else if (midtermsOn) {
                examBtn.textContent = '📝 Midterms / Finals';
                examBtn.style.cssText = '';  // use .midterm-btn class default
                examBtn.onclick = () => showMidterms();
                examBtn.style.display = '';
            } else {
                examBtn.style.display = 'none';
            }
        }
        
        window.onpopstate = function(event) {
            closeModal(null, true);
            if(event.state) {
                if(event.state.page === 'weeks' || event.state.page === 'content') {
                    if(event.state.subCode) currSub = window.COURSE_DATA.find(s => s.code === event.state.subCode) || null;
                    if(!currSub) { nav('home', false); return; } 
                }
                
                if(event.state.page === 'home') nav('home', false);
                else if(event.state.page === 'recent') nav('recent', false);
                else if(event.state.page === 'schedule') showSchedule(false, event.state.from || 'home');
                else if(event.state.page === 'deadlines') showDeadlines(false);
                else if(event.state.page === 'midterm') showMidterms(false, event.state.from || 'home');
                else if(event.state.page === 'useful-links') showUsefulLinks(false, event.state.filter || currentUsefulFilter, event.state.subject || null);
                else if(event.state.page === 'directory') showDirectory(false);
                else if(event.state.page === 'timetable') showTimetable(false);
                else if(event.state.page === 'gpa') showGpa(false);
                else if(event.state.page === 'updates') showUpdates(false);
                else if(event.state.page === 'weeks') {
                    currentSubjectView = event.state.subView || 'weeks';
                    showWeeks(currSub, false);
                }
                else if(event.state.page === 'content') showContentByObj(event.state.wkObj, false, event.state.from || 'weeks');
            } else {
                nav('home', false);
            }
        };
        if (!history.state) {
            const initialHash = window.location.hash;
            const hasDeepLink = !!initialHash && initialHash !== '#' && initialHash !== '#home';
            if (hasDeepLink) {
                history.replaceState({page: 'home'}, null, window.location.pathname + window.location.search);
                history.pushState({page: 'home'}, null, initialHash);
            } else {
                history.replaceState({page: 'home'}, null, '#home');
            }
        }
        if (!hashRouteListenerBound) {
            window.addEventListener('hashchange', function() {
                if (!window.location.hash || window.location.hash === '#') {
                    nav('home', false);
                    return;
                }
                applyHashRoute();
            });
            hashRouteListenerBound = true;
        }
        applyHashRoute();
        
        // Keep summary/background stats active on startup (urgency, badges, notifications).
        populateAllDropdowns();
        setInterval(populateDeadlinesDropdown, 60000);
        renderQuickActions();
        if (typeof window.NEWS_DATA === 'undefined') window.NEWS_DATA = [];
        renderNewsBtn();
        animateActivePageWaterfall();
        setTimeout(maybeShowNewsToast, 1800);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function parseDateMeta(str) {
        if(!str) return { timestamp: 0, hasTime: false };
        try {
            const normalized = String(str).trim().replace(/\s+/g, ' ');
            if(!normalized) return { timestamp: 0, hasTime: false };

            const m = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i);
            if(!m) return { timestamp: 0, hasTime: false };

            const da = parseInt(m[1], 10);
            const mo = parseInt(m[2], 10) - 1;
            const yr = parseInt(m[3], 10);
            const hasTime = !!m[4];

            let h = 0;
            let mm = 0;
            if(hasTime) {
                h = parseInt(m[4], 10);
                mm = parseInt(m[5] || '0', 10);
                const ampm = (m[6] || '').toUpperCase();
                if(ampm === 'PM' && h < 12) h += 12;
                if(ampm === 'AM' && h === 12) h = 0;
            }

            if(mo < 0 || mo > 11 || da < 1 || da > 31 || h < 0 || h > 23 || mm < 0 || mm > 59) {
                return { timestamp: 0, hasTime: false };
            }

            const d = new Date(yr, mo, da, h, mm, 0, 0);
            if(
                d.getFullYear() !== yr ||
                d.getMonth() !== mo ||
                d.getDate() !== da ||
                d.getHours() !== h ||
                d.getMinutes() !== mm
            ) {
                return { timestamp: 0, hasTime: false };
            }

            return { timestamp: d.getTime(), hasTime };
        } catch(e) {
            return { timestamp: 0, hasTime: false };
        }
    }

    function parseDate(str) {
        return parseDateMeta(str).timestamp;
    }

    function getEndOfDayTimestamp(ts) {
        if(!ts) return 0;
        const d = new Date(ts);
        d.setHours(23, 59, 59, 999);
        return d.getTime();
    }

    function formatRecentDateTime(ts) {
        if(!ts) return '';
        const d = new Date(ts);
        if(isNaN(d.getTime())) return '';
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        let hour = d.getHours();
        const minute = d.getMinutes().toString().padStart(2, '0');
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;
        return `${day}/${month}/${year} ${hour}:${minute} ${ampm}`;
    }

    function formatRecentTimeOnly(ts) {
        if(!ts) return '';
        const d = new Date(ts);
        if(isNaN(d.getTime())) return '';
        let hour = d.getHours();
        const minute = d.getMinutes().toString().padStart(2, '0');
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;
        return `${hour}:${minute} ${ampm}`;
    }

    function formatBatchRange(oldestTs, newestTs) {
        const fromFull = formatRecentDateTime(oldestTs);
        const toFull = formatRecentDateTime(newestTs);
        if(!fromFull || !toFull) return '';

        const oldest = new Date(oldestTs);
        const newest = new Date(newestTs);
        const sameDay =
            oldest.getFullYear() === newest.getFullYear() &&
            oldest.getMonth() === newest.getMonth() &&
            oldest.getDate() === newest.getDate();

        if(sameDay) {
            const toTimeOnly = formatRecentTimeOnly(newestTs);
            return `From ${fromFull} to ${toTimeOnly}`;
        }
        return `From ${fromFull} to ${toFull}`;
    }

    function inferYearFromWeekDate(weekNum, day, month) {
        if(typeof weekNum === 'number' && weekNum > 0) {
            const range = getWeekDates(weekNum);
            if(range && range.start && range.end) {
                const years = [range.start.getFullYear(), range.end.getFullYear()];
                for(let i = 0; i < years.length; i++) {
                    const yr = years[i];
                    const candidate = new Date(yr, month - 1, day, 0, 0, 0, 0);
                    if(candidate.getFullYear() === yr && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
                        if(candidate >= range.start && candidate <= range.end) return yr;
                    }
                }
                return range.start.getFullYear();
            }
        }
        return new Date().getFullYear();
    }

    function parseWhenDeadlineMeta(whenStr, weekNum) {
        if(!whenStr) return { timestamp: 0, hasTime: false };
        try {
            const raw = String(whenStr).trim();
            if(!raw) return { timestamp: 0, hasTime: false };

            const dateMatch = raw.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
            if(!dateMatch) return { timestamp: 0, hasTime: false };

            const day = parseInt(dateMatch[1], 10);
            const month = parseInt(dateMatch[2], 10);
            let year = 0;
            if(dateMatch[3]) {
                year = parseInt(dateMatch[3], 10);
                if(year < 100) year += 2000;
            } else {
                year = inferYearFromWeekDate(weekNum, day, month);
            }

            const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
            const hasTime = !!timeMatch;
            let hh = 0;
            let mm = 0;
            if(hasTime) {
                hh = parseInt(timeMatch[1], 10);
                mm = parseInt(timeMatch[2] || '0', 10);
                const ampm = timeMatch[3].toUpperCase();
                if(ampm === 'PM' && hh < 12) hh += 12;
                if(ampm === 'AM' && hh === 12) hh = 0;
            }

            if(month < 1 || month > 12 || day < 1 || day > 31 || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
                return { timestamp: 0, hasTime: false };
            }

            const d = new Date(year, month - 1, day, hh, mm, 0, 0);
            if(
                d.getFullYear() !== year ||
                d.getMonth() !== month - 1 ||
                d.getDate() !== day ||
                d.getHours() !== hh ||
                d.getMinutes() !== mm
            ) {
                return { timestamp: 0, hasTime: false };
            }

            return { timestamp: d.getTime(), hasTime };
        } catch(e) {
            return { timestamp: 0, hasTime: false };
        }
    }

    function getTaskEffectiveDeadlineMeta(task, weekNum) {
        const fromDeadline = parseDateMeta(task && task.deadlineDate);
        if(fromDeadline.timestamp !== 0) return fromDeadline;
        return parseWhenDeadlineMeta(task && task.when, weekNum);
    }

    function showRecent(subFilter = null) {
        if (subFilter !== null) historySubFilter = subFilter;
        historySubFilter = new Set([...historySubFilter].filter(code => !isSubjectHidden(code)));
        const list = document.getElementById('recent-list');
        list.innerHTML = '';
        let weekItems = [];
        let resItems = [];

        window.COURSE_DATA.forEach(sub => {
            if (isSubjectHidden(sub.code)) return;
            const combinedLists = [...(sub.weeks || []), ...(sub.events || [])];
            combinedLists.forEach(wk => {
                if(wk.isRecent) {
                    weekItems.push({ type: 'week', subName: sub.name, subCode: sub.code, wkObj: wk, dateStr: wk.recentDate || "", timestamp: parseDate(wk.recentDate) });
                }
                if(wk.resources) {
                    Object.keys(wk.resources).forEach(k => {
                        const res = wk.resources[k];
                        if(res.isRecent && res.vis) {
                            resItems.push({ type: 'res', subName: sub.name, subCode: sub.code, wkObj: wk, wkTitle: wk.title, resName: k, dateStr: res.recentDate || "", timestamp: parseDate(res.recentDate) });
                        }
                    });
                }
            });
        });

        // Group resource items that are within the same day of each other
        resItems.sort((a, b) => b.timestamp - a.timestamp);
        const BATCH_GAP_MS = 24 * 60 * 60 * 1000; // 24 hours — batch grouping window (unchanged)
        const THREE_HOURS_MS = 3 * 60 * 60 * 1000; // 3 hours — week absorption window

        // Build a lookup of week isRecent timestamps so resources that fall
        // within 3h of their own week's full-update timestamp get absorbed into
        // the week card rather than appearing as separate batch/single entries.
        const weekTimestampByObj = {};
        weekItems.forEach(w => {
            if (w.timestamp > 0) weekTimestampByObj[w.wkObj] = w.timestamp;
        });

        // Filter out resources that are within 3h of their own week's timestamp
        const standaloneResItems = resItems.filter(item => {
            const weekTs = weekTimestampByObj[item.wkObj];
            if (!weekTs) return true; // no week timestamp — show independently
            return Math.abs(item.timestamp - weekTs) > THREE_HOURS_MS;
        });

        let resGroups = [];
        standaloneResItems.forEach(item => {
            if(resGroups.length === 0) {
                resGroups.push([item]);
            } else {
                const lastGroup = resGroups[resGroups.length - 1];
                const lastItem = lastGroup[lastGroup.length - 1];
                // Items are sorted newest-first, so lastItem.timestamp <= item before it
                if(lastItem.timestamp - item.timestamp <= BATCH_GAP_MS) {
                    lastGroup.push(item);
                } else {
                    resGroups.push([item]);
                }
            }
        });

        // Build final display items: weeks stay individual, resource groups become single entries
        let displayItems = [];
        weekItems.forEach(w => displayItems.push({ type: 'week', item: w, timestamp: w.timestamp }));
        resGroups.forEach(group => {
            const newest = group[0];
            if(group.length === 1) {
                displayItems.push({ type: 'res-single', item: newest, timestamp: newest.timestamp });
            } else {
                displayItems.push({ type: 'res-batch', items: group, timestamp: newest.timestamp, dateStr: newest.dateStr });
            }
        });
        displayItems.sort((a, b) => b.timestamp - a.timestamp);

        // Build compact subject filter chips
        const allSubCodes = new Set();
        displayItems.forEach(e => {
            const code = e.type === 'week' ? e.item.subCode : (e.type === 'res-single' ? e.item.subCode : (e.items ? e.items[0].subCode : null));
            if (code) allSubCodes.add(code);
        });

        if (allSubCodes.size > 1) {
            const anyFilter = historySubFilter.size > 0;
            const section = document.createElement('div');
            section.className = 'fp-bar-section';
            section.dataset.historyFilterSection = '1';
            section.style.marginBottom = '0px'; // let natural grid gap handle spacing

            const togBtn = document.createElement('button');
            togBtn.className = 'fp-toggle' + (anyFilter ? ' has-filter open' : '');
            if (anyFilter) {
                if (historySubFilter.size === 1) {
                    const col = getSubjectColor([...historySubFilter][0]);
                    togBtn.innerHTML = `Subject: <span class="fp-active-label">${[...historySubFilter][0]}</span> <span class="fp-arrow">▲</span>`;
                    togBtn.style.cssText = `border-color:${col}; color:${col}; background:${col}22; box-shadow:0 0 12px ${col}44;`;
                } else {
                    const names = [...historySubFilter].join(', ');
                    togBtn.innerHTML = `Subject: <span class="fp-active-label">${names}</span> <span class="fp-arrow">▲</span>`;
                    togBtn.style.cssText = `border-color:#c4b5db; color:#c4b5db; background:rgba(196,181,219,0.12); box-shadow:0 0 12px rgba(196,181,219,0.3);`;
                }
            } else {
                togBtn.innerHTML = `Subject <span class="fp-arrow">▼</span>`;
            }

            const bar = document.createElement('div');
            bar.className = 'fp-bar-collapsible fp-inline-bar' + (fpOpenState.history ? ' open' : '');

            const refreshHistoryTog = () => {
                const open = bar.classList.contains('open');
                const arrow = open ? '▲' : '▼';
                if (historySubFilter.size === 0) {
                    togBtn.className = 'fp-toggle' + (open ? ' open' : '');
                    togBtn.innerHTML = `Subject <span class="fp-arrow">${arrow}</span>`;
                    togBtn.style.cssText = '';
                } else if (historySubFilter.size === 1) {
                    const col = getSubjectColor([...historySubFilter][0]);
                    togBtn.className = 'fp-toggle has-filter' + (open ? ' open' : '');
                    togBtn.innerHTML = `Subject: <span class="fp-active-label">${[...historySubFilter][0]}</span> <span class="fp-arrow">${arrow}</span>`;
                    togBtn.style.cssText = `border-color:${col}; color:${col}; background:${col}22; box-shadow:0 0 12px ${col}44;`;
                } else {
                    const names = [...historySubFilter].join(', ');
                    togBtn.className = 'fp-toggle has-filter' + (open ? ' open' : '');
                    togBtn.innerHTML = `Subject: <span class="fp-active-label">${names}</span> <span class="fp-arrow">${arrow}</span>`;
                    togBtn.style.cssText = `border-color:#c4b5db; color:#c4b5db; background:rgba(196,181,219,0.12); box-shadow:0 0 12px rgba(196,181,219,0.3);`;
                }
            };

            const refreshHistoryChips = () => {
                bar.querySelectorAll('.fp-chip').forEach(b => {
                    const code = b.dataset.code;
                    if (code === '') {
                        const isAll = historySubFilter.size === 0;
                        b.classList.toggle('active', isAll);
                        b.style.cssText = isAll ? 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;' : '';
                    } else {
                        const act = historySubFilter.has(code);
                        b.classList.toggle('active', act);
                        const col = getSubjectColor(code);
                        b.style.cssText = act ? `background:${getSubjectBg(code)}; border-color:${col}; color:${col};` : '';
                    }
                });
            };

            const allChip = document.createElement('button');
            allChip.className = 'fp-chip' + (historySubFilter.size === 0 ? ' active' : '');
            allChip.textContent = 'All';
            allChip.dataset.code = '';
            if (historySubFilter.size === 0) allChip.style.cssText = 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;';
            allChip.onclick = () => {
                historySubFilter.clear();
                refreshHistoryChips();
                refreshHistoryTog();
                renderHistoryCards(list, displayWithFilteredBatch, displayItems);
            };
            bar.appendChild(allChip);

            allSubCodes.forEach(code => {
                const color = getSubjectColor(code);
                const chip = document.createElement('button');
                chip.className = 'fp-chip' + (historySubFilter.has(code) ? ' active' : '');
                chip.textContent = code;
                chip.dataset.code = code;
                if (historySubFilter.has(code)) chip.style.cssText = `background:${getSubjectBg(code)}; border-color:${color}; color:${color};`;
                chip.onclick = () => {
                    if (historySubFilter.has(code)) historySubFilter.delete(code); else historySubFilter.add(code);
                    refreshHistoryChips();
                    refreshHistoryTog();
                    renderHistoryCards(list, displayWithFilteredBatch, displayItems);
                };
                bar.appendChild(chip);
            });

            togBtn.addEventListener('click', () => {
                const isOpen = bar.classList.contains('open');
                bar.classList.toggle('open', !isOpen);
                togBtn.classList.toggle('open', !isOpen);
                fpOpenState.history = !isOpen;
                refreshHistoryTog();
            });

            section.appendChild(togBtn);
            section.appendChild(bar);
            list.appendChild(section);
        }

        const filteredDisplay = historySubFilter.size === 0 ? displayItems : displayItems.filter(e => {
            if (e.type === 'week') return historySubFilter.has(e.item.subCode);
            if (e.type === 'res-single') return historySubFilter.has(e.item.subCode);
            if (e.type === 'res-batch') return e.items.some(i => historySubFilter.has(i.subCode));
            return true;
        });

        const displayWithFilteredBatch = filteredDisplay.map(e => {
            if (e.type === 'res-batch' && historySubFilter.size > 0) {
                const filtered = e.items.filter(i => historySubFilter.has(i.subCode));
                if (filtered.length === 1) return { type: 'res-single', item: filtered[0], timestamp: filtered[0].timestamp };
                return { ...e, items: filtered };
            }
            return e;
        });

        if(displayWithFilteredBatch.length === 0) {
            list.innerHTML += `<div style="text-align:center; color:#666; margin-top:50px">No history found for this subject.</div>`;
        } else {
            displayWithFilteredBatch.forEach(entry => {
                const el = document.createElement('div');
                el.className = 'recent-card';

                if(entry.type === 'week') {
                    const item = entry.item;
                    el.dataset.link = buildWeekHash(item.subCode, item.wkObj, false);
                    el.onclick = () => { currSub = window.COURSE_DATA.find(s => s.code === item.subCode); showContentByObj(item.wkObj, true, 'recent'); };
                    let resList = "";
                    if(item.wkObj.resources) {
                        const keys = window.CONFIG && window.CONFIG.resources ? window.CONFIG.resources.map(r=>r.name) : Object.keys(item.wkObj.resources);
                        keys.forEach(k => {
                            if(item.wkObj.resources[k] && item.wkObj.resources[k].vis && !item.wkObj.resources[k].isRecent) {
                                resList += `<div style="margin-top:4px;">${iconMap[k]||'📂'} ${k}</div>`;
                            }
                        });
                    }
                    el.innerHTML = `
                        <div class="recent-header"><span>${item.subName} - ${item.wkObj.title}</span><span class="recent-time">${item.dateStr}</span></div>
                        <div style="margin-top:5px; color:#888; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">Full Update Includes:</div>
                        <div class="recent-sub">${resList}</div>
                    `;
                } else if(entry.type === 'res-single') {
                    const item = entry.item;
                    el.dataset.link = buildWeekHash(item.subCode, item.wkObj, false);
                    el.onclick = () => { currSub = window.COURSE_DATA.find(s => s.code === item.subCode); showContentByObj(item.wkObj, true, 'recent'); };
                    el.innerHTML = `
                        <div class="recent-header"><span>${item.subName} - ${item.wkObj.title}</span><span class="recent-time">${item.dateStr}</span></div>
                        <div class="recent-sub" style="margin-top:10px;">New Upload: <strong style="color:white">${item.resName}</strong></div>
                        <div class="recent-icons">${iconMap[item.resName] || "📂"}</div>
                    `;
                } else if(entry.type === 'res-batch') {
                    const items = entry.items;
                    el.style.cursor = 'default';
                    const newestTs = items.length > 0 ? items[0].timestamp : 0;
                    const oldestTs = items.length > 0 ? items[items.length - 1].timestamp : 0;
                    const batchRangeText = formatBatchRange(oldestTs, newestTs);
                    const header = document.createElement('div');
                    header.innerHTML = `
                        <div class="recent-header"><span>📦 Batch Update — ${items.length} Resources</span><span class="recent-time">${entry.dateStr}</span></div>
                        ${batchRangeText ? `<div style="margin-top:4px; color:#9fb8dc; font-size:0.78rem; line-height:1.35;">${batchRangeText}</div>` : ''}
                        <div style="margin-top:8px; color:#888; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">Includes:</div>
                    `;
                    el.appendChild(header);
                    items.forEach(r => {
                        const subColor = getSubjectColor(r.subCode);
                        const subBg = getSubjectBg(r.subCode);
                        const singleEditTime = formatRecentDateTime(r.timestamp) || r.dateStr || '';
                        const row = document.createElement('div');
                        row.style.cssText = `display:flex; align-items:center; gap:10px; margin-top:8px; padding:8px 12px; border-radius:10px; background:rgba(0,0,0,0.2); cursor:pointer; transition:0.2s; border-left:3px solid ${subColor};`;
                        row.innerHTML = `
                            <span style="font-size:1.2rem;">${iconMap[r.resName] || '📂'}</span>
                            <span style="background:${subBg}; color:${subColor}; font-size:0.7rem; font-weight:bold; padding:2px 8px; border-radius:6px;">${r.subCode}</span>
                            <span style="color:#aaa; font-size:0.85rem;">${r.wkTitle}</span>
                            <span style="color:white; font-weight:600; font-size:0.9rem; flex:1;">${r.resName}</span>
                            <span style="color:#9fb8dc; font-size:0.73rem; white-space:nowrap;">${singleEditTime}</span>
                        `;
                        row.dataset.link = buildWeekHash(r.subCode, r.wkObj, false);
                        row.addEventListener('click', (e) => {
                            e.stopPropagation();
                            currSub = window.COURSE_DATA.find(s => s.code === r.subCode);
                            showContentByObj(r.wkObj, true, 'recent');
                        });
                        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.06)'; row.style.transform = 'translateX(4px)'; });
                        row.addEventListener('mouseleave', () => { row.style.background = 'rgba(0,0,0,0.2)'; row.style.transform = 'translateX(0)'; });
                        el.appendChild(row);
                    });
                }
                list.appendChild(el);
            });
        }
        nav('recent');
    }

    function updateHistoryFilterUI(section) {
        // Filter UI is now updated inline via refreshHistoryChips / refreshHistoryTog
    }

    function renderHistoryCards(list, displayWithFilteredBatch, displayItems) {
        // Keep the filter section, remove everything else
        const filterSection = list.querySelector('[data-history-filter-section]');
        Array.from(list.children).forEach(child => {
            if (child !== filterSection) child.remove();
        });
        const filteredDisplay = historySubFilter.size === 0 ? displayItems : displayItems.filter(e => {
            if (e.type === 'week') return historySubFilter.has(e.item.subCode);
            if (e.type === 'res-single') return historySubFilter.has(e.item.subCode);
            if (e.type === 'res-batch') return e.items.some(i => historySubFilter.has(i.subCode));
            return true;
        });
        const toRender = filteredDisplay.map(e => {
            if (e.type === 'res-batch' && historySubFilter.size > 0) {
                const filtered = e.items.filter(i => historySubFilter.has(i.subCode));
                if (filtered.length === 1) return { type: 'res-single', item: filtered[0], timestamp: filtered[0].timestamp };
                return { ...e, items: filtered };
            }
            return e;
        });
        if (toRender.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center; color:#666; margin-top:50px';
            empty.textContent = 'No history found for this subject.';
            list.appendChild(empty);
        } else {
            _appendHistoryEntries(list, toRender);
        }
    }

    function _appendHistoryEntries(list, entries) {
        // Inline version of the render loop from showRecent
        entries.forEach(entry => {
            const el = document.createElement('div');
            el.className = 'recent-card';
            if (entry.type === 'week') {
                const item = entry.item;
                el.dataset.link = buildWeekHash(item.subCode, item.wkObj, false);
                el.onclick = () => { currSub = window.COURSE_DATA.find(s => s.code === item.subCode); showContentByObj(item.wkObj, true, 'recent'); };
                let resList = '';
                if (item.wkObj.resources) {
                    const keys = window.CONFIG && window.CONFIG.resources ? window.CONFIG.resources.map(r=>r.name) : Object.keys(item.wkObj.resources);
                    keys.forEach(k => { if(item.wkObj.resources[k] && item.wkObj.resources[k].vis && !item.wkObj.resources[k].isRecent) resList += `<div style="margin-top:4px;">${iconMap[k]||'📂'} ${k}</div>`; });
                }
                el.innerHTML = `<div class="recent-header"><span>${item.subName} - ${item.wkObj.title}</span><span class="recent-time">${item.dateStr}</span></div><div style="margin-top:5px; color:#888; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">Full Update Includes:</div><div class="recent-sub">${resList}</div>`;
            } else if (entry.type === 'res-single') {
                const item = entry.item;
                el.dataset.link = buildWeekHash(item.subCode, item.wkObj, false);
                el.onclick = () => { currSub = window.COURSE_DATA.find(s => s.code === item.subCode); showContentByObj(item.wkObj, true, 'recent'); };
                el.innerHTML = `<div class="recent-header"><span>${item.subName} - ${item.wkObj.title}</span><span class="recent-time">${item.dateStr}</span></div><div class="recent-sub" style="margin-top:10px;">New Upload: <strong style="color:white">${item.resName}</strong></div><div class="recent-icons">${iconMap[item.resName] || "📂"}</div>`;
            } else if (entry.type === 'res-batch') {
                const items = entry.items;
                el.style.cursor = 'default';
                const newestTs = items.length > 0 ? items[0].timestamp : 0;
                const oldestTs = items.length > 0 ? items[items.length-1].timestamp : 0;
                const batchRangeText = formatBatchRange(oldestTs, newestTs);
                const header = document.createElement('div');
                header.innerHTML = `<div class="recent-header"><span>📦 Batch Update — ${items.length} Resources</span><span class="recent-time">${entry.dateStr}</span></div>${batchRangeText?`<div style="margin-top:4px; color:#9fb8dc; font-size:0.78rem; line-height:1.35;">${batchRangeText}</div>`:''}<div style="margin-top:8px; color:#888; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px;">Includes:</div>`;
                el.appendChild(header);
                items.forEach(r => {
                    const subColor = getSubjectColor(r.subCode), subBg = getSubjectBg(r.subCode);
                    const singleEditTime = formatRecentDateTime(r.timestamp) || r.dateStr || '';
                    const row = document.createElement('div');
                    row.style.cssText = `display:flex; align-items:center; gap:10px; margin-top:8px; padding:8px 12px; border-radius:10px; background:rgba(0,0,0,0.2); cursor:pointer; transition:0.2s; border-left:3px solid ${subColor};`;
                    row.innerHTML = `<span style="font-size:1.2rem;">${iconMap[r.resName]||'📂'}</span><span style="background:${subBg}; color:${subColor}; font-size:0.7rem; font-weight:bold; padding:2px 8px; border-radius:6px;">${r.subCode}</span><span style="color:#aaa; font-size:0.85rem;">${r.wkTitle}</span><span style="color:white; font-weight:600; font-size:0.9rem; flex:1;">${r.resName}</span><span style="color:#9fb8dc; font-size:0.73rem; white-space:nowrap;">${singleEditTime}</span>`;
                    row.dataset.link = buildWeekHash(r.subCode, r.wkObj, false);
                    row.addEventListener('click', e => { e.stopPropagation(); currSub = window.COURSE_DATA.find(s => s.code === r.subCode); showContentByObj(r.wkObj, true, 'recent'); });
                    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.06)'; row.style.transform = 'translateX(4px)'; });
                    row.addEventListener('mouseleave', () => { row.style.background = 'rgba(0,0,0,0.2)'; row.style.transform = 'translateX(0)'; });
                    el.appendChild(row);
                });
            }
            list.appendChild(el);
        });
    }

    function getSubjectColor(code) { 
        if(window.COURSE_DATA) { const s = window.COURSE_DATA.find(x => x.code === code); if(s && s.color) return s.color; }
        const fallback = { 'CA': '#ff9500', 'DSA': '#34c759', 'DB': '#007aff', 'OS': '#ff2d55', 'CN': '#af52de', 'AI': '#B388FF' };
        return fallback[code] || '#e91e8c'; 
    }
    
    function getSubjectBg(code) { 
        const hex = getSubjectColor(code); let c; 
        if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){ 
            c = hex.substring(1).split(''); if(c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]]; c = '0x'+c.join(''); 
            return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+',0.2)'; 
        } 
        return 'rgba(233,30,140,0.2)';
    }

    // --- DEADLINES LOGIC ---
    function showDeadlines(push = true, typeFilter = null, subFilter = null) {
        if (typeFilter !== null && typeFilter !== 'all') {
            if (typeFilter instanceof Set) deadlineTypeFilter = typeFilter;
            else { deadlineTypeFilter = new Set(); } // 'all' or null = clear
        } else if (typeFilter === 'all') {
            deadlineTypeFilter = new Set();
        }
        if (subFilter !== null && subFilter !== 'All') {
            if (subFilter instanceof Set) deadlineSubFilter = subFilter;
            else { deadlineSubFilter = new Set(); }
        } else if (subFilter === 'All') {
            deadlineSubFilter = new Set();
        }

        const ongoingContainer = document.getElementById('ongoing-container');
        const ongoingList = document.getElementById('ongoing-list');
        const upList = document.getElementById('upcoming-list');
        const compList = document.getElementById('completed-list');
        const unschContainer = document.getElementById('unscheduled-container');
        const unschList = document.getElementById('unscheduled-list');
        ongoingList.innerHTML = '';
        ongoingContainer.style.display = 'none';
        upList.innerHTML = '';
        compList.innerHTML = '';
        unschList.innerHTML = '';
        unschContainer.style.display = 'none';

        let ongoing = [];
        let upcoming = [];
        let completed = [];
        let unscheduled = [];
        const now = Date.now();

        window.SCHEDULE_DATA.forEach((wk, wIndex) => {
            const tasks = wk.tasks || [];
            if(tasks.length) {
                tasks.forEach((t, tIndex) => {
                    if (isSubjectHidden(t.sub)) return;
                    const parsedStart = getTaskEffectiveDeadlineMeta(t, wk.week);
                    const tsStart = parsedStart.timestamp;
                    const hasExplicitTime = parsedStart.hasTime;
                    const compareStartTs = tsStart ? (hasExplicitTime ? tsStart : getEndOfDayTimestamp(tsStart)) : 0;
                    const signature = buildScheduleDeadlineSignature(wIndex, tIndex, wk.week, t);
                    const manualState = getDeadlineState(signature);

                    if (manualState === 'completed' || manualState === 'hidden') {
                        completed.push({
                            source: 'schedule',
                            wIndex,
                            tIndex,
                            task: t,
                            week: wk.week,
                            timestamp: tsStart || Date.now(),
                            hasExplicitTime,
                            deadlineSignature: signature,
                            manualState,
                            canRestore: true
                        });
                        return;
                    }

                    if(t.isCompleted) {
                        if(tsStart !== 0) completed.push({ source: 'schedule', wIndex, tIndex, task: t, week: wk.week, timestamp: tsStart, hasExplicitTime, deadlineSignature: signature, canRestore: compareStartTs >= now });
                        return;
                    }
                    if(tsStart === 0) { unscheduled.push({ source: 'schedule', wIndex, tIndex, task: t, week: wk.week, deadlineSignature: signature }); return; }

                    if(t.deadlineEndDate && t.deadlineEndDate.trim() !== '') {
                        const parsedEnd = parseDateMeta(t.deadlineEndDate);
                        const tsEnd = parsedEnd.timestamp;
                        if(tsEnd !== 0 && tsEnd > tsStart) {  // only valid if end is genuinely after start
                            const compareEndTs = parsedEnd.hasTime ? tsEnd : getEndOfDayTimestamp(tsEnd);
                            if(now >= tsStart && now <= compareEndTs) {
                                ongoing.push({ source: 'schedule', wIndex, tIndex, task: t, week: wk.week, timestamp: tsStart, endTimestamp: tsEnd, hasExplicitTime, endHasExplicitTime: parsedEnd.hasTime, deadlineSignature: signature });
                                return;
                            } else if(now > compareEndTs) {
                                completed.push({ source: 'schedule', wIndex, tIndex, task: t, week: wk.week, timestamp: tsEnd, hasExplicitTime: parsedEnd.hasTime, deadlineSignature: signature, canRestore: false });
                                return;
                            }
                        }
                    }

                    const isPast = compareStartTs < now;
                    const item = { source: 'schedule', wIndex, tIndex, task: t, week: wk.week, timestamp: tsStart, hasExplicitTime, deadlineSignature: signature };
                    if(isPast) completed.push(item);
                    else upcoming.push(item);
                });
            }
        });

        (window.NEWS_DATA || []).forEach((n, newsIndex) => {
            if (!n || !n.hasDeadline) return;
            if (n.sub && isSubjectHidden(n.sub)) return;
            const ts = parseNewsDeadlineTs(n.deadlineDate, n.deadlineTime);
            const signature = buildNewsDeadlineSignature(newsIndex, n);
            const manualState = getDeadlineState(signature);

            if (manualState === 'completed' || manualState === 'hidden') {
                completed.push({
                    source: 'news',
                    newsIndex,
                    task: { icon: n.emoji || '📢', name: n.title || 'Announcement', sub: n.sub || 'NEWS' },
                    week: 'News',
                    timestamp: ts || Date.now(),
                    hasExplicitTime: !!(n.deadlineTime && String(n.deadlineTime).trim() !== ''),
                    deadlineSignature: signature,
                    manualState,
                    canRestore: ts === 0 || ts >= now
                });
                return;
            }

            if (ts === 0) {
                unscheduled.push({
                    source: 'news',
                    newsIndex,
                    task: { icon: n.emoji || '📢', name: n.title || 'Announcement', sub: n.sub || 'NEWS' },
                    week: 'News',
                    deadlineSignature: signature
                });
                return;
            }
            const item = {
                source: 'news',
                newsIndex,
                task: { icon: n.emoji || '📢', name: n.title || 'Announcement', sub: n.sub || 'NEWS' },
                week: 'News',
                timestamp: ts,
                hasExplicitTime: !!(n.deadlineTime && String(n.deadlineTime).trim() !== ''),
                deadlineSignature: signature
            };
            if (ts >= now) upcoming.push(item);
        });

        ongoing.sort((a, b) => a.timestamp - b.timestamp);
        upcoming.sort((a, b) => a.timestamp - b.timestamp);
        completed.sort((a, b) => b.timestamp - a.timestamp);

        // ── Build collapsible filter panel (only when not called from chip tap) ──
        if (!_dlSkipFilterRebuild) {
        const filterBarEl = document.getElementById('deadlines-filter-bar');
        if (filterBarEl) {
            filterBarEl.innerHTML = '';

            const typeChips = [
                { key: 'quiz',       label: '🧠 Quizzes',    color: '#af52de' },
                { key: 'assignment', label: '📝 Assignments', color: '#007aff' },
                { key: 'project',    label: '🚀 Projects',    color: '#34c759' },
                { key: 'news',       label: '📢 News',        color: '#e91e8c' }
            ];

            const subCodesSet = new Set();
            [...ongoing, ...upcoming, ...completed, ...unscheduled].forEach(item => {
                if (item.task && item.task.sub && item.task.sub !== 'NEWS') subCodesSet.add(item.task.sub);
            });
            const hasMultipleSubs = subCodesSet.size > 1;

            const anyActive = deadlineTypeFilter.size > 0 || deadlineSubFilter.size > 0;
            const isOpen = fpOpenState.deadlines;

            const togBtn = document.createElement('button');
            const getTogLabel = (open) => {
                const active = deadlineTypeFilter.size > 0 || deadlineSubFilter.size > 0;
                if (active) {
                    const parts = [];
                    deadlineTypeFilter.forEach(k => { const c = typeChips.find(t=>t.key===k); if(c) parts.push(c.label.replace(/^\S+\s/,'')); });
                    deadlineSubFilter.forEach(s => parts.push(s));
                    return `Filter: <span class="fp-active-label">${parts.join(', ')}</span> <span class="fp-arrow">${open ? '▲' : '▼'}</span>`;
                }
                return `Filter <span class="fp-arrow">${open ? '▲' : '▼'}</span>`;
            };
            togBtn.className = 'fp-toggle' + (anyActive ? ' has-filter' : '') + (isOpen ? ' open' : '');
            togBtn.innerHTML = getTogLabel(isOpen);
            filterBarEl.appendChild(togBtn);

            const collapsible = document.createElement('div');
            collapsible.className = 'fp-bar-collapsible' + (isOpen ? ' open' : '');
            collapsible.style.cssText = 'flex-direction:column; gap:0; margin-top:8px; margin-bottom:18px; align-items:stretch;';

            const refreshTog = () => {
                const open = collapsible.classList.contains('open');
                const active = deadlineTypeFilter.size > 0 || deadlineSubFilter.size > 0;
                togBtn.className = 'fp-toggle' + (active ? ' has-filter' : '') + (open ? ' open' : '');
                togBtn.innerHTML = getTogLabel(open);
            };

            const outerBar = document.createElement('div');
            outerBar.style.cssText = 'background:rgba(8,2,18,0.7); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:10px 18px; display:flex; flex-direction:column; gap:10px;';

            // ROW 1 — TYPE chips (multi-select)
            const dlTypeRowWrapper = document.createElement('div');
            dlTypeRowWrapper.style.cssText = 'display:flex; align-items:center; gap:10px;';
            const dlTypeRowLabel = document.createElement('span');
            dlTypeRowLabel.textContent = 'Types';
            dlTypeRowLabel.style.cssText = 'font-size:0.58rem; font-weight:700; color:rgba(196,181,219,0.45); text-transform:uppercase; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; min-width:46px;';
            const typeRow = document.createElement('div');
            typeRow.style.cssText = 'flex:1; display:flex; flex-wrap:wrap; justify-content:center; gap:8px; align-items:center;';
            const refreshTypeChips = () => {
                typeRow.querySelectorAll('.fp-chip').forEach(b => {
                    const k = b.dataset.key;
                    const act = deadlineTypeFilter.has(k);
                    b.classList.toggle('active', act);
                    const c = typeChips.find(t=>t.key===k);
                    b.style.cssText = act && c ? `background:${c.color}22; border-color:${c.color}; color:${c.color}; box-shadow:0 0 10px ${c.color}55;` : '';
                });
            };
            typeChips.forEach(chip => {
                const btn = document.createElement('button');
                btn.className = 'fp-chip' + (deadlineTypeFilter.has(chip.key) ? ' active' : '');
                btn.textContent = chip.label;
                btn.dataset.key = chip.key;
                if (deadlineTypeFilter.has(chip.key)) btn.style.cssText = `background:${chip.color}22; border-color:${chip.color}; color:${chip.color}; box-shadow:0 0 10px ${chip.color}55;`;
                btn.addEventListener('click', () => {
                    if (deadlineTypeFilter.has(chip.key)) deadlineTypeFilter.delete(chip.key); else deadlineTypeFilter.add(chip.key);
                    refreshTypeChips();
                    refreshTog();
                    renderDeadlineContent();
                });
                typeRow.appendChild(btn);
            });
            dlTypeRowWrapper.appendChild(dlTypeRowLabel);
            dlTypeRowWrapper.appendChild(typeRow);
            outerBar.appendChild(dlTypeRowWrapper);

            // ROW 2 — SUBJECT chips (multi-select, if multiple)
            if (hasMultipleSubs) {
                const rowDivider = document.createElement('div');
                rowDivider.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:0 -4px;';
                outerBar.appendChild(rowDivider);

                const dlSubRowWrapper = document.createElement('div');
                dlSubRowWrapper.style.cssText = 'display:flex; align-items:center; gap:10px;';
                const dlSubRowLabel = document.createElement('span');
                dlSubRowLabel.textContent = 'Subjects';
                dlSubRowLabel.style.cssText = 'font-size:0.58rem; font-weight:700; color:rgba(196,181,219,0.45); text-transform:uppercase; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; min-width:46px;';
                const subRow = document.createElement('div');
                subRow.style.cssText = 'flex:1; display:flex; flex-wrap:wrap; justify-content:center; gap:8px; align-items:center;';

                const refreshSubChips = () => {
                    subRow.querySelectorAll('.fp-chip').forEach(b => {
                        const k = b.dataset.key;
                        if (k === '__all__') {
                            const isAll = deadlineSubFilter.size === 0;
                            b.classList.toggle('active', isAll);
                            b.style.cssText = isAll ? 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;' : '';
                        } else {
                            const act = deadlineSubFilter.has(k);
                            b.classList.toggle('active', act);
                            const col = getSubjectColor(k);
                            b.style.cssText = act ? `background:${col}22; border-color:${col}; color:${col}; box-shadow:0 0 10px ${col}55;` : '';
                        }
                    });
                    // Single-subject color on toggle button
                    if (deadlineSubFilter.size === 1) {
                        const col = getSubjectColor([...deadlineSubFilter][0]);
                        togBtn.style.cssText = `border-color:${col}; color:${col}; background:${col}22; box-shadow:0 0 12px ${col}44;`;
                    } else {
                        togBtn.style.cssText = '';
                    }
                };

                const allSubBtn = document.createElement('button');
                allSubBtn.className = 'fp-chip' + (deadlineSubFilter.size === 0 ? ' active' : '');
                allSubBtn.textContent = 'All';
                allSubBtn.dataset.key = '__all__';
                if (deadlineSubFilter.size === 0) allSubBtn.style.cssText = 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;';
                allSubBtn.addEventListener('click', () => {
                    deadlineSubFilter.clear();
                    refreshSubChips();
                    refreshTog();
                    renderDeadlineContent();
                });
                subRow.appendChild(allSubBtn);

                subCodesSet.forEach(code => {
                    const color = getSubjectColor(code);
                    const btn = document.createElement('button');
                    btn.className = 'fp-chip' + (deadlineSubFilter.has(code) ? ' active' : '');
                    btn.textContent = code;
                    btn.dataset.key = code;
                    if (deadlineSubFilter.has(code)) btn.style.cssText = `background:${color}22; border-color:${color}; color:${color}; box-shadow:0 0 10px ${color}55;`;
                    btn.addEventListener('click', () => {
                        if (deadlineSubFilter.has(code)) deadlineSubFilter.delete(code); else deadlineSubFilter.add(code);
                        refreshSubChips();
                        refreshTog();
                        renderDeadlineContent();
                    });
                    subRow.appendChild(btn);
                });
                dlSubRowWrapper.appendChild(dlSubRowLabel);
                dlSubRowWrapper.appendChild(subRow);
                outerBar.appendChild(dlSubRowWrapper);

                // Apply single-subject color on initial render
                if (deadlineSubFilter.size === 1) {
                    const col = getSubjectColor([...deadlineSubFilter][0]);
                    togBtn.style.cssText = `border-color:${col}; color:${col}; background:${col}22; box-shadow:0 0 12px ${col}44;`;
                }
            }

            // Clear all button
            const dlClearDivider = document.createElement('div');
            dlClearDivider.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:0 -4px;';
            outerBar.appendChild(dlClearDivider);
            const dlClearRow = document.createElement('div');
            dlClearRow.style.cssText = 'display:flex; justify-content:center;';
            const dlClearBtn = document.createElement('button');
            dlClearBtn.className = 'fp-clear-btn';
            dlClearBtn.innerHTML = '✕ Clear all filters';
            dlClearBtn.addEventListener('click', () => {
                deadlineTypeFilter.clear();
                deadlineSubFilter.clear();
                showDeadlines(false);
            });
            dlClearRow.appendChild(dlClearBtn);
            outerBar.appendChild(dlClearRow);
            const syncDlClear = () => {
                const active = deadlineTypeFilter.size > 0 || deadlineSubFilter.size > 0;
                dlClearDivider.style.display = active ? '' : 'none';
                dlClearRow.style.display = active ? 'flex' : 'none';
            };
            syncDlClear();
            collapsible.appendChild(outerBar);

            outerBar.addEventListener('click', () => { setTimeout(syncDlClear, 0); });

            togBtn.addEventListener('click', () => {
                const nowOpen = collapsible.classList.contains('open');
                collapsible.classList.toggle('open', !nowOpen);
                fpOpenState.deadlines = !nowOpen;
                refreshTog();
            });

            filterBarEl.appendChild(collapsible);
        } // end if(filterBarEl)
        } // end if(!_dlSkipFilterRebuild)

        const applyDeadlineFilters = (arr) => {
            return arr.filter(item => {
                // Type filter (OR across selected types)
                if (deadlineTypeFilter.size > 0) {
                    const isNews = item.source === 'news';
                    const cat = isNews ? 'news' : getTaskTypeCategory(item.task.name);
                    if (!deadlineTypeFilter.has(cat)) return false;
                }
                // Subject filter (OR across selected subjects)
                if (deadlineSubFilter.size > 0) {
                    if (!deadlineSubFilter.has(item.task.sub)) return false;
                }
                return true;
            });
        }

        const filteredOngoing     = applyDeadlineFilters(ongoing);
        const filteredUpcoming    = applyDeadlineFilters(upcoming);
        const filteredCompleted   = applyDeadlineFilters(completed);
        const filteredUnscheduled = applyDeadlineFilters(unscheduled);

        function buildDeadlineCardAttrs(item, isComp) {
            const source = item.source === 'news' ? 'news' : 'schedule';
            const wIndex = Number.isInteger(item.wIndex) ? item.wIndex : -1;
            const tIndex = Number.isInteger(item.tIndex) ? item.tIndex : -1;
            const newsIndex = Number.isInteger(item.newsIndex) ? item.newsIndex : -1;
            const stage = isComp ? 'completed' : 'active';
            return `data-dl-source="${source}" data-dl-stage="${stage}" data-dl-w="${wIndex}" data-dl-t="${tIndex}" data-dl-news="${newsIndex}"`;
        }

        if (filteredOngoing.length > 0) {
            ongoingContainer.style.display = 'block';
        }

        function getGroupedHtml(arr, isComp) {
            if (arr.length === 0) return `<div class="empty-state">${isComp ? 'No completed tasks yet.' : 'Hooray! No upcoming deadlines.'}</div>`;
            
            let html = '';
            let lastDate = '';
            const now = Date.now();
            
            arr.forEach(item => {
                const d = new Date(item.timestamp);
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                
                const dayStr = days[d.getDay()];
                const dateStr = `${d.getDate()} ${months[d.getMonth()]}`;
                const groupLabel = `${dayStr} · ${dateStr}`;
                const hasExplicitTime = !!item.hasExplicitTime;
                
                let timeStr = '';
                if (hasExplicitTime) {
                    let h = d.getHours();
                    const m = d.getMinutes().toString().padStart(2, '0');
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    h = h % 12 || 12;
                    timeStr = `${h}:${m} ${ampm}`;
                }

                let subName = item.source === 'news' ? 'News Announcement' : item.task.sub;
                if(window.COURSE_DATA && item.source !== 'news') {
                    const sObj = window.COURSE_DATA.find(s => s.code === item.task.sub);
                    if(sObj) subName = sObj.name;
                }

                if (groupLabel !== lastDate) {
                    html += `<div style="font-family: 'Orbitron', sans-serif; font-size: 1.1rem; letter-spacing: 2px; color: ${isComp ? '#888' : 'var(--accent-blue)'}; text-transform: uppercase; margin-bottom: 10px; margin-top: ${lastDate===''?'10px':'30px'}; padding-left: 2px; font-weight: bold;">${groupLabel}</div>`;
                    lastDate = groupLabel;
                }

                const accentColor = isComp ? '#555' : getSubjectColor(item.task.sub);
                const bgColor = isComp ? '#333' : getSubjectBg(item.task.sub);
                const badgeTextColor = isComp ? '#aaa' : getSubjectColor(item.task.sub);

                let countdownHtml = '';
                if (!isComp && hasExplicitTime) {
                    const diffMs = item.timestamp - now;
                    if (diffMs > 0) {
                        let timeRemaining = '';
                        if (diffMs < 60 * 1000) {
                            const s = Math.floor(diffMs / 1000);
                            timeRemaining = `${s}s`;
                        } else if (diffMs < 60 * 60 * 1000) {
                            const m = Math.floor(diffMs / 60000);
                            const s = Math.floor((diffMs % 60000) / 1000);
                            timeRemaining = `${m}m ${s}s`;
                        } else if (diffMs < 24 * 60 * 60 * 1000) {
                            const h = Math.floor(diffMs / (60 * 60 * 1000));
                            const m = Math.floor((diffMs % (60 * 60 * 1000)) / 60000);
                            timeRemaining = `${h}h ${m}m`;
                        } else {
                            const totalHours = diffMs / (1000 * 60 * 60);
                            const fullDays = Math.floor(totalHours / 24);
                            const remainHours = totalHours - fullDays * 24;
                            const daysRounded = remainHours >= 16 ? fullDays + 1 : fullDays;
                            timeRemaining = `${daysRounded} day${daysRounded !== 1 ? 's' : ''}`;
                        }
                        countdownHtml = `<div style="font-size: 0.75rem; color: #00E5FF; font-weight: bold; background: rgba(0, 229, 255, 0.1); padding: 4px 8px; border-radius: 6px; display: inline-block; margin-top: 6px; border: 1px solid rgba(0, 229, 255, 0.2);">⏳ ${timeRemaining} left</div>`;
                    } else {
                        countdownHtml = `<div style="font-size: 0.75rem; color: #ff3b30; font-weight: bold; background: rgba(255, 59, 48, 0.1); padding: 4px 8px; border-radius: 6px; display: inline-block; margin-top: 6px; border: 1px solid rgba(255, 59, 48, 0.2);">⚠️ Overdue</div>`;
                    }
                }

                const rightColumnHtml = hasExplicitTime
                    ? `<div style="font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 700; color: ${isComp ? '#888' : 'white'}; white-space: nowrap;">${timeStr}</div>${countdownHtml}`
                    : '';

                const onClick = isComp
                    ? 'event.stopPropagation();'
                    : (item.source === 'news' ? 'openNewsPanel()' : `goToScheduleTask(${item.wIndex}, ${item.tIndex})`);
                const cardAttrs = buildDeadlineCardAttrs(item, isComp);
                html += `
                    <div class="card deadline-action-card ${isComp ? 'completed' : ''}" ${cardAttrs} style="border-left: 4px solid ${accentColor}; flex-direction: row; cursor: ${isComp ? 'default' : 'pointer'}; padding: 14px 18px; margin-bottom: 10px; display: flex; align-items: center;" onclick="${onClick}">
                        <span class="sub-badge" style="background: ${bgColor}; color: ${badgeTextColor}; min-width: 52px; font-size: 0.72rem; padding: 5px 10px; border-radius:8px;">${item.task.sub}</span>
                        <div style="flex: 1; margin-left: 15px;">
                            <div class="dl-text" style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${item.task.icon} ${item.task.name}</div>
                            <div class="dl-text" style="font-size: 0.78rem; color: var(--text-sub); margin-top: 2px;">${subName}${item.source === 'news' ? '' : ` • Week ${item.week}`}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end;">
                            ${rightColumnHtml}
                        </div>
                    </div>
                `;
            });
            return html;
        }

        // Render ongoing tasks
        if(filteredOngoing.length > 0) {
            ongoingContainer.style.display = 'block';
            let ongoingHtml = '';
            filteredOngoing.forEach(item => {
                let subName = item.task.sub;
                if(window.COURSE_DATA) {
                    const sObj = window.COURSE_DATA.find(s => s.code === item.task.sub);
                    if(sObj) subName = sObj.name;
                }
                const accentColor = getSubjectColor(item.task.sub);
                const bgColor = getSubjectBg(item.task.sub);

                const endD = new Date(item.endTimestamp);
                const endDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                const endMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const endsStr = `${endDays[endD.getDay()]} ${endD.getDate()} ${endMonths[endD.getMonth()]}`;

                const remainMs = item.endTimestamp - now;
                const daysLeft = (() => {
                    const totalHours = remainMs / (1000 * 60 * 60);
                    const fullDays = Math.floor(totalHours / 24);
                    const remainHours = totalHours - fullDays * 24;
                    return remainHours >= 16 ? fullDays + 1 : fullDays;
                })();
                const totalSecsLeft = Math.floor(remainMs / 1000);
                const daysLabel = (() => {
                    if (remainMs <= 0) return 'ending now';
                    if (remainMs < 60 * 1000) {
                        // Under 1 minute — show seconds
                        return `${totalSecsLeft}s left`;
                    }
                    if (remainMs < 60 * 60 * 1000) {
                        // Under 1 hour — show minutes and seconds
                        const m = Math.floor(remainMs / 60000);
                        const s = Math.floor((remainMs % 60000) / 1000);
                        return `${m}m ${s}s left`;
                    }
                    if (remainMs < 24 * 60 * 60 * 1000) {
                        // Under 24 hours — show hours and minutes
                        const h = Math.floor(remainMs / (60 * 60 * 1000));
                        const m = Math.floor((remainMs % (60 * 60 * 1000)) / 60000);
                        return `${h}h ${m}m left`;
                    }
                    // 24h or more — use day rounding
                    return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
                })();

                ongoingHtml += `
                    <div class="card deadline-action-card" ${buildDeadlineCardAttrs(item, false)} style="border-left: 4px solid #af52de; flex-direction: row; cursor: pointer; padding: 14px 18px; margin-bottom: 10px; display: flex; align-items: center; background: linear-gradient(135deg, rgba(175,82,222,0.15), var(--card-bg)); box-shadow: 0 0 20px rgba(175,82,222,0.1);" onclick="goToScheduleTask(${item.wIndex}, ${item.tIndex})">
                        <span class="sub-badge" style="background: ${bgColor}; color: ${accentColor}; min-width: 52px; font-size: 0.72rem; padding: 5px 10px; border-radius:8px;">${item.task.sub}</span>
                        <div style="flex: 1; margin-left: 15px;">
                            <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${item.task.icon} ${item.task.name}</div>
                            <div style="font-size: 0.78rem; color: var(--text-sub); margin-top: 2px;">${subName} • Week ${item.week}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end;">
                            <div style="font-size: 0.75rem; color: #af52de; font-weight: bold; background: rgba(175,82,222,0.15); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(175,82,222,0.3); white-space:nowrap;">🔄 ONGOING</div>
                            <div style="font-size: 0.7rem; color: #aaa; margin-top: 4px; white-space:nowrap;">Until ${endsStr} · ${daysLabel}</div>
                        </div>
                    </div>
                `;
            });
            ongoingList.innerHTML = ongoingHtml;
        }

        upList.innerHTML = getGroupedHtml(filteredUpcoming, false);
        compList.innerHTML = getGroupedHtml(filteredCompleted, true);

        if(filteredUnscheduled.length > 0) {
            unschContainer.style.display = 'block';
            let unschHtml = '';
            filteredUnscheduled.forEach(item => {
                let subName = item.source === 'news' ? 'News Announcement' : item.task.sub;
                if(window.COURSE_DATA && item.source !== 'news') {
                    const sObj = window.COURSE_DATA.find(s => s.code === item.task.sub);
                    if(sObj) subName = sObj.name;
                }
                const accentColor = getSubjectColor(item.task.sub);
                const bgColor = getSubjectBg(item.task.sub);
                const onClick = item.source === 'news' ? 'openNewsPanel()' : `goToScheduleTask(${item.wIndex}, ${item.tIndex})`;
                unschHtml += `
                    <div class="card deadline-action-card" ${buildDeadlineCardAttrs(item, false)} style="border-left: 4px solid ${accentColor}; flex-direction: row; cursor: pointer; padding: 14px 18px; margin-bottom: 10px; display: flex; align-items: center; opacity:0.75;" onclick="${onClick}">
                        <span class="sub-badge" style="background: ${bgColor}; color: ${accentColor}; min-width: 52px; font-size: 0.72rem; padding: 5px 10px; border-radius:8px;">${item.task.sub}</span>
                        <div style="flex: 1; margin-left: 15px;">
                            <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${item.task.icon} ${item.task.name}</div>
                            <div style="font-size: 0.78rem; color: var(--text-sub); margin-top: 2px;">${subName}${item.source === 'news' ? '' : ` • Week ${item.week}`}</div>
                        </div>
                        <div style="font-size: 0.75rem; color: #ff9500; font-weight: bold; background: rgba(255,149,0,0.1); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,149,0,0.25); white-space:nowrap;">TBD</div>
                    </div>
                `;
            });
            unschList.innerHTML = unschHtml;
        }

        if (currentPageId !== 'deadlines' || push) {
            nav('deadlines', push);
        }
    }

    // Re-renders lists only (skips filter bar rebuild) when a filter chip is tapped
    let _dlSkipFilterRebuild = false;
    function renderDeadlineContent() {
        _dlSkipFilterRebuild = true;
        showDeadlines(false);
        _dlSkipFilterRebuild = false;
    }

    function goToScheduleTask(wIndex, tIndex) {
        showSchedule(true, 'deadlines');
        setTimeout(() => { openModal(wIndex, tIndex); }, 150);
    }

    let deadlineActionMenu = null;
    function closeDeadlineActionMenu() {
        if (deadlineActionMenu) {
            deadlineActionMenu.remove();
            deadlineActionMenu = null;
        }
    }

    function openDeadlineActionMenu(e, card) {
        if (!card) return;
        const source = card.dataset.dlSource || 'schedule';
        const stage = card.dataset.dlStage || 'active';
        const wIndex = parseInt(card.dataset.dlW || '-1', 10);
        const tIndex = parseInt(card.dataset.dlT || '-1', 10);
        const newsIndex = parseInt(card.dataset.dlNews || '-1', 10);

        const actions = [];
        const addAction = (label, fn) => actions.push({ label, fn });

        if (stage === 'completed') {
            addAction('Unhide', () => {
                if (source === 'news') setNewsDeadlineStatus(newsIndex, 'active');
                else setScheduleDeadlineStatus(wIndex, tIndex, 'active');
            });
        } else {
            addAction('Hide', () => {
                if (source === 'news') setNewsDeadlineStatus(newsIndex, 'hidden');
                else setScheduleDeadlineStatus(wIndex, tIndex, 'hidden');
            });
        }

        if (!actions.length) return;

        closeDeadlineActionMenu();
        const menu = document.createElement('div');
        menu.style.cssText = 'position:fixed; z-index:10050; min-width:180px; background:rgba(10,0,18,0.97); border:1px solid rgba(255,255,255,0.14); border-radius:10px; box-shadow:0 16px 36px rgba(0,0,0,0.5); padding:6px;';
        actions.forEach((act, idx) => {
            const btn = document.createElement('button');
            btn.textContent = act.label;
            btn.style.cssText = 'display:block; width:100%; text-align:left; background:transparent; color:#e6e6e6; border:none; padding:9px 11px; border-radius:8px; font-size:0.82rem; cursor:pointer;';
            btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.08)'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
            btn.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                closeDeadlineActionMenu();
                act.fn();
            });
            menu.appendChild(btn);
            if (idx < actions.length - 1) {
                const sep = document.createElement('div');
                sep.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:3px 0;';
                menu.appendChild(sep);
            }
        });
        document.body.appendChild(menu);
        deadlineActionMenu = menu;

        const mw = 190;
        const mh = 44 * actions.length + 14;
        const x = Math.min(e.clientX, window.innerWidth - mw - 8);
        const y = Math.min(e.clientY, window.innerHeight - mh - 8);
        menu.style.left = `${Math.max(6, x)}px`;
        menu.style.top = `${Math.max(6, y)}px`;
    }

    document.addEventListener('contextmenu', function(e) {
        const card = e.target && e.target.closest ? e.target.closest('.deadline-action-card') : null;
        if (!card) {
            closeDeadlineActionMenu();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        openDeadlineActionMenu(e, card);
    }, true);

    let deadlineLongPressTimer = null;
    document.addEventListener('touchstart', function(e) {
        const card = e.target && e.target.closest ? e.target.closest('.deadline-action-card') : null;
        if (!card || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault() {}, stopPropagation() {} };
        deadlineLongPressTimer = setTimeout(() => {
            openDeadlineActionMenu(fakeEvent, card);
        }, 520);
    }, { passive: true, capture: true });

    document.addEventListener('touchend', function() {
        if (deadlineLongPressTimer) {
            clearTimeout(deadlineLongPressTimer);
            deadlineLongPressTimer = null;
        }
    }, { passive: true, capture: true });

    document.addEventListener('touchmove', function() {
        if (deadlineLongPressTimer) {
            clearTimeout(deadlineLongPressTimer);
            deadlineLongPressTimer = null;
        }
    }, { passive: true, capture: true });

    document.addEventListener('click', closeDeadlineActionMenu, true);
    document.addEventListener('scroll', closeDeadlineActionMenu, true);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeDeadlineActionMenu(); });

    // --- USEFUL LINKS GLOBAL PAGE ---
    function showUsefulLinks(push = true, filterType = 'All Links', subjectFilter = null, badgeFilters = null) {
        currentUsefulFilter = filterType;
        if (subjectFilter !== null) {
            // Accept a Set, array, or legacy string
            if (subjectFilter instanceof Set) currentUsefulSubject = subjectFilter;
            else if (Array.isArray(subjectFilter)) currentUsefulSubject = new Set(subjectFilter.filter(s => s !== 'All Subjects'));
            else if (subjectFilter === 'All Subjects') currentUsefulSubject = new Set();
            else currentUsefulSubject = new Set([subjectFilter]);
        }
        if (badgeFilters !== null) currentUsefulBadgeFilters = new Set(badgeFilters);
        currentUsefulSubject = new Set([...currentUsefulSubject].filter(code => !isSubjectHidden(code)));

        const filterBar = document.getElementById('useful-links-filter-bar');
        const list = document.getElementById('all-links-list');
        list.innerHTML = '';
        if (!_ulSkipFilterRebuild) filterBar.innerHTML = '';

        let hasLinksAnywhere = false;
        let activeSubjects = [];
        // Collect all unique badge texts across all playlists for current subject filter
        const allBadgeSet = new Map(); // badge text -> badge color

        getVisibleCourseSubjects().forEach(sub => {
            if (sub.playlists && sub.playlists.length > 0) {
                hasLinksAnywhere = true;
                activeSubjects.push(sub);
                if (currentUsefulSubject.size === 0 || currentUsefulSubject.has(sub.code)) {
                    sub.playlists.forEach(p => {
                        (p.badges || []).forEach(b => {
                            if (b.text && b.text.trim()) allBadgeSet.set(b.text.trim(), b.color || '#e91e8c');
                        });
                    });
                }
            }
        });

        if (!hasLinksAnywhere) {
            list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No useful links found.</div>`;
            nav('useful-links', push);
            return;
        }

        // ── Combined Filter toggle (subjects row + badges row) ──
        if (!_ulSkipFilterRebuild) {

        const anySubFilter = currentUsefulSubject.size > 0;
        const anyBadgeFilter = currentUsefulBadgeFilters.size > 0;
        const anyUlActive = anySubFilter || anyBadgeFilter;

        const ulTogBtn = document.createElement('button');
        ulTogBtn.id = 'ul-filter-toggle';
        ulTogBtn.style.cssText = 'display:block; margin:0 auto 8px;';
        const getUlTogLabel = (open) => {
            if (currentUsefulSubject.size > 0 || currentUsefulBadgeFilters.size > 0) {
                const parts = [];
                if (currentUsefulSubject.size === 1) parts.push([...currentUsefulSubject][0]);
                else if (currentUsefulSubject.size > 1) parts.push(`${currentUsefulSubject.size} subjects`);
                if (currentUsefulBadgeFilters.size > 0) parts.push(`${currentUsefulBadgeFilters.size} badge${currentUsefulBadgeFilters.size>1?'s':''}`);
                return `Filter: <span class="fp-active-label">${parts.join(', ')}</span> <span class="fp-arrow">${open ? '▲' : '▼'}</span>`;
            }
            return `Filter <span class="fp-arrow">${open ? '▲' : '▼'}</span>`;
        };
        ulTogBtn.className = 'fp-toggle' + (anyUlActive ? ' has-filter' : '') + (fpOpenState.usefulBadges ? ' open' : '');
        ulTogBtn.innerHTML = getUlTogLabel(fpOpenState.usefulBadges);
        filterBar.appendChild(ulTogBtn);

        const ulCollapsible = document.createElement('div');
        ulCollapsible.className = 'fp-bar-collapsible' + (fpOpenState.usefulBadges ? ' open' : '');
        ulCollapsible.style.cssText = 'flex-direction:column; gap:0; margin-bottom:12px; align-items:stretch;';

        const ulOuterBar = document.createElement('div');
        ulOuterBar.style.cssText = 'background:rgba(8,2,18,0.7); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:10px 18px; display:flex; flex-direction:column; gap:10px;';

        const refreshUlTog = () => {
            const open = ulCollapsible.classList.contains('open');
            const active = currentUsefulSubject.size > 0 || currentUsefulBadgeFilters.size > 0;
            ulTogBtn.className = 'fp-toggle' + (active ? ' has-filter' : '') + (open ? ' open' : '');
            ulTogBtn.innerHTML = getUlTogLabel(open);
        };

        // Helper to sync clear button visibility based on either filter
        const syncUlClear = () => {
            const active = currentUsefulBadgeFilters.size > 0 || currentUsefulSubject.size > 0;
            ulClearDivider.style.display = active ? '' : 'none';
            ulClearRow.style.display = active ? 'flex' : 'none';
        };

        // ROW 1 — Subject chips (multi-select) — wrapped with label
        const subRowWrapper = document.createElement('div');
        subRowWrapper.style.cssText = 'display:flex; align-items:center; gap:10px;';
        const subRowLabel = document.createElement('span');
        subRowLabel.textContent = 'Subjects';
        subRowLabel.style.cssText = 'font-size:0.58rem; font-weight:700; color:rgba(196,181,219,0.45); text-transform:uppercase; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; min-width:46px;';
        const subChipRow = document.createElement('div');
        subChipRow.style.cssText = 'flex:1; display:flex; flex-wrap:wrap; justify-content:center; gap:8px; align-items:center;';

        const refreshUlSubChips = () => {
            subChipRow.querySelectorAll('.fp-chip').forEach(b => {
                const k = b.dataset.key;
                if (k === '__all__') {
                    const isAll = currentUsefulSubject.size === 0;
                    b.classList.toggle('active', isAll);
                    b.style.cssText = isAll ? 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;' : '';
                } else {
                    const act = currentUsefulSubject.has(k);
                    b.classList.toggle('active', act);
                    const col = getSubjectColor(k);
                    b.style.cssText = act ? `background:${getSubjectBg(k)}; border-color:${col}; color:${col};` : '';
                }
            });
        };

        const allSubChip = document.createElement('button');
        allSubChip.className = 'fp-chip' + (currentUsefulSubject.size === 0 ? ' active' : '');
        allSubChip.textContent = 'All';
        allSubChip.dataset.key = '__all__';
        if (currentUsefulSubject.size === 0) allSubChip.style.cssText = 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;';
        allSubChip.addEventListener('click', () => {
            currentUsefulSubject.clear();
            currentUsefulBadgeFilters = new Set();
            refreshUlSubChips();
            refreshUlTog();
            renderUsefulLinksContent();
            if (typeof syncUlClear === 'function') syncUlClear();
        });
        subChipRow.appendChild(allSubChip);
        activeSubjects.forEach(s => {
            const color = getSubjectColor(s.code);
            const btn = document.createElement('button');
            btn.className = 'fp-chip' + (currentUsefulSubject.has(s.code) ? ' active' : '');
            btn.textContent = s.code;
            btn.dataset.key = s.code;
            if (currentUsefulSubject.has(s.code)) btn.style.cssText = `background:${getSubjectBg(s.code)}; border-color:${color}; color:${color};`;
            btn.addEventListener('click', () => {
                if (currentUsefulSubject.has(s.code)) currentUsefulSubject.delete(s.code); else currentUsefulSubject.add(s.code);
                currentUsefulBadgeFilters = new Set();
                refreshUlSubChips();
                refreshUlTog();
                renderUsefulLinksContent();
                if (typeof syncUlClear === 'function') syncUlClear();
            });
            subChipRow.appendChild(btn);
        });
        subRowWrapper.appendChild(subRowLabel);
        subRowWrapper.appendChild(subChipRow);
        ulOuterBar.appendChild(subRowWrapper);

        // ROW 2 — Badge chips (if any badges exist)
        if (allBadgeSet.size > 0) {
            const bdivider = document.createElement('div');
            bdivider.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:0 -4px;';
            ulOuterBar.appendChild(bdivider);

            const badgeRowWrapper = document.createElement('div');
            badgeRowWrapper.style.cssText = 'display:flex; align-items:center; gap:10px;';
            const badgeRowLabel = document.createElement('span');
            badgeRowLabel.textContent = 'Badges';
            badgeRowLabel.style.cssText = 'font-size:0.58rem; font-weight:700; color:rgba(196,181,219,0.45); text-transform:uppercase; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; min-width:46px;';
            const badgeChipRow = document.createElement('div');
            badgeChipRow.style.cssText = 'flex:1; display:flex; flex-wrap:wrap; justify-content:center; gap:8px; align-items:center;';
            allBadgeSet.forEach((color, text) => {
                const isActive = currentUsefulBadgeFilters.has(text);
                const btn = document.createElement('button');
                btn.className = 'fp-chip' + (isActive ? ' active' : '');
                btn.textContent = text;
                btn.dataset.badgeText = text;
                btn.dataset.badgeColor = color;
                if (isActive) btn.style.cssText = `background:${color}33; border-color:${color}; color:${color}; box-shadow:0 0 8px ${color}44;`;
                btn.addEventListener('click', () => {
                    fpOpenState.usefulBadges = true;
                    const next = new Set(currentUsefulBadgeFilters);
                    if (next.has(text)) next.delete(text); else next.add(text);
                    currentUsefulBadgeFilters = next;
                    // Update badge chip styles in-place
                    badgeChipRow.querySelectorAll('.fp-chip').forEach(b => {
                        const bt = b.dataset.badgeText; if (!bt) return;
                        const bc = b.dataset.badgeColor || '#e91e8c';
                        const act = currentUsefulBadgeFilters.has(bt);
                        b.classList.toggle('active', act);
                        b.style.cssText = act ? `background:${bc}33; border-color:${bc}; color:${bc}; box-shadow:0 0 8px ${bc}44;` : '';
                    });
                    ulClearRow.style.display = (currentUsefulBadgeFilters.size > 0 || currentUsefulSubject.size > 0) ? 'flex' : 'none';
                    ulClearDivider.style.display = ulClearRow.style.display;                    refreshUlTog();
                    renderUsefulLinksContent();
                });
                badgeChipRow.appendChild(btn);
            });
            badgeRowWrapper.appendChild(badgeRowLabel);
            badgeRowWrapper.appendChild(badgeChipRow);
            ulOuterBar.appendChild(badgeRowWrapper);
        }

        const ulClearDivider = document.createElement('div');
        ulClearDivider.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:0 -4px; display:' + (anyUlActive ? '' : 'none') + ';';
        ulOuterBar.appendChild(ulClearDivider);
        const ulClearRow = document.createElement('div');
        ulClearRow.style.cssText = 'display:' + (anyUlActive ? 'flex' : 'none') + '; justify-content:center;';
        const ulClearBtn = document.createElement('button');
        ulClearBtn.className = 'fp-clear-btn';
        ulClearBtn.innerHTML = '✕ Clear all filters';
        ulClearBtn.addEventListener('click', () => {
            currentUsefulBadgeFilters = new Set();
            currentUsefulSubject = new Set();
            fpOpenState.usefulBadges = true;
            showUsefulLinks(false);
        });
        ulClearRow.appendChild(ulClearBtn);
        ulOuterBar.appendChild(ulClearRow);

        ulCollapsible.appendChild(ulOuterBar);

        ulTogBtn.addEventListener('click', () => {
            const nowOpen = ulCollapsible.classList.contains('open');
            ulCollapsible.classList.toggle('open', !nowOpen);
            fpOpenState.usefulBadges = !nowOpen;
            refreshUlTog();
        });

        filterBar.appendChild(ulCollapsible);

        } // end !_ulSkipFilterRebuild

        // ── Render links — in same subject-urgency order as homepage ──────────
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.maxWidth = '900px';
        list.style.margin = '0 auto';
        list.style.gap = '0';

        let renderedCount = 0;

        const orderedForLinks = getHomepageOrderedSubjects();
        orderedForLinks.forEach(sub => {
            if (currentUsefulSubject.size > 0 && !currentUsefulSubject.has(sub.code)) return;
            if (!sub.playlists || sub.playlists.length === 0) return;

            let filteredPlaylists = sub.playlists.filter(p => {
                if (currentUsefulBadgeFilters.size === 0) return true;
                // playlist passes if it has ANY of the selected badge filters (OR logic)
                const pBadges = new Set((p.badges || []).map(b => (b.text || '').trim()));
                for (const f of currentUsefulBadgeFilters) {
                    if (pBadges.has(f)) return true;
                }
                return false;
            });

            if (filteredPlaylists.length === 0) return;

            const color = getSubjectColor(sub.code);
            const section = document.createElement('div');
            section.style.cssText = 'margin-bottom:30px;';

            const header = document.createElement('div');
            header.style.cssText = `font-family:'Orbitron',sans-serif; font-size:1.3rem; color:${color}; border-bottom:2px solid ${color}; padding-bottom:10px; margin-bottom:12px; margin-top:10px; display:flex; align-items:center; gap:10px;`;
            header.innerHTML = `${sub.code} — ${sub.name} <span style="font-size:0.6rem; color:${color}; opacity:0.7; font-family:'Segoe UI',sans-serif; font-weight:600; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:6px; margin-left:4px;">${filteredPlaylists.length}</span>`;
            section.appendChild(header);

            const ulRenderItems = [];
            const ulProcessedGroups = new Set();
            filteredPlaylists.forEach(p => {
                const grp = (p.group || '').trim();
                if (grp) {
                    if (!ulProcessedGroups.has(grp)) {
                        ulProcessedGroups.add(grp);
                        ulRenderItems.push({ type: 'group', name: grp, items: filteredPlaylists.filter(gp => (gp.group||'').trim() === grp) });
                    }
                } else {
                    ulRenderItems.push({ type: 'single', playlist: p });
                }
            });

            ulRenderItems.forEach(item => {
                if (item.type === 'single') {
                    renderedCount++;
                    const p = item.playlist;
                    const row = document.createElement('div');
                    row.style.cssText = `display:flex; align-items:center; gap:14px; padding:12px 16px; border-radius:12px; cursor:pointer; transition:all 0.2s; border-left:3px solid ${color}; margin-bottom:8px; background:rgba(0,0,0,0.2);`;
                    row.onmouseenter = () => { row.style.background = 'rgba(255,255,255,0.06)'; row.style.transform = 'translateX(6px)'; };
                    row.onmouseleave = () => { row.style.background = 'rgba(0,0,0,0.2)'; row.style.transform = 'translateX(0)'; };
                    const lbadges = p.badges || (p.badgeText ? [{text:p.badgeText, color:p.badgeColor||'#e91e8c'}] : []);
                    const badgeHtml = lbadges.filter(b=>b.text).map(b => `<span style="background:${b.color||'#e91e8c'}; color:#fff; font-size:0.65rem; padding:2px 7px; border-radius:8px; font-weight:800; letter-spacing:0.5px; flex-shrink:0;">${b.text}</span>`).join('');
                    const noteHtml = p.note ? `<div style="color:var(--text-sub); font-size:0.8rem; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:500px;">${p.note.split('\n')[0]}</div>` : '';
                    row.innerHTML = `<span style="font-size:1.5rem; flex-shrink:0;">${p.icon || '🔗'}</span><div style="flex:1; min-width:0;"><div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;"><span style="font-weight:600; color:white; font-size:0.95rem;">${p.title || 'Link'}</span>${badgeHtml}</div>${noteHtml}</div><span style="color:${color}; font-size:1rem; flex-shrink:0; opacity:0.6;">→</span>`;
                    row.onclick = () => { if(p.link && p.link !== '#' && p.link.trim() !== '') window.open(p.link, '_blank'); else alert('No link assigned.'); };
                    if (p.link && p.link !== '#') row.dataset.link = p.link;
                    section.appendChild(row);
                } else {
                    const gWrap = document.createElement('div');
                    gWrap.style.cssText = `border-left:3px solid ${color}; margin-bottom:8px; border-radius:12px; background:rgba(0,0,0,0.15); overflow:hidden;`;
                    // Collect ALL unique badges across every item in the group
                    const gBadgeMap = new Map();
                    item.items.forEach(p => { (p.badges||[]).filter(b=>b.text).forEach(b => { if(!gBadgeMap.has(b.text)) gBadgeMap.set(b.text, b.color||'#e91e8c'); }); });
                    const gBadgeHtml = [...gBadgeMap.entries()].map(([txt,col]) => `<span style="background:${col}; color:#fff; font-size:0.6rem; padding:2px 7px; border-radius:8px; font-weight:800; letter-spacing:0.5px;">${txt}</span>`).join('');
                    const gHeader = document.createElement('div');
                    gHeader.style.cssText = `display:flex; align-items:center; gap:10px; padding:10px 16px; cursor:pointer; transition:background 0.2s;`;
                    gHeader.onmouseenter = () => { gHeader.style.background = 'rgba(255,255,255,0.04)'; };
                    gHeader.onmouseleave = () => { gHeader.style.background = 'transparent'; };
                    gHeader.innerHTML = `<span style="font-size:1.3rem;">${item.items[0].icon || '🔗'}</span><div style="flex:1; min-width:0;"><div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;"><span style="font-weight:700; color:white; font-size:0.95rem;">${item.name}</span>${gBadgeHtml}<span style="font-size:0.65rem; color:#888; background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:10px;">${item.items.length} links</span></div></div><span class="ul-group-arrow" style="color:${color}; font-size:0.8rem; transition:transform 0.2s;">▼</span>`;
                    gWrap.appendChild(gHeader);
                    const gBody = document.createElement('div');
                    gBody.style.cssText = 'padding:0 8px 8px 8px; display:none;';
                    item.items.forEach(p => {
                        renderedCount++;
                        const subRow = document.createElement('div');
                        subRow.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:8px; cursor:pointer; transition:all 0.15s; margin-bottom:2px;';
                        subRow.onmouseenter = () => { subRow.style.background = 'rgba(255,255,255,0.05)'; subRow.style.transform = 'translateX(4px)'; };
                        subRow.onmouseleave = () => { subRow.style.background = 'transparent'; subRow.style.transform = 'translateX(0)'; };
                        const pBadges = (p.badges||[]).filter(b=>b.text);
                        const pBadgeHtml = pBadges.map(b => `<span style="background:${b.color||'#e91e8c'}; color:#fff; font-size:0.55rem; padding:1px 6px; border-radius:6px; font-weight:800;">${b.text}</span>`).join('');
                        const noteSnip = p.note ? `<div style="color:var(--text-sub); font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.note.split('\n')[0]}</div>` : '';
                        subRow.innerHTML = `<span style="font-size:1rem;">${p.icon || '🔗'}</span><div style="flex:1; min-width:0;"><div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;"><span style="font-weight:600; color:white; font-size:0.85rem;">${p.title || 'Link'}</span>${pBadgeHtml}</div>${noteSnip}</div><span style="color:${color}; opacity:0.4; font-size:0.8rem;">→</span>`;
                        subRow.onclick = () => { if(p.link && p.link !== '#' && p.link.trim() !== '') window.open(p.link, '_blank'); else alert('No link assigned.'); };
                        if (p.link && p.link !== '#') subRow.dataset.link = p.link;
                        gBody.appendChild(subRow);
                    });
                    gWrap.appendChild(gBody);
                    gHeader.onclick = () => {
                        const isOpen = gBody.style.display !== 'none';
                        gBody.style.display = isOpen ? 'none' : 'block';
                        gHeader.querySelector('.ul-group-arrow').style.transform = isOpen ? '' : 'rotate(180deg)';
                    };
                    section.appendChild(gWrap);
                }
            });
            list.appendChild(section);
        });

        if (renderedCount === 0) {
            list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No links match your selected filters.</div>`;
        }

        nav('useful-links', push, { filter: filterType, subject: [...currentUsefulSubject] });
        if (!push) {
            history.replaceState(
                { page: 'useful-links', filter: filterType, subject: [...currentUsefulSubject] },
                null, '#useful-links'
            );
        }
    }

    // Re-renders just the links list (not filter bar) when badge chip is tapped
    let _ulSkipFilterRebuild = false;
    function renderUsefulLinksContent() {
        _ulSkipFilterRebuild = true;
        showUsefulLinks(false, currentUsefulFilter, currentUsefulSubject, Array.from(currentUsefulBadgeFilters));
        _ulSkipFilterRebuild = false;
    }

    // --- SCHEDULE LOGIC ---
    let scheduleViewMode = 'list';
    let scheduleTaskFilter = new Set();
    let scheduleSubFilter = new Set(); // subject filter for schedule
    let calendarMonth = null;
    let calendarAvailableMonths = []; // stored for keyboard nav

    function getTaskTypeCategory(taskName) {
        const n = (taskName || '').toLowerCase();
        if(n.includes('quiz') || n.includes('exam')) return 'quiz';
        if(n.includes('assignment') || n.includes('report') || n.includes('lab')) return 'assignment';
        if(n.includes('project') || n.includes('presentation') || n.includes('submission') || n.includes('mini project')) return 'project';
        return 'other';
    }

    function sortTasksByTime(tasks, weekNum) {
        // Separate tasks with specified time from those without
        const withTime = [];
        const withoutTime = [];
        tasks.forEach((task, origIdx) => {
            const ts = getTaskEffectiveDeadlineMeta(task, weekNum).timestamp;
            if(ts > 0) {
                withTime.push({ task, origIdx, ts });
            } else {
                withoutTime.push({ task, origIdx });
            }
        });
        // Sort tasks with time
        withTime.sort((a, b) => a.ts - b.ts);
        // Return sorted: timed tasks first, then unspecified at the end
        return [...withTime.map(x => ({ task: x.task, origIdx: x.origIdx })), ...withoutTime];
    }

    // Semester week 1 starts Saturday Feb 7, 2026. Weeks run Sat-Fri.
    const SEMESTER_START = new Date(2026, 1, 7); // Feb 7, 2026 (Saturday)
    function getWeekDates(weekNum) {
        // Week 8 (midterms) exception: starts Friday Mar 27, ends Friday Apr 3
        if (weekNum === 8) return { start: new Date(2026, 2, 27), end: new Date(2026, 3, 3) };
        // Check SCHEDULE_DATA for a date override
        if (window.SCHEDULE_DATA) {
            const wk = window.SCHEDULE_DATA.find(w => w.week === weekNum);
            if (wk && wk.dateStart && wk.dateEnd) {
                return { start: new Date(wk.dateStart + 'T00:00:00'), end: new Date(wk.dateEnd + 'T00:00:00') };
            }
        }
        const start = new Date(SEMESTER_START);
        start.setDate(start.getDate() + (weekNum - 1) * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return { start, end };
    }
    function getWeekDateRange(weekNum) {
        const { start, end } = getWeekDates(weekNum);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const fmt = (d) => `${d.getDate()} ${months[d.getMonth()]}`;
        return `[${fmt(start)} — ${fmt(end)}]`;
    }
    function extractTimeFromWhen(when) {
        if (!when) return '';
        const m = when.match(/(\d{1,2}:\d{2}.*)/i);
        return m ? m[1].trim() : '';
    }

    function showSchedule(push = true, from = 'home') {
        renderScheduleContent();
        nav('schedule', push, { from: from });
    }

    function renderScheduleContent() {
        renderScheduleFilters();
        renderScheduleWeeksGrid();
    }

    function renderScheduleFilters() {
        const filterContainer = document.getElementById('schedule-filter-container');
        const viewToggleContainer = document.getElementById('schedule-view-toggle');
        if (!filterContainer || !viewToggleContainer) return;

        viewToggleContainer.innerHTML = '';
        ['📋 List','📅 Calendar'].forEach((label, i) => {
            const mode = i === 0 ? 'list' : 'calendar';
            const btn = document.createElement('button');
            btn.className = 'cal-view-btn' + (scheduleViewMode === mode ? ' active' : '');
            btn.textContent = label;
            btn.addEventListener('click', () => { scheduleViewMode = mode; renderScheduleWeeksGrid(); renderScheduleFilters(); });
            viewToggleContainer.appendChild(btn);
        });

        const subCodes = new Set();
        window.SCHEDULE_DATA.forEach(wk => { getVisibleScheduleTasks(wk.tasks).forEach(t => { if(t.sub) subCodes.add(t.sub); }); });
        const hasMultipleSubs = subCodes.size > 1;

        filterContainer.innerHTML = '';

        const typeChipsData = [
            { key: 'quiz',       label: '🧠 Quizzes',    color: '#af52de' },
            { key: 'assignment', label: '📝 Assignments', color: '#007aff' },
            { key: 'project',    label: '🚀 Projects',    color: '#34c759' }
        ];

        const anyActive = scheduleTaskFilter.size > 0 || scheduleSubFilter.size > 0;
        const isOpen = fpOpenState.schedule;

        const togBtn = document.createElement('button');
        const getTogLabel = (open) => {
            const active = scheduleTaskFilter.size > 0 || scheduleSubFilter.size > 0;
            if (active) {
                const parts = [];
                if (scheduleTaskFilter.size > 0) {
                    scheduleTaskFilter.forEach(k => { const c = typeChipsData.find(t=>t.key===k); if(c) parts.push(c.label.replace(/^\S+\s/,'')); });
                }
                if (scheduleSubFilter.size > 0) { scheduleSubFilter.forEach(s => parts.push(s)); }
                return `Filter: <span class="fp-active-label">${parts.join(', ')}</span> <span class="fp-arrow">${open ? '▲' : '▼'}</span>`;
            }
            return `Filter <span class="fp-arrow">${open ? '▲' : '▼'}</span>`;
        };
        togBtn.className = 'fp-toggle' + (anyActive ? ' has-filter' : '') + (isOpen ? ' open' : '');
        togBtn.innerHTML = getTogLabel(isOpen);
        filterContainer.appendChild(togBtn);

        const collapsible = document.createElement('div');
        collapsible.className = 'fp-bar-collapsible' + (isOpen ? ' open' : '');
        collapsible.style.cssText = 'flex-direction:column; gap:0; margin-top:8px; align-items:stretch;';

        const refreshTog = () => {
            const open = collapsible.classList.contains('open');
            const active = scheduleTaskFilter.size > 0 || scheduleSubFilter.size > 0;
            togBtn.className = 'fp-toggle' + (active ? ' has-filter' : '') + (open ? ' open' : '');
            togBtn.innerHTML = getTogLabel(open);
        };

        const outerBar = document.createElement('div');
        outerBar.style.cssText = 'background:rgba(8,2,18,0.7); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:10px 18px; display:flex; flex-direction:column; gap:10px;';

        // ROW 1 — TYPE chips (multi-select, no "All" chip — empty Set = All)
        const typeRowWrapper = document.createElement('div');
        typeRowWrapper.style.cssText = 'display:flex; align-items:center; gap:10px;';
        const typeRowLabel = document.createElement('span');
        typeRowLabel.textContent = 'Types';
        typeRowLabel.style.cssText = 'font-size:0.58rem; font-weight:700; color:rgba(196,181,219,0.45); text-transform:uppercase; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; min-width:46px;';
        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'flex:1; display:flex; flex-wrap:wrap; justify-content:center; gap:8px; align-items:center;';
        const refreshTypeChips = () => {
            typeRow.querySelectorAll('.fp-chip').forEach(b => {
                const k = b.dataset.key;
                const act = scheduleTaskFilter.has(k);
                b.classList.toggle('active', act);
                const c = typeChipsData.find(t=>t.key===k);
                b.style.cssText = act && c ? `background:${c.color}22; border-color:${c.color}; color:${c.color}; box-shadow:0 0 10px ${c.color}55;` : '';
            });
        };
        typeChipsData.forEach(chip => {
            const btn = document.createElement('button');
            btn.className = 'fp-chip' + (scheduleTaskFilter.has(chip.key) ? ' active' : '');
            btn.textContent = chip.label;
            btn.dataset.key = chip.key;
            if (scheduleTaskFilter.has(chip.key)) btn.style.cssText = `background:${chip.color}22; border-color:${chip.color}; color:${chip.color}; box-shadow:0 0 10px ${chip.color}55;`;
            btn.addEventListener('click', () => {
                if (scheduleTaskFilter.has(chip.key)) scheduleTaskFilter.delete(chip.key); else scheduleTaskFilter.add(chip.key);
                refreshTypeChips();
                refreshTog();
                renderScheduleWeeksGrid();
            });
            typeRow.appendChild(btn);
        });
        typeRowWrapper.appendChild(typeRowLabel);
        typeRowWrapper.appendChild(typeRow);
        outerBar.appendChild(typeRowWrapper);

        // ROW 2 — SUBJECT chips (multi-select, if multiple subjects exist)
        if (hasMultipleSubs) {
            const rowDivider = document.createElement('div');
            rowDivider.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:0 -4px;';
            outerBar.appendChild(rowDivider);

            const subRowWrapper2 = document.createElement('div');
            subRowWrapper2.style.cssText = 'display:flex; align-items:center; gap:10px;';
            const subRowLabel2 = document.createElement('span');
            subRowLabel2.textContent = 'Subjects';
            subRowLabel2.style.cssText = 'font-size:0.58rem; font-weight:700; color:rgba(196,181,219,0.45); text-transform:uppercase; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; min-width:46px;';
            const subRow = document.createElement('div');
            subRow.style.cssText = 'flex:1; display:flex; flex-wrap:wrap; justify-content:center; gap:8px; align-items:center;';

            const refreshSubChips = () => {
                subRow.querySelectorAll('.fp-chip').forEach(b => {
                    const k = b.dataset.key;
                    if (k === '__all__') {
                        const isAll = scheduleSubFilter.size === 0;
                        b.classList.toggle('active', isAll);
                        b.style.cssText = isAll ? 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;' : '';
                    } else {
                        const act = scheduleSubFilter.has(k);
                        b.classList.toggle('active', act);
                        const color = getSubjectColor(k);
                        b.style.cssText = act ? `background:${getSubjectBg(k)}; color:${color}; border-color:${color}; box-shadow:0 0 10px ${color}55;` : '';
                    }
                });
            };

            const allSubBtn = document.createElement('button');
            allSubBtn.className = 'fp-chip' + (scheduleSubFilter.size === 0 ? ' active' : '');
            allSubBtn.textContent = 'All';
            allSubBtn.dataset.key = '__all__';
            if (scheduleSubFilter.size === 0) allSubBtn.style.cssText = 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;';
            allSubBtn.addEventListener('click', () => {
                scheduleSubFilter.clear();
                refreshSubChips();
                refreshTog();
                renderScheduleWeeksGrid();
            });
            subRow.appendChild(allSubBtn);

            subCodes.forEach(code => {
                const color = getSubjectColor(code);
                const btn = document.createElement('button');
                btn.className = 'fp-chip' + (scheduleSubFilter.has(code) ? ' active' : '');
                btn.textContent = code;
                btn.dataset.key = code;
                if (scheduleSubFilter.has(code)) btn.style.cssText = `background:${getSubjectBg(code)}; color:${color}; border-color:${color}; box-shadow:0 0 10px ${color}55;`;
                btn.addEventListener('click', () => {
                    if (scheduleSubFilter.has(code)) scheduleSubFilter.delete(code); else scheduleSubFilter.add(code);
                    refreshSubChips();
                    refreshTog();
                    renderScheduleWeeksGrid();
                });
                subRow.appendChild(btn);
            });
            subRowWrapper2.appendChild(subRowLabel2);
            subRowWrapper2.appendChild(subRow);
            outerBar.appendChild(subRowWrapper2);
        }

        // Clear all button
        const scClearDivider = document.createElement('div');
        scClearDivider.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:0 -4px;';
        outerBar.appendChild(scClearDivider);
        const scClearRow = document.createElement('div');
        scClearRow.style.cssText = 'display:flex; justify-content:center;';
        const scClearBtn = document.createElement('button');
        scClearBtn.className = 'fp-clear-btn';
        scClearBtn.innerHTML = '✕ Clear all filters';
        scClearBtn.addEventListener('click', () => {
            scheduleTaskFilter.clear();
            scheduleSubFilter.clear();
            renderScheduleFilters();
            renderScheduleWeeksGrid();
        });
        scClearRow.appendChild(scClearBtn);
        outerBar.appendChild(scClearRow);
        const syncScClear = () => {
            const active = scheduleTaskFilter.size > 0 || scheduleSubFilter.size > 0;
            scClearDivider.style.display = active ? '' : 'none';
            scClearRow.style.display = active ? 'flex' : 'none';
        };
        syncScClear();
        collapsible.appendChild(outerBar);

        outerBar.addEventListener('click', () => { setTimeout(syncScClear, 0); });

        togBtn.addEventListener('click', () => {
            const nowOpen = collapsible.classList.contains('open');
            collapsible.classList.toggle('open', !nowOpen);
            fpOpenState.schedule = !nowOpen;
            refreshTog();
        });

        filterContainer.appendChild(collapsible);
    }

    function renderScheduleWeeksGrid() {
        const grid = document.getElementById('deliverables-grid');
        grid.innerHTML = '';

        if (scheduleViewMode === 'calendar') {
            // Force a single full-width column so the calendar is never squashed
            // regardless of which filter is active. Inline style overrides any
            // class-based grid-template-columns that could auto-fill narrower columns.
            grid.className = 'grid';
            grid.style.gridTemplateColumns = '1fr';
            renderCalendarView(grid);
            return;
        }

        // Restore multi-column layout for list view
        grid.className = 'grid weeks-grid';
        grid.style.gridTemplateColumns = '';

        // List view
        const todayDate = new Date();
        window.SCHEDULE_DATA.forEach((data, wIndex) => {
            const card = document.createElement('div');
            const isMidtermWk = data.isMidterm || false;
            const isFinalsWk  = data.isFinals  || false;
            const isSpecialWk = isMidtermWk || isFinalsWk;

            // Check if today falls within this week's date range
            const { start: wkStart, end: wkEnd } = getWeekDates(data.week);
            const isCurrentWeek = todayDate >= wkStart && todayDate <= wkEnd;
            
            // Filter and sort tasks
            let filteredTasks = (data.tasks || []).map((t, i) => ({task: t, origIdx: i})).filter(x => !isSubjectHidden(x.task.sub));
            if(scheduleTaskFilter.size > 0) {
                filteredTasks = filteredTasks.filter(x => scheduleTaskFilter.has(getTaskTypeCategory(x.task.name)));
            }
            if(scheduleSubFilter.size > 0) {
                filteredTasks = filteredTasks.filter(x => scheduleSubFilter.has(x.task.sub));
            }

            // Sort by time
            const sortedEntries = sortTasksByTime(filteredTasks.map(x => x.task), data.week);
            const displayTasks = sortedEntries.map(se => {
                const match = filteredTasks.find(ft => ft.task === se.task);
                return match || { task: se.task, origIdx: se.origIdx };
            });

            const isEmpty = displayTasks.length === 0;
            const isHighLoad = !isEmpty && displayTasks.length >= 4;
            
            card.className = "card" + (isEmpty && !isSpecialWk ? " locked" : "");

            // ── Color priority: custom > finals > midterms > current > default ──
            if (data.cardColor) {
                const hex = data.cardColor;
                const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
                card.style.borderColor = hex;
                card.style.background = `linear-gradient(135deg,rgba(${r},${g},${b},0.35),rgba(${r},${g},${b},0.12))`;
                card.style.boxShadow  = `0 10px 30px rgba(${r},${g},${b},0.25)`;
                if (isSpecialWk) {
                    card.style.cursor = 'pointer';
                    card.onclick = () => openExamViewFromSchedule(isFinalsWk ? 'finals' : 'midterms');
                }
            } else if (isFinalsWk) {
                card.style.borderColor = '#d97706';
                card.style.background = 'linear-gradient(135deg,rgba(217,119,6,0.4),rgba(120,20,0,0.6))';
                card.style.boxShadow = '0 10px 30px rgba(217,119,6,0.3)';
                card.style.cursor = 'pointer';
                card.onclick = () => openExamViewFromSchedule('finals');
            } else if (isMidtermWk) {
                card.style.borderColor = '#007aff';
                card.style.background = 'linear-gradient(135deg,rgba(0,122,255,0.4),rgba(0,60,150,0.6))';
                card.style.boxShadow = '0 10px 30px rgba(0,122,255,0.3)';
                card.style.cursor = 'pointer';
                card.onclick = () => openExamViewFromSchedule('midterms');
            } else if (isCurrentWeek) {
                card.style.borderColor = '#ff3b30';
                card.style.background = 'linear-gradient(135deg,rgba(255,59,48,0.08),var(--card-bg))';
                card.style.boxShadow = '0 0 20px rgba(255,59,48,0.15)';
            } else {
                card.style.borderColor = 'rgba(233,30,140,0.2)';
                card.style.background = 'var(--card-bg)';
            }

            const isWhiteText = isSpecialWk || !!data.cardColor;
            
            let tasksHtml = '';
            if (isEmpty) {
                const emptyMsg = isFinalsWk ? 'Click here to view finals' : (isMidtermWk ? 'Click here to view exams' : 'No deliverables scheduled');
                tasksHtml = `<div class="empty-state" style="color:${isWhiteText?'#fff':'#666'}">${emptyMsg}</div>`;
            } else {
                displayTasks.forEach(entry => {
                    const task = entry.task;
                    tasksHtml += `
                        <div class="task-item" style="border-left-color:${getSubjectColor(task.sub)};${isWhiteText?'background:rgba(0,0,0,0.4);':''}" onclick="event.stopPropagation();openModal(${wIndex},${entry.origIdx})">
                            <span class="sub-badge" style="background:${getSubjectBg(task.sub)};color:${getSubjectColor(task.sub)}">${task.sub}</span>
                            <span class="task-icon">${task.icon}</span>
                            <span class="task-name" style="${isWhiteText?'color:#fff;':''}">${task.name}</span>
                        </div>`;
                });
            }

            let badgeHtml = '';
            if (!isEmpty) {
                const plural = displayTasks.length > 1 ? 'Tasks' : 'Task';
                badgeHtml = `<div class="${isHighLoad?'total-badge high-load':'total-badge'}" style="${isWhiteText?'border-color:#fff;color:#fff;background:rgba(0,0,0,0.3);box-shadow:none;':''}">${displayTasks.length} ${plural}</div>`;
            } else {
                badgeHtml = `<div class="total-badge" style="border-color:${isWhiteText?'#fff':'#555'};color:${isWhiteText?'#fff':'#888'};${isWhiteText?'background:rgba(0,0,0,0.3);':''}">0 Tasks</div>`;
            }
            
            const noteHtml = (data.note && data.note.trim())
                ? `<div style="font-size:0.9rem;color:${isWhiteText?'#fff':'var(--accent-pink)'};font-weight:bold;margin-top:5px;">${data.note}</div>` : '';

            const dateRangeHtml = `<div style="font-size:0.75rem;color:${isWhiteText?'rgba(255,255,255,0.7)':'#888'};margin-top:4px;letter-spacing:0.5px;">${getWeekDateRange(data.week)}</div>`;

            const periodLabel = (data.currentLabel && data.currentLabel.trim()) ? data.currentLabel.trim().toUpperCase() : 'CURRENT WEEK';
            const currentWeekBadge = isCurrentWeek
                ? `<div style="font-size:0.65rem;font-weight:800;color:#ff3b30;background:rgba(255,59,48,0.15);border:1px solid rgba(255,59,48,0.3);padding:3px 10px;border-radius:8px;letter-spacing:1.5px;margin-top:6px;display:inline-block;">📍 ${periodLabel}</div>` : '';

            const weekTitle = (data.weekName && data.weekName.trim()) ? data.weekName.trim().toUpperCase() : 'WEEK ' + data.week;
            const h2Color = isCurrentWeek && !isSpecialWk ? '#ff3b30' : (isWhiteText ? '#fff' : 'var(--accent-purple)');
            card.dataset.week = String(data.week);

            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:10px;">
                    <div>
                        <h2 style="font-family:'Orbitron';color:${h2Color};font-size:1.5rem;margin:0;">${weekTitle}</h2>
                        ${dateRangeHtml}${noteHtml}${currentWeekBadge}
                    </div>
                    ${badgeHtml}
                </div>
                <div class="task-list">${tasksHtml}</div>
            `;
            grid.appendChild(card);
        });

        applyWaterfallToContainer(grid, '.card');
    }

    function renderCalendarView(grid) {
        // Collect dated + undated tasks
        const tasksByDate = {};
        const tbdTasksByWeek = {};
        window.SCHEDULE_DATA.forEach((wk, wIndex) => {
            if(!wk.tasks) return;
            wk.tasks.forEach((t, tIndex) => {
                if (isSubjectHidden(t.sub)) return;
                if(scheduleTaskFilter.size > 0 && !scheduleTaskFilter.has(getTaskTypeCategory(t.name))) return;
                if(scheduleSubFilter.size > 0 && !scheduleSubFilter.has(t.sub)) return;
                const ts = getTaskEffectiveDeadlineMeta(t, wk.week).timestamp;
                if(ts === 0) {
                    // Undated / TBD task
                    if(!tbdTasksByWeek[wIndex]) tbdTasksByWeek[wIndex] = [];
                    tbdTasksByWeek[wIndex].push({ task: t, wIndex, tIndex });
                    return;
                }
                const d = new Date(ts);
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                if(!tasksByDate[key]) tasksByDate[key] = [];
                tasksByDate[key].push({ task: t, wIndex, tIndex });
            });
        });

        // Find available months from ALL tasks (unfiltered) so months never disappear when filtering
        const monthSet = new Set();
        window.SCHEDULE_DATA.forEach(wk => {
            if (!wk.tasks) return;
            wk.tasks.forEach(t => {
                if (isSubjectHidden(t.sub)) return;
                const ts = getTaskEffectiveDeadlineMeta(t, wk.week).timestamp;
                if (ts !== 0) {
                    const d = new Date(ts);
                    monthSet.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
                } else {
                    // TBD task — include its week's months
                    const { start, end } = getWeekDates(wk.week);
                    monthSet.add(`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`);
                    monthSet.add(`${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}`);
                }
            });
        });
        // Always include the current real-time month
        const nowForMonths = new Date();
        monthSet.add(`${nowForMonths.getFullYear()}-${String(nowForMonths.getMonth()+1).padStart(2,'0')}`);
        const availableMonths = [...monthSet].sort();
        calendarAvailableMonths = availableMonths; // store for keyboard nav

        const hasTbd = Object.keys(tbdTasksByWeek).length > 0;
        
        if(availableMonths.length === 0 && !hasTbd) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.cssText = 'grid-column:1/-1; text-align:center; color:#666; margin-top:30px; font-style:italic;';
            emptyDiv.textContent = 'No tasks to display in calendar.';
            grid.appendChild(emptyDiv);
            return;
        }

        // Auto-select current month or first available
        if(!calendarMonth || !availableMonths.includes(calendarMonth)) {
            const now = new Date();
            const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
            calendarMonth = availableMonths.includes(curKey) ? curKey : (availableMonths[0] || null);
        }

        const calContainer = document.createElement('div');
        calContainer.className = 'calendar-container';
        // Force full width regardless of parent grid state or content
        calContainer.style.cssText = 'width:100%; box-sizing:border-box;';

        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        let calInner = '';

        if(calendarMonth && availableMonths.length > 0) {
            const curIdx = availableMonths.indexOf(calendarMonth);
            const [yr, mo] = calendarMonth.split('-').map(Number);

            let navHtml = `<div class="cal-month-nav">`;
            navHtml += curIdx > 0 ? `<button onclick="calendarMonth='${availableMonths[curIdx-1]}'; renderScheduleContent();">← Prev</button>` : `<button style="visibility:hidden;">←</button>`;
            navHtml += `<div class="cal-month-label">${monthNames[mo-1]} ${yr}</div>`;
            navHtml += curIdx < availableMonths.length-1 ? `<button onclick="calendarMonth='${availableMonths[curIdx+1]}'; renderScheduleContent();">Next →</button>` : `<button style="visibility:hidden;">→</button>`;
            navHtml += `</div>`;

            const firstDay = new Date(yr, mo-1, 1).getDay();
            const daysInMonth = new Date(yr, mo, 0).getDate();
            const today = new Date();
            const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

            const dayHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            let calHtml = `<div class="cal-grid">`;
            dayHeaders.forEach(d => { calHtml += `<div class="cal-day-header">${d}</div>`; });

            const semStartDate = window.CONFIG && window.CONFIG.semesterStart ? new Date(window.CONFIG.semesterStart + 'T00:00:00') : null;
            // Calculate leading empty cells: day-of-week offset + any pre-semester days
            let leadingEmpties = firstDay;
            if (semStartDate) {
                for (let d = 1; d <= daysInMonth; d++) {
                    const thisDate = new Date(yr, mo-1, d);
                    if (thisDate < semStartDate) leadingEmpties++;
                    else break;
                }
            }
            for(let i = 0; i < leadingEmpties; i++) {
                calHtml += `<div class="cal-day empty"></div>`;
            }
            for(let d = 1; d <= daysInMonth; d++) {
                const thisDate = new Date(yr, mo-1, d);
                if(semStartDate && thisDate < semStartDate) {
                    continue; // already accounted for in leadingEmpties, skip rendering
                }
                const dateKey = `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const isToday = dateKey === todayKey;
                calHtml += `<div class="cal-day ${isToday?'today':''}">`;
                calHtml += `<div class="cal-day-num">${d}</div>`;
                if(tasksByDate[dateKey]) {
                    tasksByDate[dateKey].forEach(item => {
                        const color = getSubjectColor(item.task.sub);
                        const bg = getSubjectBg(item.task.sub);
                        const timeStr = extractTimeFromWhen(item.task.when);
                        const timeHtml = timeStr ? `<div style="font-size:0.55rem; opacity:0.85; margin-top:1px;">🕒 ${timeStr}</div>` : '';
                        const subLabel = `<span style="font-size:0.5rem; font-weight:900; opacity:0.75; letter-spacing:0.3px; margin-right:2px;">[${item.task.sub}]</span>`;
                        calHtml += `<div class="cal-task" style="background:${bg}; color:${color}; border-left:2px solid ${color};" onclick="openModal(${item.wIndex}, ${item.tIndex})" title="${item.task.sub}: ${item.task.name}${timeStr ? ' — '+timeStr : ''}">${subLabel}${item.task.icon} ${item.task.name}${timeHtml}</div>`;
                    });
                }
                calHtml += `</div>`;
            }
            calHtml += `</div>`;
            calInner += navHtml + calHtml;
        }

        // TBD (undated) tasks section — only show weeks overlapping with displayed month
        if(hasTbd && calendarMonth) {
            const [tbdYr, tbdMo] = calendarMonth.split('-').map(Number);
            const monthStart = new Date(tbdYr, tbdMo - 1, 1);
            const monthEnd = new Date(tbdYr, tbdMo, 0); // last day of month
            const weekIndices = Object.keys(tbdTasksByWeek).map(Number).sort((a,b) => a - b).filter(wIdx => {
                const wk = window.SCHEDULE_DATA[wIdx];
                const { start, end } = getWeekDates(wk.week);
                return start <= monthEnd && end >= monthStart;
            });
            if(weekIndices.length > 0) {
                let tbdHtml = `<div class="cal-tbd-section">`;
                tbdHtml += `<div class="cal-tbd-title">📌 To Be Determined (date not set)</div>`;
                weekIndices.forEach(wIdx => {
                    const wk = window.SCHEDULE_DATA[wIdx];
                    tbdHtml += `<div class="cal-tbd-week">`;
                    tbdHtml += `<div class="cal-tbd-week-label">${wk.weekName && wk.weekName.trim() ? wk.weekName.trim().toUpperCase() : 'Week ' + wk.week} <span style="font-weight:normal; opacity:0.7; font-size:0.8em;">${getWeekDateRange(wk.week)}</span></div>`;
                    tbdHtml += `<div class="cal-tbd-tasks">`;
                    tbdTasksByWeek[wIdx].forEach(item => {
                        const color = getSubjectColor(item.task.sub);
                        const bg = getSubjectBg(item.task.sub);
                        tbdHtml += `<div class="cal-task" style="background:${bg}; color:${color}; border-left:2px solid ${color}; white-space:normal;" onclick="openModal(${item.wIndex}, ${item.tIndex})" title="${item.task.sub}: ${item.task.name}">${item.task.icon} ${item.task.sub} — ${item.task.name}</div>`;
                    });
                    tbdHtml += `</div></div>`;
                });
                tbdHtml += `</div>`;
                calInner += tbdHtml;
            }
        }

        calContainer.innerHTML = calInner;
        grid.appendChild(calContainer);
    }

    // Keyboard arrow navigation for calendar months
    document.addEventListener('keydown', function(e) {
        if(scheduleViewMode !== 'calendar') return;
        const schedulePage = document.getElementById('schedule-page');
        if(!schedulePage || !schedulePage.classList.contains('active')) return;
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if(calendarAvailableMonths.length === 0 || !calendarMonth) return;
        const curIdx = calendarAvailableMonths.indexOf(calendarMonth);
        if(e.key === 'ArrowLeft' && curIdx > 0) {
            e.preventDefault();
            calendarMonth = calendarAvailableMonths[curIdx - 1];
            renderScheduleContent();
        } else if(e.key === 'ArrowRight' && curIdx < calendarAvailableMonths.length - 1) {
            e.preventDefault();
            calendarMonth = calendarAvailableMonths[curIdx + 1];
            renderScheduleContent();
        }
    });
    
    // ── shared exam sort helper ──────────────────────────────────────────────
    function sortExamData(dataArr) {
        function parseExamTime(t) {
            if (!t) return 0;
            const m = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (!m) return 0;
            let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
            const ampm = (m[3] || '').toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            return h * 60 + min;
        }
        return dataArr
            .map(function(exam, origIdx) { return { exam: exam, origIdx: origIdx }; })
            .sort(function(a, b) {
                const da = a.exam.date || '', db = b.exam.date || '';
                if (da && db && da !== db) return da < db ? -1 : 1;
                if (da && !db) return -1;
                if (!da && db) return 1;
                return parseExamTime(a.exam.time) - parseExamTime(b.exam.time);
            });
    }

    // ── shared exam list renderer ────────────────────────────────────────────
    function renderExamList(container, sortedEntries, accentColor, hiddenSet, saveHiddenFn, openModalFn, openHiddenPanelFn, hiddenPanelSlotId, hiddenBtnClass, footerText) {
        container.innerHTML = '';

        const hiddenCount = hiddenSet.size;
        if (hiddenCount > 0) {
            const hiddenBtn = document.createElement('button');
            hiddenBtn.className = hiddenBtnClass;
            hiddenBtn.textContent = '🔒 Hidden (' + hiddenCount + ') — tap to manage';
            hiddenBtn.addEventListener('click', openHiddenPanelFn);
            container.appendChild(hiddenBtn);
            const slot = document.createElement('div');
            slot.id = hiddenPanelSlotId;
            container.appendChild(slot);
        }

        let lastDate = '';
        sortedEntries.forEach(function(entry) {
            const exam = entry.exam;
            const idx = entry.origIdx;
            if (hiddenSet.has(idx)) return;

            if (exam.dateLabel !== lastDate) {
                const dateEl = document.createElement('div');
                dateEl.style.cssText = "font-family:'Orbitron',sans-serif; font-size:1.1rem; letter-spacing:2px; color:" + accentColor + "; text-transform:uppercase; margin-bottom:10px; margin-top:30px; padding-left:2px; font-weight:bold;";
                dateEl.textContent = exam.dateLabel;
                container.appendChild(dateEl);
                lastDate = exam.dateLabel;
            }

            let subName = exam.sub;
            if (window.COURSE_DATA) {
                const sObj = window.COURSE_DATA.find(function(s){ return s.code === exam.sub; });
                if (sObj) subName = sObj.name;
            }

            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'border-left:4px solid ' + getSubjectColor(exam.sub) + '; flex-direction:row; cursor:pointer; padding:14px 18px; margin-bottom:10px; display:flex; align-items:center;';
            card.dataset.link = '#midterm';
            card.addEventListener('click', (function(i){ return function(){ openModalFn(i); }; })(idx));

            const badge = document.createElement('span');
            badge.className = 'sub-badge';
            badge.style.cssText = 'background:' + getSubjectBg(exam.sub) + '; color:' + getSubjectColor(exam.sub) + '; min-width:52px; font-size:0.72rem; padding:5px 10px; border-radius:8px;';
            badge.textContent = exam.sub;

            const info = document.createElement('div');
            info.style.flex = '1';
            info.style.marginLeft = '15px';
            const n1 = document.createElement('div');
            n1.style.cssText = 'font-weight:600; font-size:0.95rem; color:var(--text-main);';
            n1.textContent = subName;
            const n2 = document.createElement('div');
            n2.style.cssText = 'font-size:0.78rem; color:var(--text-sub); margin-top:2px;';
            n2.textContent = exam.examCode;
            info.appendChild(n1); info.appendChild(n2);

            const time = document.createElement('div');
            time.style.cssText = "font-family:'Orbitron',sans-serif; font-size:0.9rem; font-weight:700; color:" + accentColor + "; white-space:nowrap; flex-shrink:0; margin-right:10px;";
            time.textContent = exam.time;

            const hideBtn = document.createElement('button');
            hideBtn.textContent = 'Hide';
            hideBtn.style.cssText = 'background:none; border:1px solid rgba(255,255,255,0.1); color:#555; padding:4px 8px; border-radius:8px; cursor:pointer; font-size:0.72rem; flex-shrink:0;';
            hideBtn.addEventListener('mouseenter', function(){ hideBtn.style.color='#ff3b30'; hideBtn.style.borderColor='rgba(255,59,48,0.3)'; });
            hideBtn.addEventListener('mouseleave', function(){ hideBtn.style.color='#555'; hideBtn.style.borderColor='rgba(255,255,255,0.1)'; });
            hideBtn.addEventListener('click', (function(i){ return function(e){
                e.stopPropagation();
                const sy = window.scrollY;
                hiddenSet.add(i);
                saveHiddenFn();
                renderCurrentExamView(false);
                requestAnimationFrame(()=>window.scrollTo(0,sy));
            }; })(idx));

            card.appendChild(badge); card.appendChild(info); card.appendChild(time); card.appendChild(hideBtn);
            container.appendChild(card);
        });

        const footer = document.createElement('div');
        footer.style.cssText = 'text-align:center; margin-top:52px; margin-bottom:20px; font-size:0.75rem; color:var(--text-sub); letter-spacing:3px; opacity:0.5;';
        footer.textContent = footerText;
        container.appendChild(footer);
    }

    // ── hidden panel builder (reusable) ──────────────────────────────────────
    function buildHiddenPanel(slotId, panelId, hiddenSet, dataArr, accentColor, saveHiddenFn, accentRgb) {
        const slot = document.getElementById(slotId);
        if (!slot) return;
        const existing = document.getElementById(panelId);
        if (existing) { existing.remove(); return; }

        const panel = document.createElement('div');
        panel.id = panelId;
        panel.style.cssText = 'background:rgba(' + accentRgb + ',0.06); border:1px solid rgba(' + accentRgb + ',0.25); border-radius:14px; padding:16px 20px; margin-bottom:16px;';

        const title = document.createElement('div');
        title.style.cssText = "font-family:'Orbitron',sans-serif; font-size:0.75rem; letter-spacing:2px; color:" + accentColor + "; margin-bottom:12px; text-transform:uppercase;";
        title.textContent = 'Hidden Exams';
        panel.appendChild(title);

        if (hiddenSet.size === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color:#888; font-size:0.85rem; font-style:italic;';
            empty.textContent = 'Nothing hidden.';
            panel.appendChild(empty);
        } else {
            hiddenSet.forEach(function(idx) {
                const exam = dataArr[idx];
                if (!exam) return;
                let subName = exam.sub;
                if (window.COURSE_DATA) {
                    const sObj = window.COURSE_DATA.find(function(s){ return s.code === exam.sub; });
                    if (sObj) subName = sObj.name;
                }
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; gap:10px; margin-bottom:8px; padding:8px 12px; background:rgba(0,0,0,0.2); border-radius:10px;';
                const sb = document.createElement('span');
                sb.style.cssText = 'background:' + getSubjectBg(exam.sub) + '; color:' + getSubjectColor(exam.sub) + "; font-size:0.72rem; padding:3px 8px; border-radius:6px; font-weight:bold; font-family:'Orbitron',sans-serif;";
                sb.textContent = exam.sub;
                const nm = document.createElement('span');
                nm.style.cssText = 'flex:1; color:#ccc; font-size:0.85rem;';
                nm.textContent = subName;
                const ub = document.createElement('button');
                ub.textContent = 'Unhide';
                ub.style.cssText = 'background:rgba(52,199,89,0.15); border:1px solid rgba(52,199,89,0.35); color:#34c759; padding:3px 10px; border-radius:8px; cursor:pointer; font-size:0.75rem; font-weight:bold;';
                ub.addEventListener('click', (function(i){ return function(){
                    const sy = window.scrollY;
                    hiddenSet.delete(i);
                    saveHiddenFn();
                    renderCurrentExamView(false);
                    requestAnimationFrame(() => {
                        window.scrollTo(0, sy);
                        buildHiddenPanel(slotId, panelId, hiddenSet, dataArr, accentColor, saveHiddenFn, accentRgb);
                    });
                }; })(idx));
                row.appendChild(sb); row.appendChild(nm); row.appendChild(ub);
                panel.appendChild(row);
            });
        }
        slot.appendChild(panel);
    }

    // ── toggle rendering ─────────────────────────────────────────────────────
    function renderExamToggle() {
        const wrap = document.getElementById('exam-view-toggle');
        if (!wrap) return;
        const hasFinals = window.FINAL_DATA && window.FINAL_DATA.length > 0;
        const midCount = window.MIDTERM_DATA ? window.MIDTERM_DATA.length : 0;
        const finCount = window.FINAL_DATA ? window.FINAL_DATA.length : 0;

        // Update nav tab color to match active exam type
        const navLink = document.querySelector('.nav-link-midterms');
        if (navLink) {
            if (examViewMode === 'finals') {
                navLink.classList.add('finals-mode');
                document.querySelectorAll('.midterm-btn').forEach(btn => btn.classList.add('finals-mode'));
            } else {
                navLink.classList.remove('finals-mode');
                document.querySelectorAll('.midterm-btn').forEach(btn => btn.classList.remove('finals-mode'));
            }
        }

        wrap.innerHTML = '';

        const midCard = document.createElement('div');
        midCard.className = 'exam-view-card exam-view-card-midterms' + (examViewMode === 'midterms' ? ' active' : '');
        midCard.innerHTML = '<div class="exam-view-card-label">Midterms</div><div class="exam-view-card-count">' + midCount + ' exam' + (midCount !== 1 ? 's' : '') + '</div>';
        midCard.addEventListener('click', function() {
            examViewMode = 'midterms';
            saveExamViewMode();
            renderCurrentExamView(false);
        });
        wrap.appendChild(midCard);

        const finCard = document.createElement('div');
        finCard.className = 'exam-view-card exam-view-card-finals' + (examViewMode === 'finals' ? ' active' : '');
        finCard.innerHTML = '<div class="exam-view-card-label">Finals</div><div class="exam-view-card-count">' + (hasFinals ? finCount + ' exam' + (finCount !== 1 ? 's' : '') : 'Coming soon') + '</div>';
        finCard.addEventListener('click', function() {
            examViewMode = 'finals';
            saveExamViewMode();
            renderCurrentExamView(false);
        });
        wrap.appendChild(finCard);
    }

    // ── renders whichever view is currently active ───────────────────────────
    function renderCurrentExamView(push) {
        renderExamToggle();
        const midView = document.getElementById('exam-midterms-view');
        const finView = document.getElementById('exam-finals-view');

        if (examViewMode === 'finals') {
            midView.style.display = 'none';
            finView.style.display = '';
            renderFinalsView();
        } else {
            midView.style.display = '';
            finView.style.display = 'none';
            renderMidtermsView();
        }
        if (push !== false) nav('midterm', push !== false, { from: 'home' });
    }

    function renderMidtermsView() {
        const container = document.getElementById('midterm-list');
        renderExamList(
            container,
            sortExamData(window.MIDTERM_DATA || []),
            '#007aff',
            midtermHiddenSet,
            saveMidtermHidden,
            openMidtermModal,
            openMidtermHiddenPanel,
            'midterm-hidden-panel-slot',
            'midterm-hidden-btn',
            'GOOD LUCK · SPRING 2026'
        );
    }

    function renderFinalsView() {
        const container = document.getElementById('finals-list');
        const hasFinals = window.FINAL_DATA && window.FINAL_DATA.length > 0;

        if (!hasFinals) {
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; max-width:500px; margin:0 auto;">
                    <div style="font-size:3.5rem; margin-bottom:20px; opacity:0.4;">🏁</div>
                    <div style="font-family:'Orbitron',sans-serif; font-size:1rem; letter-spacing:3px; color:#d97706; opacity:0.5; text-transform:uppercase; margin-bottom:14px;">Finals Schedule</div>
                    <div style="color:#666; font-size:0.95rem; line-height:1.7;">Not published yet.<br>Check back here once finals details are announced.</div>
                </div>`;
            return;
        }

        renderExamList(
            container,
            sortExamData(window.FINAL_DATA),
            '#d97706',
            finalHiddenSet,
            saveFinalHidden,
            openFinalModal,
            openFinalHiddenPanel,
            'final-hidden-panel-slot',
            'finals-hidden-btn',
            'GOOD LUCK · SPRING 2026'
        );
    }

    function showMidterms(push = true, from = 'home') {
        renderCurrentExamView(push);
        nav('midterm', push, { from: from });
    }

    function openExamViewFromSchedule(mode) {
        examViewMode = mode === 'finals' ? 'finals' : 'midterms';
        saveExamViewMode();
        renderCurrentExamView(false);
        nav('midterm', true, { from: 'schedule' });
    }

    function goToExamSubject(subCode) {
        if (!Array.isArray(window.COURSE_DATA)) return;
        const subjectIndex = window.COURSE_DATA.findIndex(function(c) { return c.code === subCode; });
        if (subjectIndex < 0) {
            showToast('Subject not found.', 'locked');
            return;
        }
        const subjectObj = window.COURSE_DATA[subjectIndex];
        closeModal(null, true);
        currSub = subjectObj;
        showWeeks(subjectObj);
    }

    function openMidtermHiddenPanel() {
        buildHiddenPanel('midterm-hidden-panel-slot', 'midterm-hidden-panel', midtermHiddenSet, window.MIDTERM_DATA, '#007aff', saveMidtermHidden, '0,122,255');
    }

    function openFinalHiddenPanel() {
        buildHiddenPanel('final-hidden-panel-slot', 'final-hidden-panel', finalHiddenSet, window.FINAL_DATA, '#d97706', saveFinalHidden, '204,34,0');
    }

    function openModal(wIndex, tIndex) {
        const weekData = window.SCHEDULE_DATA[wIndex];
        const task = weekData.tasks[tIndex];
        
        let subName = task.sub;
        if(window.COURSE_DATA) {
            const sObj = window.COURSE_DATA.find(s => s.code === task.sub);
            if(sObj) subName = sObj.name;
        }

        const titlePrefix = task.isCompleted ? '✅ ' : '';
        document.getElementById('m-title').innerHTML = `${titlePrefix}${task.icon} ${task.name}`;
        document.getElementById('m-sub').innerText = `${subName} - Week ${weekData.week}`;
        
        const container = document.getElementById('m-fields-container');
        container.innerHTML = '';
        
        let hasContent = false;

        // When field with URL icon
        let whenHtml = task.when || '';
        if(task.whenLink && task.whenLink.trim() !== '') {
            const whenNote = task.whenNote || 'Check your time here';
            whenHtml = (task.when ? task.when + ' ' : '') + `<a href="${task.whenLink}" target="_blank" rel="noopener" class="modal-url-badge">🔗 ${whenNote}</a>`;
        }
        
        // Where field with URL icon
        let whereHtml = task.where || '';
        if(task.whereLink && task.whereLink.trim() !== '') {
            const whereNote = task.whereNote || 'Check your place here';
            whereHtml = (task.where ? task.where + ' ' : '') + `<a href="${task.whereLink}" target="_blank" rel="noopener" class="modal-url-badge">🔗 ${whereNote}</a>`;
        }

        // Coverage field with URL icon
        let coverageHtml = task.coverage || '';
        if(task.coverageLink && task.coverageLink.trim() !== '') {
            const coverageNote = task.coverageNote || 'Check coverage here';
            coverageHtml = (task.coverage ? task.coverage + ' ' : '') + `<a href="${task.coverageLink}" target="_blank" rel="noopener" class="modal-url-badge">🔗 ${coverageNote}</a>`;
        }

        // Submit field with URL
        let submitHtml = task.submitText || '';
        if(task.submitLink && task.submitLink.trim() !== '') {
            const submitNote = task.submitNote || 'Submit here';
            submitHtml = (task.submitText ? task.submitText + ' ' : '') + `<a href="${task.submitLink}" target="_blank" rel="noopener" class="modal-url-badge">🔗 ${submitNote}</a>`;
        }

        // Notes field with optional URL
        let noteHtml = task.note || '';
        if (task.noteLink && task.noteLink.trim() !== '') {
            const noteNote = task.noteNote || 'Read more';
            noteHtml = (task.note ? task.note + ' ' : '') + `<a href="${task.noteLink}" target="_blank" rel="noopener" class="modal-url-badge">🔗 ${noteNote}</a>`;
        }

        const fields = [
            { label: '🕒 When', val: whenHtml },
            { label: '📍 Where', val: whereHtml },
            { label: '📚 Coverage', val: coverageHtml },
            { label: '📤 Submit', val: submitHtml },
            { label: '📝 Extra Notes', val: noteHtml }
        ];

        fields.forEach(f => {
            if(f.val && f.val.trim() !== '') {
                hasContent = true;
                container.innerHTML += `<div class="modal-field"><div class="modal-label">${f.label}</div><div class="modal-value">${f.val}</div></div>`;
            }
        });

        if(!hasContent) {
            container.innerHTML = `<div style="text-align:center; color:#666; font-style:italic; padding:20px 0;">No extra details provided.</div>`;
        }
        document.getElementById('task-modal').classList.add('active');
    }
    
    function openMidtermModal(idx) {
        const exam = window.MIDTERM_DATA[idx];
        let subName = exam.sub;
        let targetEvent = null;
        let targetSub = null;
        const safeSubCode = String(exam.sub || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        if(window.COURSE_DATA) {
            const sObj = window.COURSE_DATA.find(s => s.code === exam.sub);
            if(sObj) {
                subName = sObj.name;
                targetSub = sObj;
                if (sObj.events) {
                    targetEvent = sObj.events.find(ev => ev.title.toLowerCase().includes('midterm'));
                }
            }
        }

        document.getElementById('m-title').innerHTML = `🎓 Midterm Exam`;
        document.getElementById('m-sub').innerText = `${subName} (${exam.examCode})`;
        
        const container = document.getElementById('m-fields-container');
        container.innerHTML = '';
        
        let hasContent = false;
        
        let whereHtml = exam.where || '';
        if(exam.whereLink && exam.whereLink.trim() !== '') {
            whereHtml = (exam.where ? exam.where + ' ' : '') + `<a href="${exam.whereLink}" target="_blank" rel="noopener" class="modal-url-badge">🔗 Check your place here</a>`;
        }

        const fields = [
            { label: '📍 Where', val: whereHtml },
            { label: '📚 Coverage', val: exam.coverage },
            { label: '📝 Extra Notes', val: exam.note }
        ];

        fields.forEach(f => {
            if(f.val && f.val.trim() !== '') {
                hasContent = true;
                container.innerHTML += `<div class="modal-field"><div class="modal-label" style="color:#007aff;">${f.label}</div><div class="modal-value" style="border-left-color:#007aff;">${f.val}</div></div>`;
            }
        });
        
        // Go to Subject button
        if (targetSub) {
            hasContent = true;
            container.innerHTML += `
                <button style="width:100%; padding:12px; margin-top:15px; border-radius:8px; background:rgba(181,25,214,0.2); color:var(--accent-purple); font-weight:bold; cursor:pointer; border:1px solid var(--accent-purple); font-family:'Orbitron'; transition:0.3s; font-size:0.85rem;" 
                onmouseover="this.style.background='var(--accent-purple)'; this.style.color='white';" 
                onmouseout="this.style.background='rgba(181,25,214,0.2)'; this.style.color='var(--accent-purple)';"
                onclick="goToExamSubject('${safeSubCode}')">
                    📚 GO TO SUBJECT
                </button>
            `;
        }

        // Midterm Material Link
        if (targetEvent) {
            hasContent = true;
            const sObj = window.COURSE_DATA.find(s => s.code === exam.sub);
            const evIdx = sObj.events.indexOf(targetEvent);
            container.innerHTML += `
                <button style="width:100%; padding:12px; margin-top:8px; border-radius:8px; background:rgba(0,122,255,0.2); color:#007aff; font-weight:bold; cursor:pointer; border:1px solid #007aff; font-family:'Orbitron'; transition:0.3s; font-size:0.85rem;" 
                onmouseover="this.style.background='#007aff'; this.style.color='white';" 
                onmouseout="this.style.background='rgba(0,122,255,0.2)'; this.style.color='#007aff';"
                onclick="goToExamSubject('${safeSubCode}'); if (currSub && currSub.events && currSub.events[${evIdx}]) { renderSubjectView('events', false); showContentByObj(currSub.events[${evIdx}], true, 'midterm'); }">
                    📝 GO TO MIDTERM MATERIAL
                </button>
            `;
        }

        if(!hasContent) {
            container.innerHTML = `<div style="text-align:center; color:#666; font-style:italic; padding:20px 0;">No extra details provided.</div>`;
        }
        document.getElementById('task-modal').classList.add('active');
    }

    function openFinalModal(idx) {
        const exam = window.FINAL_DATA[idx];
        let subName = exam.sub;
        let targetSub = null;
        const safeSubCode = String(exam.sub || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        if (window.COURSE_DATA) {
            const sObj = window.COURSE_DATA.find(s => s.code === exam.sub);
            if (sObj) { subName = sObj.name; targetSub = sObj; }
        }

        document.getElementById('m-title').innerHTML = `🏁 Final Exam`;
        document.getElementById('m-sub').innerText = `${subName} (${exam.examCode || ''})`;

        const container = document.getElementById('m-fields-container');
        container.innerHTML = '';
        let hasContent = false;

        let whereHtml = exam.where || '';
        if (exam.whereLink && exam.whereLink.trim() !== '') {
            const wn = exam.whereNote || 'Check your place here';
            whereHtml = (exam.where ? exam.where + ' ' : '') + `<a href="${exam.whereLink}" target="_blank" rel="noopener" class="modal-url-badge">🔗 ${wn}</a>`;
        }

        const fields = [
            { label: '📍 Where', val: whereHtml },
            { label: '📚 Coverage', val: exam.coverage },
            { label: '📝 Extra Notes', val: exam.note }
        ];

        fields.forEach(f => {
            if (f.val && f.val.trim() !== '') {
                hasContent = true;
                container.innerHTML += `<div class="modal-field"><div class="modal-label" style="color:#d97706;">${f.label}</div><div class="modal-value" style="border-left-color:#d97706;">${f.val}</div></div>`;
            }
        });

        if (targetSub) {
            hasContent = true;
            container.innerHTML += `
                <button style="width:100%; padding:12px; margin-top:15px; border-radius:8px; background:rgba(181,25,214,0.2); color:var(--accent-purple); font-weight:bold; cursor:pointer; border:1px solid var(--accent-purple); font-family:'Orbitron'; transition:0.3s; font-size:0.85rem;"
                onmouseover="this.style.background='var(--accent-purple)'; this.style.color='white';"
                onmouseout="this.style.background='rgba(181,25,214,0.2)'; this.style.color='var(--accent-purple)';"
                onclick="goToExamSubject('${safeSubCode}')">
                    📚 GO TO SUBJECT
                </button>`;
        }

        if (!hasContent) {
            container.innerHTML = `<div style="text-align:center; color:#666; font-style:italic; padding:20px 0;">No extra details provided yet.</div>`;
        }
        document.getElementById('task-modal').classList.add('active');
    }

    function closeModal(e, force = false) {
        if(force || e.target.id === 'task-modal') {
            document.getElementById('task-modal').classList.remove('active');
        }
    }

    function showWeeks(sub, push = true) {
        if (!sub || isSubjectHidden(sub.code)) {
            nav('home', push);
            return;
        }
        currSub = sub;
        document.getElementById('subject-title').innerText = `${sub.code} — ${sub.name}`;
        
        const dContainer = document.getElementById('drive-container');
        dContainer.innerHTML = '';
        if(sub.driveLink && sub.driveLink.trim() !== "") {
            const a = document.createElement('a');
            a.className = 'drive-btn-inline';
            a.href = sub.driveLink;
            a.target = "_blank";
            a.innerHTML = "📂 Course Drive";
            dContainer.appendChild(a);
        }

        renderSubjectView(currentSubjectView, false); 
        nav('weeks', push, { subCode: sub.code, subView: currentSubjectView });
        applySubjectHash();
        renderHiddenWeeksControls();
    }

    function renderSubjectView(viewType, pushState = true) {
        currentSubjectView = viewType;
        closeSubjectFilterDropdown(); // close filter dropdown when switching tabs

        const subjectHashBase = currSub && currSub.code ? `#${currSub.code}` : '#weeks';
        const tabWeeks = document.getElementById('tab-weeks');
        const tabEvents = document.getElementById('tab-events');
        const tabPlaylists = document.getElementById('tab-playlists');
        const tabDetails = document.getElementById('tab-details');
        if (tabWeeks) tabWeeks.dataset.link = subjectHashBase;
        if (tabEvents) tabEvents.dataset.link = `${subjectHashBase}/events`;
        if (tabPlaylists) tabPlaylists.dataset.link = `${subjectHashBase}/links`;
        if (tabDetails) tabDetails.dataset.link = `${subjectHashBase}/details`;
        
        document.getElementById('tab-weeks').classList.remove('active');
        document.getElementById('tab-events').classList.remove('active');
        document.getElementById('tab-details').classList.remove('active');
        document.getElementById('tab-playlists').classList.remove('active');
        document.getElementById(`tab-${viewType}`).classList.add('active');

        const filterBar = document.getElementById('filter-bar');
        const gridWeeks = document.getElementById('weeks-grid');
        const gridPlaylists = document.getElementById('playlists-grid');
        if (gridWeeks) gridWeeks.classList.toggle('details-mode', viewType === 'details');

        if (viewType === 'playlists') {
            filterBar.style.display = 'none';
            gridWeeks.style.display = 'none';
            gridPlaylists.style.display = 'grid';
            // Hide the weeks filter wrap on playlists tab
            const fwrap = document.getElementById('filter-bar-wrap');
            const fsep = document.getElementById('filter-sep');
            if (fwrap) fwrap.style.display = 'none';
            if (fsep) fsep.style.display = 'none';
            renderPlaylistGrid(false);
        } else if (viewType === 'details') {
            filterBar.style.display = 'none';
            gridPlaylists.style.display = 'none';
            gridWeeks.style.display = 'grid';
            const fwrap = document.getElementById('filter-bar-wrap');
            const fsep = document.getElementById('filter-sep');
            if (fwrap) fwrap.style.display = 'none';
            if (fsep) fsep.style.display = 'none';
            renderSubjectDetailsView();
        } else {
            filterBar.style.display = 'flex';
            gridPlaylists.style.display = 'none';
            gridWeeks.style.display = 'grid';
            renderFilterBar(viewType);
        }
        renderHiddenWeeksControls();
        if(pushState) {
            const nextState = {page: 'weeks', subCode: currSub.code, subView: viewType};
            if (history.state && history.state.page === 'weeks') history.replaceState(nextState, null, "#weeks");
            else history.pushState(nextState, null, "#weeks");
        }
        applySubjectHash();
        renderQuickActions();
    }

    function renderSubjectDetailsView() {
        const grid = document.getElementById('weeks-grid');
        if (!grid) return;
        if (!currSub) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#666; margin-top:30px; font-style:italic;">No subject selected.</div>';
            return;
        }

        const details = ensureSubjectDetailsEntry(currSub.code);
        const card = document.createElement('div');
        card.className = 'card';
        card.style.gridColumn = '1 / -1';
        card.style.textAlign = 'left';
        card.innerHTML = `
            <div style="font-family:'Orbitron'; font-size:1.25rem; color:var(--accent-purple); margin-bottom:14px;">${currSub.code} Subject Details</div>
            <div class="detail-row" style="margin-bottom:12px;"><div class="detail-icon">📊</div><div class="detail-content"><h3>Grade Distribution</h3><p>${details.gradeDistribution ? details.gradeDistribution.replace(/\n/g, '<br>') : 'No grade distribution added yet.'}</p></div></div>
            <div class="detail-row" style="margin-bottom:12px;"><div class="detail-icon">📝</div><div class="detail-content"><h3>Exam Types</h3><p>${details.examTypes ? details.examTypes.replace(/\n/g, '<br>') : 'No exam type notes added yet.'}</p></div></div>
            <div class="detail-row"><div class="detail-icon"><span style="display:inline-flex; align-items:center; justify-content:center; font-size:1.35rem; line-height:1;">💡</span></div><div class="detail-content"><h3>General Notes</h3><p>${details.generalNotes ? details.generalNotes.replace(/\n/g, '<br>') : 'No general notes added yet.'}</p></div></div>
        `;
        grid.innerHTML = '';
        grid.appendChild(card);
        applyWaterfallToContainer(grid, '.card');
    }

    function renderPlaylistGrid(resetFilters = false) {
        if (resetFilters) playlistBadgeFilters = new Set();
        const grid = document.getElementById('playlists-grid');
        grid.innerHTML = '';
        if(!currSub.playlists || currSub.playlists.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#666; margin-top:30px; font-style:italic;">No useful links found for this subject.</div>`;
            return;
        }

        // Collect all badge texts
        const allBadgeMap = new Map();
        currSub.playlists.forEach(p => {
            (p.badges || []).forEach(b => { if (b.text && b.text.trim()) allBadgeMap.set(b.text.trim(), b.color || '#e91e8c'); });
        });

        // Always-visible inline chip bar (fp-chip style, centered, compact)
        if (allBadgeMap.size > 0) {
            const filterWrap = document.createElement('div');
            filterWrap.style.cssText = 'grid-column:1/-1; margin-bottom:0px;';

            const bar = document.createElement('div');
            bar.className = 'fp-inline-bar';
            bar.style.cssText = 'flex-wrap:wrap; justify-content:center; display:flex; gap:7px;';

            const allBtn = document.createElement('button');
            allBtn.className = 'fp-chip' + (playlistBadgeFilters.size === 0 ? ' active' : '');
            allBtn.textContent = 'All';
            if (playlistBadgeFilters.size === 0) allBtn.style.cssText = 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;';
            allBtn.dataset.key = '__all__';
            allBtn.onclick = () => { playlistBadgeFilters.clear(); renderPlaylistGrid(); };
            bar.appendChild(allBtn);

            const plClearRow = document.createElement('div');
            plClearRow.style.cssText = 'display:' + (playlistBadgeFilters.size > 0 ? 'flex' : 'none') + '; justify-content:center; margin-top:6px;';
            const plClearBtn = document.createElement('button');
            plClearBtn.className = 'fp-clear-btn';
            plClearBtn.innerHTML = '✕ Clear all filters';
            plClearBtn.onclick = () => { playlistBadgeFilters.clear(); renderPlaylistGrid(); };
            plClearRow.appendChild(plClearBtn);

            allBadgeMap.forEach((color, text) => {
                const isActive = playlistBadgeFilters.has(text);
                const btn = document.createElement('button');
                btn.className = 'fp-chip' + (isActive ? ' active' : '');
                btn.textContent = text;
                btn.dataset.key = text;
                if (isActive) btn.style.cssText = `background:${color}33; border-color:${color}; color:${color}; box-shadow:0 0 8px ${color}44;`;
                btn.onclick = () => {
                    if (playlistBadgeFilters.has(text)) playlistBadgeFilters.delete(text);
                    else playlistBadgeFilters.add(text);
                    // Update chip styles in-place
                    bar.querySelectorAll('.fp-chip').forEach(b => {
                        if (b.dataset.key === '__all__') {
                            const allNow = playlistBadgeFilters.size === 0;
                            b.classList.toggle('active', allNow);
                            b.style.cssText = allNow ? 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;' : '';
                        } else {
                            const c = allBadgeMap.get(b.dataset.key) || '#e91e8c';
                            const act = playlistBadgeFilters.has(b.dataset.key);
                            b.classList.toggle('active', act);
                            b.style.cssText = act ? `background:${c}33; border-color:${c}; color:${c}; box-shadow:0 0 8px ${c}44;` : '';
                        }
                    });
                    plClearRow.style.display = playlistBadgeFilters.size > 0 ? 'flex' : 'none';
                    // Re-render cards only (filter wrap stays)
                    renderPlaylistGrid();
                };
                bar.appendChild(btn);
            });

            filterWrap.appendChild(bar);
            filterWrap.appendChild(plClearRow);
            grid.appendChild(filterWrap);
        }

        const color = getSubjectColor(currSub.code);

        // Filter playlists
        let playlists = currSub.playlists;
        if (playlistBadgeFilters.size > 0) {
            playlists = playlists.filter(p => {
                const pBadges = new Set((p.badges || []).map(b => (b.text || '').trim()));
                for (const f of playlistBadgeFilters) { if (pBadges.has(f)) return true; }
                return false;
            });
        }

        if (playlists.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.style.cssText = 'grid-column:1/-1; text-align:center; color:#666; margin-top:20px; font-style:italic;';
            emptyEl.textContent = 'No links match selected filters.';
            grid.appendChild(emptyEl);
            return;
        }

        const renderItems = [];
        const processedGroups = new Set();
        playlists.forEach(p => {
            const group = (p.group || '').trim();
            if (group) {
                if (!processedGroups.has(group)) {
                    processedGroups.add(group);
                    renderItems.push({ type: 'group', name: group, items: playlists.filter(gp => (gp.group || '').trim() === group) });
                }
            } else {
                renderItems.push({ type: 'single', playlist: p });
            }
        });

        renderItems.forEach(item => {
            if (item.type === 'single') {
                const p = item.playlist;
                const el = document.createElement('div');
                el.className = 'card';
                const badges = p.badges || (p.badgeText ? [{text:p.badgeText, color:p.badgeColor||'#e91e8c'}] : []);
                const badgeHtml = badges.filter(b=>b.text).map(b => `<span style="background:${b.color||'#e91e8c'}; color:#fff; font-size:0.6rem; padding:2px 7px; border-radius:8px; font-weight:800; letter-spacing:0.5px;">${b.text}</span>`).join('');
                const badgeWrap = badgeHtml ? `<div style="position:absolute; top:12px; right:12px; display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; max-width:70%;">${badgeHtml}</div>` : '';
                const noteHtml = (p.note) ? `<div style="color:var(--text-sub); margin-top:15px; font-size:0.9rem; line-height:1.4; border-top:1px solid rgba(255,255,255,0.1); padding-top:15px; white-space:pre-wrap;">${p.note}</div>` : '';
                el.innerHTML = `${badgeWrap}<div style="font-size:2.5rem; margin-bottom:10px">${p.icon || '🔗'}</div><div style="font-weight:bold; font-size:1.1rem; text-transform:uppercase; color:white;">${p.title || 'Link'}</div>${noteHtml}`;
                el.onclick = () => { if(p.link && p.link !== "#" && p.link.trim() !== "") window.open(p.link, "_blank"); else alert("No link assigned."); };
                if (p.link && p.link !== '#') el.dataset.link = p.link;
                grid.appendChild(el);
            } else {
                const groupEl = document.createElement('div');
                groupEl.style.cssText = 'grid-column: 1 / -1; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px; margin: 5px 0;';
                const firstItem = item.items[0];
                // Collect ALL unique badges across every item in the group
                const allGroupBadgeMap = new Map();
                item.items.forEach(p => { (p.badges||[]).filter(b=>b.text).forEach(b => { if(!allGroupBadgeMap.has(b.text)) allGroupBadgeMap.set(b.text, b.color||'#e91e8c'); }); });
                const hBadgeHtml = [...allGroupBadgeMap.entries()].map(([txt,col]) => `<span style="background:${col}; color:#fff; font-size:0.6rem; padding:2px 7px; border-radius:8px; font-weight:800; letter-spacing:0.5px;">${txt}</span>`).join('');
                let innerHtml = `<div style="display:flex; align-items:center; gap:12px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08);"><span style="font-size:1.8rem;">${firstItem.icon || '🔗'}</span><div style="flex:1;"><div style="font-weight:bold; font-size:1.1rem; text-transform:uppercase; color:white;">${item.name}</div></div><div style="display:flex; gap:4px; flex-wrap:wrap;">${hBadgeHtml}</div><span style="color:var(--text-sub); font-size:0.8rem; white-space:nowrap;">${item.items.length} links</span></div>`;
                item.items.forEach(p => {
                    const pBadges = (p.badges || []).filter(b=>b.text);
                    const pBadgeHtml = pBadges.map(b => `<span style="background:${b.color||'#e91e8c'}; color:#fff; font-size:0.55rem; padding:1px 6px; border-radius:6px; font-weight:800;">${b.text}</span>`).join('');
                    const noteSnippet = p.note ? `<div style="color:var(--text-sub); font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.note.split('\n')[0]}</div>` : '';
                    const safeLink = (p.link || '').replace(/'/g, "\\'");
                    innerHtml += `<div class="group-link-row" onclick="window.open('${safeLink}','_blank')" data-link="${safeLink}" style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; cursor:pointer; transition:all 0.2s; margin-bottom:4px;"><span style="font-size:1.2rem;">${p.icon || '🔗'}</span><div style="flex:1; min-width:0;"><div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;"><span style="font-weight:600; color:white; font-size:0.9rem;">${p.title || 'Link'}</span>${pBadgeHtml}</div>${noteSnippet}</div><span style="color:${color}; opacity:0.5; font-size:0.9rem;">→</span></div>`;
                });
                groupEl.innerHTML = innerHtml;
                grid.appendChild(groupEl);
            }
        });
    }

    // ── Universal collapsible filter panel builder ────────────────────────
    // anchorEl: element to render the toggle button into
    // panelEl: element to render the expanded panel into (can be same as anchor)
    // rows: array of { label, chips: [{key, label, color?}] }
    // getActive: fn() => { rowIndex: key } map
    // onSelect: fn(rowIndex, key)
    // allKey: the key that means "no filter" (default 'ALL' / 'all')
    function buildFilterPanel(anchorEl, panelEl, rows, getActive, onSelect, allKey = 'ALL', openStateKey = null) {
        anchorEl.innerHTML = '';
        panelEl.innerHTML = '';

        const active = getActive();
        const anyActive = Object.values(active).some(v => v && v !== allKey && v !== 'all' && v !== 'All' && v !== 'All Subjects');
        const activeLabels = [];
        rows.forEach((row, ri) => {
            const ak = active[ri];
            if (ak && ak !== allKey && ak !== 'all' && ak !== 'All' && ak !== 'All Subjects') {
                const chip = row.chips.find(c => c.key === ak);
                if (chip) activeLabels.push(chip.label.replace(/^[^\w\u{1F300}-\u{1F9FF}]*/u,'').trim().split(' ').slice(-1)[0]);
            }
        });

        // Restore open state: only based on explicit user action
        const shouldBeOpen = openStateKey ? fpOpenState[openStateKey] : false;

        // Active filter summary — plain text, not a pill
        const summaryParts = [];
        rows.forEach((row, ri) => {
            const ak = active[ri];
            if (ak && ak !== allKey && ak !== 'all' && ak !== 'All' && ak !== 'All Subjects') {
                const chip = row.chips.find(c => c.key === ak);
                if (chip) summaryParts.push(chip.label.replace(/^\p{Emoji}\s*/u, '').trim());
            }
        });

        const toggle = document.createElement('button');
        toggle.className = 'fp-toggle' + (anyActive ? ' has-filter' : '') + (shouldBeOpen ? ' open' : '');
        if (anyActive) {
            toggle.innerHTML = `Filter: <span class="fp-active-label">${summaryParts.join(', ')}</span> <span class="fp-arrow">▼</span>`;
        } else {
            toggle.innerHTML = `Filter <span class="fp-arrow">▼</span>`;
        }

        const panel = document.createElement('div');
        panel.className = 'fp-panel' + (shouldBeOpen ? ' open' : '');

        rows.forEach((row, ri) => {
            if (row.chips.length <= 1) return;
            const rowEl = document.createElement('div');
            rowEl.className = 'fp-row';
            if (row.label) {
                const lbl = document.createElement('span');
                lbl.className = 'fp-label';
                lbl.textContent = row.label;
                rowEl.appendChild(lbl);
            }
            row.chips.forEach(chip => {
                const btn = document.createElement('button');
                btn.className = 'fp-chip';
                btn.textContent = chip.label;
                const isActive = (active[ri] || allKey) === chip.key;
                if (isActive) {
                    btn.classList.add('active');
                    if (chip.color) btn.style.cssText = `background:${chip.color}22; border-color:${chip.color}; color:${chip.color}; box-shadow:0 0 10px ${chip.color}55;`;
                    else btn.style.cssText = 'background:rgba(233,30,140,0.18); border-color:var(--accent-pink); color:var(--accent-pink);';
                }
                // Never close panel on chip click — user closes explicitly
                btn.dataset.chipKey = chip.key;
                if (chip.color) btn.dataset.chipColor = chip.color;
                btn.addEventListener('click', () => {
                    if (openStateKey) fpOpenState[openStateKey] = true;
                    onSelect(ri, chip.key);
                });
                rowEl.appendChild(btn);
            });
            panel.appendChild(rowEl);
        });

        toggle.addEventListener('click', () => {
            const isOpen = panel.classList.contains('open');
            panel.classList.toggle('open', !isOpen);
            toggle.classList.toggle('open', !isOpen);
            if (openStateKey) fpOpenState[openStateKey] = !isOpen;
        });

        // Separator + clear button at bottom of panel (not for subject resource filter)
        if (openStateKey === 'playlist') {
            // no sep/clear for subject weeks/exam filter
        } else {
        const sep = document.createElement('div');
        sep.className = 'fp-sep';
        panel.appendChild(sep);

        const clearRow = document.createElement('div');
        clearRow.style.cssText = 'display:flex; justify-content:center; margin-top:10px;';
        const clearBtn = document.createElement('button');
        clearBtn.className = 'fp-clear-btn';
        clearBtn.innerHTML = '✕ Clear all filters';
        clearBtn.style.display = anyActive ? 'inline-flex' : 'none';
        clearBtn.addEventListener('click', () => {
            if (openStateKey) fpOpenState[openStateKey] = true;
            // Reset state variables based on openStateKey
            if (openStateKey === 'schedule') { scheduleTaskFilter.clear(); scheduleSubFilter.clear(); renderScheduleFilters(); renderScheduleWeeksGrid(); }
            else if (openStateKey === 'deadlines') { deadlineTypeFilter.clear(); deadlineSubFilter.clear(); showDeadlines(false); }
            else { rows.forEach((row, ri) => onSelect(ri, row.chips[0] ? row.chips[0].key : allKey)); }
        });
        clearRow.appendChild(clearBtn);
        panel.appendChild(clearRow);
        } // end if not playlist

        // Wrap toggle+panel in a relative container so panel is absolutely positioned below toggle
        const wrapper = document.createElement('div');
        wrapper.className = 'fp-toggle-wrap' + (openStateKey === 'schedule' || openStateKey === 'deadlines' ? ' centered' : '');
        wrapper.appendChild(toggle);
        wrapper.appendChild(panel);
        anchorEl.appendChild(wrapper);
    }

    function renderFilterBar(viewType) {
        const wrapEl = document.getElementById('filter-bar-wrap');
        const barEl = document.getElementById('filter-bar');
        wrapEl.style.display = 'block';
        barEl.style.display = 'none';
        const sepEl = document.getElementById('filter-sep');
        if (sepEl) sepEl.style.display = 'block';
        wrapEl.innerHTML = '';

        const filterKey = `${currSub.code}:${viewType}`;
        const sourceArr = viewType === 'events' ? currSub.events : currSub.weeks;
        const availableTypes = new Set();
        if(sourceArr) {
            sourceArr.forEach(w => {
                if(w.resources) Object.keys(w.resources).forEach(k => { if(w.resources[k].vis) availableTypes.add(k); });
            });
        }

        // Build chips list for resource filter
        const resourceChips = [{ key: 'ALL', label: 'All' }];
        if(window.CONFIG && window.CONFIG.resources) {
            window.CONFIG.resources.forEach(res => {
                if(availableTypes.has(res.name)) resourceChips.push({ key: res.name, label: res.name });
            });
        }

        // If only "All" available, render grid immediately and hide panel
        if (resourceChips.length <= 1) {
            wrapEl.style.display = 'none';
            if (sepEl) sepEl.style.display = 'none';
            renderWeekGrid('ALL', viewType === 'events');
            return;
        }

        let activeFilter = subjectViewFilters[filterKey] || 'ALL';
        if (!resourceChips.find(c => c.key === activeFilter)) activeFilter = 'ALL';
        subjectViewFilters[filterKey] = activeFilter;

        buildFilterPanel(
            wrapEl, wrapEl,
            [{ label: '', chips: resourceChips }],
            () => ({ 0: activeFilter }),
            (ri, key) => {
                subjectViewFilters[filterKey] = key;
                activeFilter = key;
                // Close panel after selection (single-select)
                fpOpenState.playlist = false;
                const pnl = wrapEl.querySelector('.fp-panel');
                const tgl = wrapEl.querySelector('.fp-toggle');
                if (pnl) pnl.classList.remove('open');
                if (tgl) { tgl.classList.remove('open'); }
                // Update active chip styles in-place without rebuilding
                wrapEl.querySelectorAll('.fp-chip').forEach(btn => {
                    const isNowActive = btn.textContent.trim() === (resourceChips.find(ch=>ch.key===key)||{}).label;
                    btn.classList.toggle('active', isNowActive || (key === 'ALL' && btn.textContent.trim() === 'All'));
                    if (btn.classList.contains('active')) {
                        btn.style.cssText = 'background:rgba(233,30,140,0.18); border-color:var(--accent-pink); color:var(--accent-pink);';
                    } else {
                        btn.style.cssText = '';
                    }
                });
                // Update toggle label
                const tog = wrapEl.querySelector('.fp-toggle');
                if (tog) {
                    if (key !== 'ALL') {
                        tog.classList.add('has-filter');
                        tog.innerHTML = `Filter: <span class="fp-active-label">${key}</span> <span class="fp-arrow ${tog.classList.contains('open')?'open':''}">▼</span>`;
                    } else {
                        tog.classList.remove('has-filter');
                        tog.innerHTML = `Filter <span class="fp-arrow ${tog.classList.contains('open')?'open':''}">▼</span>`;
                    }
                }
                renderWeekGrid(key, viewType === 'events');
            },
            'ALL',
            'playlist'
        );

        renderWeekGrid(activeFilter, viewType === 'events');
    }

    function setActiveFilter(btn, containerId = 'filter-bar') {
        document.querySelectorAll(`#${containerId} .filter-btn`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    function renderWeekGrid(filterType, isEvent = false) {
        const grid = document.getElementById('weeks-grid');
        grid.innerHTML = '';
        
        const sourceArr = isEvent ? currSub.events : currSub.weeks;
        if(!sourceArr || sourceArr.length === 0) {
            const emptyText = isEvent ? "No exam materials found." : "No weeks found.";
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#666; margin-top:30px; font-style:italic;">${emptyText}</div>`;
            return;
        }

        if(filterType === 'ALL') {
            let visibleCount = 0;
            sourceArr.forEach((w, i) => {
                if (isWeekHidden(currSub.code, w, isEvent ? 'events' : 'weeks')) return;
                visibleCount++;
                const el = document.createElement('div');
                el.className = 'card' + (w.locked ? ' locked' : '');
                el.setAttribute('data-week-index', i);
                
                if(isEvent) el.style.borderLeft = `4px solid var(--accent-blue)`;

                const lockIcon = w.locked ? '<div class="week-lock-icon" style="font-size:2rem; margin-bottom:10px">🔒</div>' : '';
                const status = w.locked ? 'UNAVAILABLE' : 'CLICK TO VIEW';
                const badge = w.isNew ? '<span class="badge-new">NEW!</span>' : '';
                let customBadge = '';
                if(w.showBadge && w.badgeText) {
                    customBadge = `<div class="custom-badge" style="background:${w.badgeColor || '#e91e8c'}">${w.badgeText}</div>`;
                }
                el.style.position = 'relative';
                el.dataset.link = buildWeekHash(currSub.code, w, isEvent);
                el.innerHTML = `${customBadge}${lockIcon}<div style="font-family:'Orbitron'; font-size:1.5rem; color:${isEvent?'var(--accent-blue)':'var(--accent-purple)'}; margin-bottom:5px; padding-top:10px;">${w.title}${badge}</div><div style="color:#888; font-size:0.8rem">${status}</div>${getUpdatedAgoHtml(w)}`;
                const hideBtn = document.createElement('button');
                hideBtn.className = 'week-hide-btn';
                hideBtn.innerHTML = '<span class="eye-icon">👁</span>';
                hideBtn.title = 'Hide this week from this view';
                hideBtn.onclick = (ev) => { ev.stopPropagation(); hideWeek(currSub.code, w, isEvent ? 'events' : 'weeks'); };
                el.appendChild(hideBtn);
                if(!w.locked) el.onclick = () => showContentByObj(w);
                else el.onclick = () => showToast('🔒 This week is currently locked', 'locked');
                grid.appendChild(el);
            });
            if (visibleCount === 0) {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#777; margin-top:30px; font-style:italic;">All weeks are hidden in this view. Use <strong>View Hidden Weeks</strong> to restore them.</div>`;
            }
        } else {
            let found = false;
            sourceArr.forEach((w, i) => {
                if (isWeekHidden(currSub.code, w, isEvent ? 'events' : 'weeks')) return;
                if(w.resources && w.resources[filterType]) {
                    const res = w.resources[filterType];
                    if(res.vis) {
                        found = true;
                        const el = document.createElement('div');
                        
                        const isLocked = w.locked;
                        
                        el.className = 'card' + (isLocked ? ' locked' : '');
                        if(isEvent) el.style.borderLeft = `4px solid var(--accent-blue)`;

                        const customBadge = (w.showBadge && w.badgeText)
                            ? `<div class="custom-badge" style="background:${w.badgeColor || '#e91e8c'}">${w.badgeText}</div>`
                            : '';
                        const resBadgeCard = res.isNew ? '<div style="margin-top:5px;"><span class="badge-new" style="margin-left:0;">NEW!</span></div>' : '';
                        const notesHtml = (res.desc && res.desc.trim()) ? `<div style="margin-top:15px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1); color:var(--text-sub); font-size:0.9rem; line-height:1.4; white-space:pre-wrap;">${res.desc}</div>` : '';
                        
                        el.style.position = 'relative';
                        el.innerHTML = `
                            ${customBadge}
                            <div style="font-size:2.5rem; margin-bottom:10px">${iconMap[filterType] || '📂'}</div>
                            <div style="font-weight:bold; text-transform:uppercase;">${filterType}</div>
                            ${resBadgeCard}
                            <div style="color:#aaa; font-size:0.9rem; margin-top:5px;">${w.title}</div>
                            ${notesHtml}
                        `;
                        const hideBtn = document.createElement('button');
                        hideBtn.className = 'week-hide-btn';
                        hideBtn.innerHTML = '<span class="eye-icon">👁</span>';
                        hideBtn.title = 'Hide this week from this view';
                        hideBtn.onclick = (ev) => { ev.stopPropagation(); hideWeek(currSub.code, w, isEvent ? 'events' : 'weeks'); };
                        el.appendChild(hideBtn);
                        el.onclick = () => {
                            if(isLocked) return alert("Locked");
                            if(res.link && res.link !== "#") window.open(res.link, "_blank");
                            else alert("No link set.");
                        };
                        if (res.link && res.link !== '#') el.dataset.link = res.link;
                        grid.appendChild(el);
                    }
                }
            });
            if(!found) {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#666; margin-top:30px;">No ${filterType} found.</div>`;
            }
        }

        applyWaterfallToContainer(grid, '.card');
        renderHiddenWeeksControls();
    }

    function showContentByObj(weekOrEvent, push = true, from = 'weeks') {
        const section = getWeekSection(weekOrEvent);
        if (currSub && isWeekHidden(currSub.code, weekOrEvent, section)) {
            const key = makeWeekHideKey(currSub.code, section, weekOrEvent.title);
            unhideWeekByKey(key, { silent: true, skipRefresh: true });
            showToast('Hidden week restored', 'todo');
        }
        currentContentObj = weekOrEvent;
        currentContentSourceArr = (currSub && (currSub.events || []).includes(weekOrEvent)) ? currSub.events : (currSub ? currSub.weeks : null);
        const badgeTitle = weekOrEvent.isNew ? '<span class="badge-new">NEW!</span>' : '';
        document.getElementById('week-display-title').innerHTML = `${currSub.code} - ${weekOrEvent.title} ${badgeTitle}`;

        const badgeContainer = document.getElementById('content-badge-container');
        badgeContainer.innerHTML = '';
        if (weekOrEvent.showBadge && weekOrEvent.badgeText) {
            badgeContainer.innerHTML = `<div class="content-badge" style="background:${weekOrEvent.badgeColor || '#e91e8c'}">${weekOrEvent.badgeText}</div>`;
        }

        const details = document.getElementById('week-details');
        const grid = document.getElementById('resources-grid');
        details.innerHTML = ''; grid.innerHTML = '';

        if(!weekOrEvent.resources) weekOrEvent.resources = {};

        if(window.CONFIG && window.CONFIG.resources) {
            window.CONFIG.resources.forEach(conf => {
                const key = conf.name;
                const val = weekOrEvent.resources[key];
                const icon = iconMap[key] || '📂';
                if(val && val.vis) {
                    const resBadgeInline = val.isNew ? '<span class="badge-new">NEW!</span>' : '';
                    if(val.desc && val.desc.trim()) {
                        const row = document.createElement('div');
                        row.className = 'detail-row';
                        row.innerHTML = `<div class=\"detail-icon\">${icon}</div><div class=\"detail-content\"><h3>${key} ${resBadgeInline}</h3><p>${val.desc}</p></div>`;
                        details.appendChild(row);
                    }
                    const resBadgeCard = val.isNew ? '<div style="margin-top:5px;"><span class="badge-new" style="margin-left:0;">NEW!</span></div>' : '';
                    const el = document.createElement('div');
                    el.className = 'card';
                    el.style.position = 'relative';
                    el.innerHTML = `<div style="font-size:2.5rem; margin-bottom:10px">${icon}</div><div style="font-weight:bold; text-transform:uppercase">${key}</div>${resBadgeCard}`;
                    el.onclick = () => {
                        if(val.link && val.link !== "#") window.open(val.link, "_blank");
                        else alert("No link set.");
                    };
                    if (val.link && val.link !== '#') el.dataset.link = val.link;
                    grid.appendChild(el);
                }
            });
        }
        nav('content', push, { subCode: currSub.code, wkObj: weekOrEvent, from: from });
        applySubjectHash();

        // Prev/Next navigation
        const weekNav = document.getElementById('week-nav');
        weekNav.innerHTML = '';
        weekNavPrev = null; weekNavNext = null; weekNavFrom = from;
        const sourceArr = (currSub.events || []).includes(weekOrEvent) ? currSub.events : currSub.weeks;
        if (sourceArr && from !== 'midterm') {
            const idx = sourceArr.indexOf(weekOrEvent);
            for (let i = idx - 1; i >= 0; i--) { if (!sourceArr[i].locked) { weekNavPrev = sourceArr[i]; break; } }
            for (let i = idx + 1; i < sourceArr.length; i++) { if (!sourceArr[i].locked) { weekNavNext = sourceArr[i]; break; } }

            if (weekNavPrev) {
                const btn = document.createElement('button');
                btn.className = 'week-nav-btn';
                btn.innerHTML = `← ${weekNavPrev.title}`;
                btn.onclick = () => showContentByObj(weekNavPrev, false, from);
                weekNav.appendChild(btn);
            } else {
                const spacer = document.createElement('div');
                spacer.className = 'week-nav-spacer';
                weekNav.appendChild(spacer);
            }

            if (weekNavNext) {
                const btn = document.createElement('button');
                btn.className = 'week-nav-btn';
                btn.innerHTML = `${weekNavNext.title} →`;
                btn.onclick = () => showContentByObj(weekNavNext, false, from);
                weekNav.appendChild(btn);
            }
        }
        renderQuickActions();
    }

    document.addEventListener('keydown', function(e) {
        if (document.querySelector('#content-page.active') && !document.querySelector('.modal-overlay.active')) {
            if (e.key === 'ArrowLeft' && weekNavPrev) { e.preventDefault(); showContentByObj(weekNavPrev, false, weekNavFrom); }
            else if (e.key === 'ArrowRight' && weekNavNext) { e.preventDefault(); showContentByObj(weekNavNext, false, weekNavFrom); }
        }
    });

    // ── Touch swipe navigation with flash animation ────────────────────────
    (function() {
        let swipeStartX = 0, swipeStartY = 0, swipeStartT = 0, swipeTracking = false;
        const MIN_X = 55, MAX_Y = 80, MAX_MS = 420;
        let flashTimer = null;

        function showSwipeFlash(dir, label) {
            const elL = document.getElementById('swipe-flash-left');
            const elR = document.getElementById('swipe-flash-right');
            const labelId = dir === 'right' ? 'swipe-flash-left-label' : 'swipe-flash-right-label';
            const labelEl = document.getElementById(labelId);
            if (labelEl) labelEl.textContent = label || (dir === 'right' ? 'PREV' : 'NEXT');
            if (elL) elL.classList.toggle('show', dir === 'right');
            if (elR) elR.classList.toggle('show', dir === 'left');
            if (flashTimer) clearTimeout(flashTimer);
            flashTimer = setTimeout(() => {
                if (elL) elL.classList.remove('show');
                if (elR) elR.classList.remove('show');
            }, 650);
        }

        function formatMonthFromKey(monthKey) {
            if (!monthKey || typeof monthKey !== 'string') return 'Month';
            const parts = monthKey.split('-').map(Number);
            if (parts.length < 2 || !parts[0] || !parts[1]) return 'Month';
            const dt = new Date(parts[0], parts[1] - 1, 1);
            return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }

        function getSwipeAction(dx) {
            const modalOpen = document.querySelector('.modal-overlay.active') || document.querySelector('#share-sheet.active') || (document.getElementById('news-panel') && document.getElementById('news-panel').classList.contains('active'));
            if (modalOpen) return null;

            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) return null;

            const usePrev = dx > 0;
            const activePageId = getActivePageId();

            if (activePageId === 'content') {
                const target = usePrev ? weekNavPrev : weekNavNext;
                if (!target) return null;
                return {
                    flashDir: usePrev ? 'right' : 'left',
                    label: target.title || (usePrev ? 'Previous' : 'Next'),
                    run: () => showContentByObj(target, false, weekNavFrom)
                };
            }

            if (activePageId === 'schedule' && scheduleViewMode === 'calendar') {
                if (calendarAvailableMonths.length === 0 || !calendarMonth) return null;
                const curIdx = calendarAvailableMonths.indexOf(calendarMonth);
                if (curIdx < 0) return null;
                const nextIdx = usePrev ? curIdx - 1 : curIdx + 1;
                if (nextIdx < 0 || nextIdx >= calendarAvailableMonths.length) return null;
                const nextMonth = calendarAvailableMonths[nextIdx];
                return {
                    flashDir: usePrev ? 'right' : 'left',
                    label: formatMonthFromKey(nextMonth),
                    run: () => { calendarMonth = nextMonth; renderScheduleContent(); }
                };
            }

            if (activePageId === 'weeks' && currSub) {
                const subjectTabs = ['weeks', 'events', 'playlists', 'details'];
                const currentIdx = subjectTabs.indexOf(currentSubjectView);
                if (currentIdx >= 0) {
                    const nextIdx = usePrev
                        ? (currentIdx - 1 + subjectTabs.length) % subjectTabs.length
                        : (currentIdx + 1) % subjectTabs.length;
                    const nextTab = subjectTabs[nextIdx];
                    const btn = document.getElementById(`tab-${nextTab}`);
                    const tabLabel = btn ? btn.textContent.trim() : nextTab;
                    return {
                        flashDir: usePrev ? 'right' : 'left',
                        label: tabLabel,
                        run: () => renderSubjectView(nextTab)
                    };
                }
            }

            const idx = getCurrentTabIndex();
            if (idx < 0) return null;
            const nextIdx = usePrev
                ? (idx - 1 + NAV_TAB_ORDER.length) % NAV_TAB_ORDER.length
                : (idx + 1) % NAV_TAB_ORDER.length;
            const nextTab = NAV_TAB_ORDER[nextIdx];
            return {
                flashDir: usePrev ? 'right' : 'left',
                label: getPageLabel(nextTab),
                run: () => openTopLevelTab(nextTab)
            };
        }

        document.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 1) return;
            if (e.target && e.target.closest && e.target.closest('.modal-content, .news-panel-card, .share-sheet-card, .nav-links.open, .tt-grid-wrap')) return;
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
            swipeStartT = Date.now();
            swipeTracking = true;
        }, { passive: true });

        document.addEventListener('touchmove', function(e) {
            if (!swipeTracking || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - swipeStartX;
            const dy = e.touches[0].clientY - swipeStartY;
            if (Math.abs(dx) < 28 || Math.abs(dy) > MAX_Y) return;
            const action = getSwipeAction(dx);
            if (action) showSwipeFlash(action.flashDir, action.label || '');
        }, { passive: true });

        document.addEventListener('touchend', function(e) {
            if (!swipeTracking || e.changedTouches.length !== 1) return;
            swipeTracking = false;
            const dx = e.changedTouches[0].clientX - swipeStartX;
            const dy = e.changedTouches[0].clientY - swipeStartY;
            if (Date.now() - swipeStartT > MAX_MS || Math.abs(dx) < MIN_X || Math.abs(dy) > MAX_Y) return;
            const action = getSwipeAction(dx);
            if (action && typeof action.run === 'function') action.run();
        }, { passive: true });
    })();
    function toggleHotkeysPanel() {
        document.getElementById('hotkeys-panel').classList.toggle('visible');
    }
    document.addEventListener('click', function(e) {
        const panel = document.getElementById('hotkeys-panel');
        const fab = document.getElementById('hotkeys-fab');
        if (panel && fab && !panel.contains(e.target) && !fab.contains(e.target)) {
            panel.classList.remove('visible');
        }
    });

    // Auto-close subject filter dropdown (weeks/exam materials) on outside click or tab switch
    function closeSubjectFilterDropdown() {
        const wrap = document.getElementById('filter-bar-wrap');
        if (!wrap) return;
        const pnl = wrap.querySelector('.fp-panel');
        const tgl = wrap.querySelector('.fp-toggle');
        if (pnl && pnl.classList.contains('open')) {
            pnl.classList.remove('open');
            if (tgl) tgl.classList.remove('open');
            fpOpenState.playlist = false;
        }
    }
    document.addEventListener('click', function(e) {
        const wrap = document.getElementById('filter-bar-wrap');
        if (wrap && !wrap.contains(e.target)) {
            closeSubjectFilterDropdown();
        }
    });
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) closeSubjectFilterDropdown();
    });

    function isPC() {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    function getActivePageId() {
        const active = document.querySelector('.page.active');
        if (!active || !active.id) return 'home';
        return active.id.replace('-page', '');
    }

    function getCurrentTabIndex() {
        const activePageId = getActivePageId();
        const mapped = (activePageId === 'weeks' || activePageId === 'content') ? 'home' : activePageId;
        return NAV_TAB_ORDER.indexOf(mapped);
    }

    function handleArrowTabNavigation(e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
        const activePageId = getActivePageId();

        // Inside a subject page, arrows switch between Weeks/Exam Materials/Details/Useful Links.
        if (activePageId === 'weeks' && currSub) {
            const subjectTabs = ['weeks', 'events', 'playlists', 'details'];
            const currentIdx = subjectTabs.indexOf(currentSubjectView);
            if (currentIdx >= 0) {
                const delta = (e.key === 'ArrowRight') ? 1 : -1;
                const nextIdx = (currentIdx + delta + subjectTabs.length) % subjectTabs.length;
                e.preventDefault();
                renderSubjectView(subjectTabs[nextIdx]);
                return true;
            }
        }

        // Exception 1: inside a week content page, arrows stay for week navigation.
        if (activePageId === 'content') return false;

        // Exception 2: in schedule calendar view, arrows stay for month navigation.
        if (activePageId === 'schedule' && scheduleViewMode === 'calendar') return false;

        const idx = getCurrentTabIndex();
        if (idx < 0) return false;

        const delta = (e.key === 'ArrowRight') ? 1 : -1;
        const nextIdx = (idx + delta + NAV_TAB_ORDER.length) % NAV_TAB_ORDER.length;
        const nextTab = NAV_TAB_ORDER[nextIdx];
        e.preventDefault();
        openTopLevelTab(nextTab);
        return true;
    }

    document.addEventListener('keydown', function(e) {
        if (!isPC()) return;
        // Skip if user is typing in an input/textarea/select or contenteditable element
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
        // Skip if modal is open (except Escape)
        const modalOpen = document.querySelector('.modal-overlay.active');

        if (e.key === 'Escape') {
            const newsOpen = document.getElementById('news-panel');
            if (newsOpen && newsOpen.classList.contains('active')) { closeNewsPanel(null, true); e.preventDefault(); return; }
            const shareOpen = document.querySelector('#share-sheet.active');
            if (shareOpen) { closeShareSheet(null, true); e.preventDefault(); return; }
            if (modalOpen) { closeModal(null, true); e.preventDefault(); return; }
            const panel = document.getElementById('hotkeys-panel');
            if (panel && panel.classList.contains('visible')) { panel.classList.remove('visible'); e.preventDefault(); return; }
            if (!document.querySelector('#home-page.active')) { smartBack(); e.preventDefault(); return; }
        }

        if (e.key === 'Backspace') {
            if (modalOpen) { closeModal(null, true); e.preventDefault(); return; }
            e.preventDefault();
            smartBack();
            return;
        }

        if (modalOpen) return;

        if (handleArrowTabNavigation(e)) return;

        // Shift+P — Open Course Drive
        if (e.shiftKey && e.key === 'P') {
            e.preventDefault();
            if (currSub && currSub.driveLink && currSub.driveLink.trim() !== '') {
                window.open(currSub.driveLink, '_blank', 'noopener');
            }
            return;
        }

        if (e.key === 'Home') { e.preventDefault(); window.scrollTo({top:0, behavior:'smooth'}); return; }
        if (e.key === 'End') { e.preventDefault(); window.scrollTo({top:document.documentElement.scrollHeight, behavior:'smooth'}); return; }

        const key = e.key.toLowerCase();
        if (key === 's') { e.preventDefault(); nav('home'); }
        else if (key === 't') { e.preventDefault(); showSchedule(); }
        else if (key === 'd') { e.preventDefault(); showDeadlines(); }
        else if (key === 'm') { e.preventDefault(); showMidterms(true, 'home'); }
        else if (key === 'l') { e.preventDefault(); showUsefulLinks(true, currentUsefulFilter, currentUsefulSubject); }
        else if (key === 'h') { e.preventDefault(); showRecent(); }
        else if (key === 'g') { e.preventDefault(); showGpa(); }
    });

    function nav(id, push = true, stateData = {}) { 
        closeMobileMenu();
        closeAllDropdowns();
        if (currentPageId !== id) previousPageId = currentPageId;
        const alreadyHere = currentPageId === id;
        const fromPageId = currentPageId;
        if (!alreadyHere) cleanupHeavyViewDom(fromPageId);
        currentPageId = id;
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); 
        document.getElementById(id+'-page').classList.add('active'); 
        window.scrollTo(0,0);
        // Toggle body class so CSS can react to which page is active
        document.body.className = document.body.className.replace(/\bpage-\S+/g, '').trim();
        document.body.classList.add('page-' + id);
        if(push) {
            if (alreadyHere) history.replaceState({page: id, ...stateData}, null, "#" + id);
            else history.pushState({page: id, ...stateData}, null, "#" + id);
        }
        updateNavActive(id);
        updateBackButtons();
        renderQuickActions();
        requestAnimationFrame(animateActivePageWaterfall);
    }

    // ===== NAVBAR LOGIC =====
    function updateNavActive(pageId) {
        document.querySelectorAll('.nav-link[data-nav]').forEach(el => el.classList.remove('active'));
        let navId = pageId;
        if(navId === 'content' || navId === 'weeks') navId = 'home';
        const activeLink = document.querySelector('.nav-link[data-nav="' + navId + '"]');
        if(activeLink) activeLink.classList.add('active');
    }

    function navFromBar(id) {
        if (isMobile()) {
            const navLink = document.querySelector('.nav-link[data-nav="' + id + '"]');
            if (navLink && navLink.querySelector('.nav-chevron')) {
                const item = navLink.closest('.nav-item');
                const wasOpen = item.classList.contains('dd-open');
                closeAllDropdowns();
                if (!wasOpen) {
                    item.classList.add('dd-open');
                    return; // keep menu open to show dropdown
                }
                // dropdown was open, user tapped again — navigate to the page
            }
        }
        
        closeMobileMenu();
        closeAllDropdowns();
        
        if(id === 'home') nav('home');
        else if(id === 'recent') showRecent();
        else if(id === 'schedule') showSchedule();
        else if(id === 'deadlines') showDeadlines();
        else if(id === 'midterm') showMidterms(true, 'home');
        else if(id === 'useful-links') showUsefulLinks(true, currentUsefulFilter, currentUsefulSubject);
        else if(id === 'timetable') showTimetable();
        else if(id === 'directory') showDirectory();
        else if(id === 'gpa') showGpa();
        else if(id === 'updates') showUpdates();
    }

    function toggleNavMenu() {
        const links = document.getElementById('nav-links');
        const btn = document.getElementById('nav-hamburger');
        const overlay = document.getElementById('nav-overlay');
        links.classList.toggle('open');
        const isOpen = links.classList.contains('open');
        btn.innerHTML = isOpen ? '✕' : '☰';
        if (overlay) overlay.classList.toggle('active', isOpen);
        if (!isOpen) closeAllDropdowns();
        _setMobileUtilsVisibility(!isOpen);
    }

    function _setMobileUtilsVisibility(visible) {
        if (window.innerWidth > 768) return;
        ['quick-actions','news-fab','hotkeys-fab'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
            el.style.opacity = visible ? '' : '0';
            el.style.pointerEvents = visible ? '' : 'none';
            el.style.transform = visible ? '' : 'scale(0.7)';
        });
    }

    function closeMobileMenu() {
        const links = document.getElementById('nav-links');
        if (links) links.classList.remove('open');
        const btn = document.getElementById('nav-hamburger');
        if (btn) btn.innerHTML = '☰';
        const overlay = document.getElementById('nav-overlay');
        if (overlay) overlay.classList.remove('active');
        _setMobileUtilsVisibility(true);
    }

    function closeNavOverlay() {
        closeMobileMenu();
        closeAllDropdowns();
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.nav-item.dd-open').forEach(el => el.classList.remove('dd-open'));
    }

    function toggleHomeOthers() {
        const area = document.getElementById('home-others-expand');
        const btn = document.querySelector('.others-toggle-btn');
        if (!area) return;
        area.classList.toggle('show');
        if (btn) btn.classList.toggle('expanded');
    }

    function isMobile() { return window.innerWidth <= 768; }

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.navbar') && !e.target.closest('.nav-overlay')) closeAllDropdowns();
    });

    // ── lazy dropdown population ─────────────────────────────────────────────
    // Each dropdown is populated the first time it becomes visible (hover/open).
    // 'dd-populated' class is added so it is only built once.
    const DD_POPULATORS = {
        'dd-subjects':   populateSubjectsDropdown,
        'dd-schedule':   populateScheduleDropdown,
        'dd-deadlines':  populateDeadlinesDropdown,
        'dd-midterms':   populateMidtermsDropdown,
        'dd-useful':     populateUsefulDropdown,
        'dd-directory':  populateStaffDropdown,
    };

    function populateDropdownIfNeeded(ddEl) {
        if (!ddEl || ddEl.classList.contains('dd-populated')) return;
        const fn = DD_POPULATORS[ddEl.id];
        if (fn) { fn(); ddEl.classList.add('dd-populated'); }
    }

    // Desktop: populate on first hover over the nav-item
    document.querySelectorAll('.nav-item').forEach(function(item) {
        var dd = item.querySelector('.nav-dropdown');
        if (!dd) return;
        item.addEventListener('mouseenter', function() {
            if (isMobile()) return;
            // position the dropdown
            var rect = item.getBoundingClientRect();
            dd.style.top  = (rect.bottom + 8) + 'px';
            dd.style.left = (rect.left + rect.width / 2) + 'px';
            // lazy populate
            populateDropdownIfNeeded(dd);
        });
    });

    // Mobile: populate when dd-open is added (navFromBar adds it)
    // We patch closeAllDropdowns to also catch the open event via a MutationObserver
    const _navLinks = document.getElementById('nav-links');
    if (_navLinks) {
        new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                if (m.type === 'attributes' && m.attributeName === 'class') {
                    const item = m.target;
                    if (item.classList.contains('dd-open')) {
                        const dd = item.querySelector('.nav-dropdown');
                        populateDropdownIfNeeded(dd);
                    }
                }
            });
        }).observe(_navLinks, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    document.getElementById('nav-links').addEventListener('scroll', closeAllDropdowns);

    function populateSubjectsDropdown() {
        const dd = document.getElementById('dd-subjects');
        if(!dd || !window.COURSE_DATA) return;
        let html = '<div class="dd-header">Jump to subject</div>';
        getHomepageOrderedSubjects().forEach(s => {
            const color = getSubjectColor(s.code);
            const weekCount = (s.weeks || []).filter(w => !w.locked).length;
            html += `<div class="dd-item" onclick="event.stopPropagation(); closeAllDropdowns(); ddGoSubject('${s.code}')">`;
            html += `<span class="dd-dot" style="background:${color}"></span>`;
            html += `<span class="dd-label">${s.name}</span>`;
            html += `<span class="dd-meta">${weekCount} wk</span>`;
            html += `</div>`;
        });
        dd.innerHTML = html;
    }

    function ddGoSubject(code) {
        const sub = window.COURSE_DATA.find(s => s.code === code);
        if(sub) { showWeeks(sub); }
        closeMobileMenu();
    }

    function populateScheduleDropdown() {
        const dd = document.getElementById('dd-schedule');
        if(!dd || !window.SCHEDULE_DATA) return;
        let targetWeek = null;
        const todayDate = new Date();
        for(let i = 0; i < window.SCHEDULE_DATA.length; i++) {
            const wk = window.SCHEDULE_DATA[i];
            const { start: wkStart, end: wkEnd } = getWeekDates(wk.week);
            if (todayDate >= wkStart && todayDate <= wkEnd) { targetWeek = wk; break; }
        }
        if(!targetWeek) {
            for(let i = 0; i < window.SCHEDULE_DATA.length; i++) {
                const wk = window.SCHEDULE_DATA[i];
                if(getVisibleScheduleTasks(wk.tasks).some(t => !t.isCompleted)) { targetWeek = wk; break; }
            }
        }
        let html = '<div class="dd-header">This period</div>';
        if(!targetWeek || !targetWeek.tasks || targetWeek.tasks.length === 0) {
            html += '<div class="dd-empty">No tasks right now</div>';
        } else {
            getVisibleScheduleTasks(targetWeek.tasks).slice(0, 5).forEach((t, ti) => {
                const color = getSubjectColor(t.sub);
                const realIdx = (targetWeek.tasks || []).indexOf(t);
                html += `<div class="dd-item" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showSchedule(); setTimeout(()=>openModal(${window.SCHEDULE_DATA.indexOf(targetWeek)},${realIdx}),150);">`;
                html += `<span class="dd-icon">${t.icon}</span>`;
                html += `<span class="dd-dot" style="background:${color}; width:6px; height:6px;"></span>`;
                html += `<span class="dd-label">${t.name}</span>`;
                html += `<span class="dd-meta">${t.sub}</span>`;
                html += `</div>`;
            });
            if(getVisibleScheduleTasks(targetWeek.tasks).length > 5) {
                html += `<div class="dd-footer"><div class="dd-item" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showSchedule();">View all (Week ${targetWeek.week}) →</div></div>`;
            }
        }
        html += `<div class="dd-footer"><div class="dd-item" style="color:#ff9500;" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showSchedule();">Open full schedule →</div></div>`;
        dd.innerHTML = html;
    }

    function populateDeadlinesDropdown() {
        const dd = document.getElementById('dd-deadlines');
        const badge = document.getElementById('dd-deadline-count');
        if(!dd || !window.SCHEDULE_DATA) return;

        let upcoming = [];
        const now = Date.now();
        window.SCHEDULE_DATA.forEach((wk, wIndex) => {
            getVisibleScheduleTasks(wk.tasks).forEach((t) => {
                const tIndex = (wk.tasks || []).indexOf(t);
                const signature = buildScheduleDeadlineSignature(wIndex, tIndex, wk.week, t);
                if (getDeadlineState(signature) !== 'active') return;
                if(t.isCompleted) return;
                const parsedStart = getTaskEffectiveDeadlineMeta(t, wk.week);
                const ts = parsedStart.timestamp;
                const compareTs = parsedStart.hasTime ? ts : getEndOfDayTimestamp(ts);
                if(ts === 0 || compareTs <= now) {
                    // For tasks with an end date currently ongoing, show them specially
                    if(t.deadlineEndDate && compareTs <= now) {
                        const parsedEnd = parseDateMeta(t.deadlineEndDate);
                        const tsEnd = parsedEnd.timestamp;
                        const compareEndTs = parsedEnd.hasTime ? tsEnd : getEndOfDayTimestamp(tsEnd);
                        if(compareEndTs > now) upcoming.unshift({ task: t, ts, compareTs, wIndex, tIndex, week: wk.week, isOngoing: true });
                    }
                    return;
                }
                upcoming.push({ task: t, ts, compareTs, wIndex, tIndex, week: wk.week }); 
            });
        });
        (window.NEWS_DATA || []).forEach((n, newsIndex) => {
            if (!n || !n.hasDeadline) return;
            if (n.sub && isSubjectHidden(n.sub)) return;
            const signature = buildNewsDeadlineSignature(newsIndex, n);
            if (getDeadlineState(signature) !== 'active') return;
            const ts = parseNewsDeadlineTs(n.deadlineDate, n.deadlineTime);
            const hasExplicitTime = !!(n.deadlineTime && String(n.deadlineTime).trim() !== '');
            const compareTs = hasExplicitTime ? ts : getEndOfDayTimestamp(ts);
            if (ts === 0 || compareTs <= now) return;
            upcoming.push({
                task: { icon: n.emoji || '📢', name: n.title || 'Announcement', sub: n.sub || 'NEWS' },
                ts,
                compareTs,
                source: 'news',
                newsIndex,
                week: 'News'
            });
        });
        upcoming.sort((a,b) => { if(a.isOngoing && !b.isOngoing) return -1; if(!a.isOngoing && b.isOngoing) return 1; return a.compareTs - b.compareTs; });

        if(badge) {
            if(upcoming.length > 0) {
                const first = upcoming[0];
                let badgeText = '';
                let badgeBg = 'rgba(0, 229, 255, 0.2)';
                let badgeColor = '#00E5FF';

                if (first.isOngoing) {
                    badgeText = '⬤';
                    badgeBg = 'rgba(52, 199, 89, 0.2)';
                    badgeColor = '#34c759';
                } else {
                    const closestMs = first.compareTs - now;
                    const d = Math.floor(closestMs / (1000 * 60 * 60 * 24));
                    const h = Math.floor((closestMs / (1000 * 60 * 60)) % 24);
                    if(d > 0) badgeText = d + 'd';
                    else if (h > 0) badgeText = h + 'h';
                    else badgeText = '<1h';
                    if (d <= 1) {
                        badgeBg = 'rgba(255, 59, 48, 0.2)';
                        badgeColor = '#ff3b30';
                    }
                }

                badge.textContent = badgeText;
                badge.style.display = 'inline-block';
                badge.style.background = badgeBg;
                badge.style.color = badgeColor;
            } else { 
                badge.style.display = 'none'; 
            }
        }

        let html = '<div class="dd-header">Upcoming deadlines</div>';
        if(upcoming.length === 0) {
            html += '<div class="dd-empty">🎉 All clear!</div>';
        } else {
            upcoming.slice(0, 4).forEach(item => {
                const d = new Date(item.ts);
                const diff = item.compareTs - now;
                const daysLeft = (() => {
                    const totalHours = diff / (1000 * 60 * 60);
                    const fullDays = Math.floor(totalHours / 24);
                    const remainHours = totalHours - fullDays * 24;
                    // Round up only if remainder >= 16h, otherwise floor
                    return remainHours >= 16 ? fullDays + 1 : fullDays;
                })();
                let urgency = 'dd-deadline-ok';
                let timeLabel = daysLeft + 'd';
                if(item.isOngoing) { urgency = ''; timeLabel = 'NOW'; }
                else if(daysLeft <= 0) { urgency = 'dd-deadline-urgent'; timeLabel = 'TODAY'; }
                else if(daysLeft === 1) { urgency = 'dd-deadline-urgent'; timeLabel = 'TOMORROW'; }
                else if(daysLeft <= 3) { urgency = 'dd-deadline-soon'; }

                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const dateStr = d.getDate() + ' ' + months[d.getMonth()];
                const clickAction = item.source === 'news'
                    ? `event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); openNewsPanel();`
                    : `event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); goToScheduleTask(${item.wIndex},${item.tIndex});`;
                html += `<div class="dd-item ${urgency}" onclick="${clickAction}">`;
                html += `<span class="dd-icon">${item.task.icon}</span>`;
                html += `<span class="dd-label">${item.task.name} <span style='color:#888; font-size:0.75rem;'>${item.task.sub}</span></span>`;
                html += `<span class="dd-meta" style="${daysLeft<=1?'color:#ff3b30; font-weight:700;':daysLeft<=3?'color:#ff9500;':''}">${timeLabel}</span>`;
                html += `</div>`;
            });
            if(upcoming.length > 4) {
                html += `<div class="dd-footer"><div class="dd-item" style="color:#00E5FF;" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showDeadlines();">See all ${upcoming.length} deadlines →</div></div>`;
            }
        }
        dd.innerHTML = html;
    }

    function populateMidtermsDropdown() {
        const dd = document.getElementById('dd-midterms');
        if(!dd || !window.MIDTERM_DATA) return;
        let html = '<div class="dd-header">Exam schedule</div>';
        if(window.MIDTERM_DATA.length === 0) {
            html += '<div class="dd-empty">No exams configured</div>';
        } else {
            let lastDate = '';
            window.MIDTERM_DATA.slice(0, 6).forEach((exam, idx) => {
                let subName = exam.sub;
                const sObj = window.COURSE_DATA ? window.COURSE_DATA.find(s => s.code === exam.sub) : null;
                if(sObj) subName = sObj.name;
                const color = getSubjectColor(exam.sub);

                if(exam.dateLabel !== lastDate) {
                    html += `<div style="font-size:0.65rem; color:#666; letter-spacing:1.5px; text-transform:uppercase; padding:8px 12px 2px; font-weight:bold;">${exam.dateLabel}</div>`;
                    lastDate = exam.dateLabel;
                }
                html += `<div class="dd-item" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showMidterms(true,'home'); setTimeout(()=>openMidtermModal(${idx}),150);">`;
                html += `<span class="dd-dot" style="background:${color}"></span>`;
                html += `<span class="dd-label">${subName}</span>`;
                html += `<span class="dd-meta" style="font-family:'Orbitron',sans-serif; font-size:0.7rem; color:#007aff;">${exam.time}</span>`;
                html += `</div>`;
            });
            if(window.MIDTERM_DATA.length > 6) {
                html += `<div class="dd-footer"><div class="dd-item" style="color:#007aff;" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showMidterms(true,'home');">View all ${window.MIDTERM_DATA.length} exams →</div></div>`;
            }
        }
        dd.innerHTML = html;
    }

    function populateUsefulDropdown() {
        const dd = document.getElementById('dd-useful');
        if(!dd || !window.COURSE_DATA) return;
        let html = '<div class="dd-header">Filter by Subject</div>';

        const usefulSubjects = getVisibleCourseSubjects().filter(s => s.playlists && s.playlists.length > 0);
        usefulSubjects.slice(0, 5).forEach(s => {
                const color = getSubjectColor(s.code);
                html += `<div class="dd-item" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showUsefulLinks(true, 'All Links', '${s.code}');">`;
                html += `<span class="dd-dot" style="background:${color}"></span>`;
                html += `<span class="dd-label">${s.name}</span>`;
                html += `<span class="dd-meta">${s.playlists.length} links</span>`;
                html += `</div>`;
        });

        if (usefulSubjects.length === 0) {
            html += '<div class="dd-empty">No links added yet</div>';
        } else {
            html += `<div class="dd-footer"><div class="dd-item" style="color:var(--accent-purple);" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showUsefulLinks(true, 'All Links', 'All Subjects');">View all subjects →</div></div>`;
        }
        dd.innerHTML = html;
    }

    function populateStaffDropdown() {
        const dd = document.getElementById('dd-directory');
        if(!dd || !window.STAFF_DATA || !window.COURSE_DATA) return;
        let html = '<div class="dd-header">Staff by Subject</div>';
        let count = 0;
        const staffSubjects = [];
        const visibleStaff = getVisibleStaffData(window.STAFF_DATA || []);
        getVisibleCourseSubjects().forEach(s => {
            const staff = visibleStaff.filter(p => (p.subjects || []).includes(s.code));
            if (staff.length > 0) {
                staffSubjects.push({ s, staff });
            }
        });

        staffSubjects.slice(0, 5).forEach(entry => {
                const s = entry.s;
                const staff = entry.staff;
                const color = getSubjectColor(s.code);
                const docs = staff.filter(p => p.role === 'doctor').length;
                const tas = staff.filter(p => p.role === 'ta').length;
                let meta = [];
                if (docs) meta.push(docs + ' Dr');
                if (tas) meta.push(tas + ' TA');
                html += `<div class="dd-item" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showDirectory(true);">`;
                html += `<span class="dd-dot" style="background:${color}"></span>`;
                html += `<span class="dd-label">${s.name}</span>`;
                html += `<span class="dd-meta">${meta.join(', ')}</span>`;
                html += `</div>`;
                count++;
        });
        if (count === 0) {
            html += '<div class="dd-empty">No staff added yet</div>';
        } else {
            html += `<div class="dd-footer"><div class="dd-item" style="color:#34c759;" onclick="event.stopPropagation(); closeAllDropdowns(); closeMobileMenu(); showDirectory(true);">View all staff →</div></div>`;
        }
        dd.innerHTML = html;
    }

    function populateAllDropdowns() {
        populateSubjectsDropdown();
        populateScheduleDropdown();
        populateDeadlinesDropdown();
        populateMidtermsDropdown();
        populateUsefulDropdown();
        populateStaffDropdown();
    }

    window.addEventListener('scroll', function() {
        document.getElementById('main-navbar').classList.toggle('scrolled', window.scrollY > 10);
        const btnUp = document.getElementById('back-to-top');
        const btnDown = document.getElementById('scroll-to-bottom');
        const scrollY = window.scrollY;
        const atBottom = (window.innerHeight + scrollY) >= (document.documentElement.scrollHeight - 80);
        const tallEnough = document.documentElement.scrollHeight > window.innerHeight + 200;
        if(btnUp) btnUp.classList.toggle('visible', scrollY > 300);
        if(btnDown) btnDown.classList.toggle('visible', !atBottom && tallEnough);
    });

    // Toast notification system
    function showToast(message, type = 'locked') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-bottom-right toast-${type}`;
        toast.innerHTML = message;
        container.appendChild(toast);
        requestAnimationFrame(() => { toast.classList.add('show'); });
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    function eHtml(str) {
        return String(str || '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
    }

    function parseNewsDeadlineTs(dateStr, timeStr) {
        if (!dateStr || String(dateStr).trim() === '') return 0;
        const d = new Date(String(dateStr).trim() + 'T00:00:00');
        if (isNaN(d.getTime())) return 0;
        if (!timeStr || String(timeStr).trim() === '') return d.getTime();
        const t = String(timeStr).trim().toUpperCase();
        const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
        if (!m) return d.getTime();
        let hh = parseInt(m[1], 10);
        const mm = parseInt(m[2] || '0', 10);
        const ampm = m[3] || '';
        if (ampm === 'PM' && hh < 12) hh += 12;
        if (ampm === 'AM' && hh === 12) hh = 0;
        d.setHours(hh, mm, 0, 0);
        return d.getTime();
    }

    function matchUsefulFilter(playlist, filterType) {
        if (filterType === 'All Links') return true;
        const t = (playlist.title || '').toLowerCase();
        const n = (playlist.note || '').toLowerCase();
        const btext = (playlist.badges || []).map(b => (b.text || '').toLowerCase()).join(' ');
        const all = t + ' ' + n + ' ' + btext;
        const kw = (filterType || '').toLowerCase();
        if (kw === 'lectures') return all.includes('lecture');
        if (kw === 'tutorials') return all.includes('section') || all.includes('tutorial');
        if (kw === 'labs') return all.includes('lab');
        if (kw === 'projects') return all.includes('project');
        if (kw === 'presentations') return all.includes('presentation');
        return true;
    }

    function getVisibleResources(itemObj) {
        const out = [];
        const conf = (window.CONFIG && window.CONFIG.resources) ? window.CONFIG.resources : [];
        conf.forEach(r => {
            const val = itemObj && itemObj.resources ? itemObj.resources[r.name] : null;
            if (val && val.vis) out.push({ name: r.name, desc: val.desc || '', link: val.link || '' });
        });
        return out;
    }

    function collectUsefulLinksSelection(subjectFilter, filterType) {
        const groups = [];
        getVisibleCourseSubjects().forEach(sub => {
            const subSet = subjectFilter instanceof Set ? subjectFilter : new Set();
            if (subSet.size > 0 && !subSet.has(sub.code)) return;
            const links = (sub.playlists || []).filter(p => matchUsefulFilter(p, filterType));
            if (links.length) groups.push({ subCode: sub.code, subName: sub.name, links });
        });
        return groups;
    }

    function collectUpcomingDeadlinesData() {
        const now = Date.now();
        const out = [];
        (window.SCHEDULE_DATA || []).forEach((wk, wIndex) => {
            getVisibleScheduleTasks(wk.tasks).forEach(t => {
                const tIndex = (wk.tasks || []).indexOf(t);
                if (t.isCompleted) return;
                const parsedStart = getTaskEffectiveDeadlineMeta(t, wk.week);
                const tsStart = parsedStart.timestamp;
                if (tsStart === 0) return;
                const compareStartTs = parsedStart.hasTime ? tsStart : getEndOfDayTimestamp(tsStart);
                if (t.deadlineEndDate && t.deadlineEndDate.trim() !== '') {
                    const parsedEnd = parseDateMeta(t.deadlineEndDate);
                    const tsEnd = parsedEnd.timestamp;
                    const compareEndTs = parsedEnd.hasTime ? tsEnd : getEndOfDayTimestamp(tsEnd);
                    if (compareEndTs > now && tsStart <= now) {
                        out.push({ wIndex, tIndex, week: wk.week, task: t, ts: tsStart, compareTs: compareStartTs, isOngoing: true, endTs: tsEnd });
                        return;
                    }
                }
                if (compareStartTs >= now) out.push({ wIndex, tIndex, week: wk.week, task: t, ts: tsStart, compareTs: compareStartTs, isOngoing: false });
            });
        });
        (window.NEWS_DATA || []).forEach((n, newsIndex) => {
            if (!n || !n.hasDeadline) return;
            if (n.sub && isSubjectHidden(n.sub)) return;
            const ts = parseNewsDeadlineTs(n.deadlineDate, n.deadlineTime);
            const hasExplicitTime = !!(n.deadlineTime && String(n.deadlineTime).trim() !== '');
            const compareTs = hasExplicitTime ? ts : getEndOfDayTimestamp(ts);
            if (ts === 0 || compareTs < now) return;
            out.push({
                source: 'news',
                newsIndex,
                week: 'News',
                task: { icon: n.emoji || '📢', name: n.title || 'Announcement', sub: n.sub || 'NEWS' },
                ts,
                compareTs,
                isOngoing: false
            });
        });
        out.sort((a,b) => (a.compareTs || a.ts) - (b.compareTs || b.ts));
        return out;
    }

    function formatDateTs(ts) {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString([], { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    }

    function formatDeadlineCompactDateTime(ts) {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        const day = d.getDate();
        const month = d.getMonth() + 1;
        let hour = d.getHours();
        const minute = String(d.getMinutes()).padStart(2, '0');
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;
        return `(${day}/${month}) at ${hour}:${minute} ${ampm}`;
    }

    function formatDeadlineTimeLeft(compareTs, nowTs = Date.now()) {
        const diffMs = (Number(compareTs) || 0) - nowTs;
        if (diffMs <= 0) return 'overdue';
        const totalMinutes = Math.floor(diffMs / 60000);
        const days = Math.floor(totalMinutes / (60 * 24));
        const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
        const mins = totalMinutes % 60;
        if (days >= 2) return `${days} days left`;
        if (days === 1) return 'tomorrow';
        if (hours >= 8) return 'today';
        if (hours > 0) return `${hours}h ${mins}m left`;
        return `${Math.max(mins, 1)}m left`;
    }

    function getExportResources(itemObj) {
        const out = [];
        const conf = (window.CONFIG && window.CONFIG.resources) ? window.CONFIG.resources : [];
        conf.forEach(r => {
            const val = itemObj && itemObj.resources ? itemObj.resources[r.name] : null;
            if (!val) return;
            const hasLink = !!(val.link && val.link !== '#');
            const hasDesc = !!(val.desc && String(val.desc).trim() !== '');
            if (val.vis || hasLink || hasDesc) out.push({ name: r.name, desc: val.desc || '', link: val.link || '' });
        });
        return out;
    }

    function getResolvedTeamsLink(link) {
        if (!link) return '';
        const trimmed = String(link).trim();
        if (!trimmed) return '';
        if (/^https?:/i.test(trimmed)) return trimmed;
        return 'https://teams.microsoft.com/l/chat/0/0?users=' + encodeURIComponent(trimmed);
    }

    function getActionPolicy(activePageId) {
        const map = {
            'deadlines': { pdf: true,  word: false, screenshot: false, share: true },
            'weeks':     { pdf: true,  word: true,  screenshot: false, share: true },
            'content':   { pdf: true,  word: true,  screenshot: false, share: true },
            'useful-links': { pdf: true, word: true, screenshot: false, share: true },
            'schedule':  { pdf: false, word: false, screenshot: true,  share: false },
            'midterm':   { pdf: false, word: false, screenshot: false, share: false },
            'timetable': { pdf: false, word: false, screenshot: false, share: false },
            'directory': { pdf: false, word: false, screenshot: false, share: true }
        };
        return map[activePageId] || { pdf: false, word: false, screenshot: false, share: false };
    }

    function buildExportContext() {
        const active = getActivePageId();
        const policy = getActionPolicy(active);
        if (!policy.pdf && !policy.word && !policy.screenshot && !policy.share) return null;

        if (active === 'deadlines') {
            const items = collectUpcomingDeadlinesData();
            const nowTs = Date.now();
            // Collect TBD (no date) tasks
            const tbdItems = [];
            (window.SCHEDULE_DATA || []).forEach(wk => {
                getVisibleScheduleTasks(wk.tasks).forEach(t => {
                    if (t.isCompleted) return;
                    if (getTaskEffectiveDeadlineMeta(t, wk.week).timestamp === 0) {
                        tbdItems.push({ week: wk.week, task: t });
                    }
                });
            });
            const rowsHtml = items.length ? items.map(it => `<li><b>${eHtml(it.task.sub)} - ${eHtml(it.task.name)}</b> (Week ${it.week})${it.isOngoing ? ' <em>ONGOING</em>' : ''}<br><small>${eHtml(formatDateTs(it.ts))}</small></li>`).join('') : '<li>No upcoming deadlines.</li>';
            const rowsTxt = items.length
                ? items.map(it => {
                    const compactTs = formatDeadlineCompactDateTime(it.ts);
                    const leftText = formatDeadlineTimeLeft(it.compareTs || it.ts, nowTs);
                    return `${it.task.sub} - ${it.task.name}${it.isOngoing ? ' [ONGOING]' : ''}  | ${compactTs} | ${leftText}`;
                }).join('\n')
                : '- No upcoming deadlines.';
            const tbdHtml = tbdItems.length ? `<h2>Date TBD</h2><ul>${tbdItems.map(it => `<li><b>${eHtml(it.task.sub)} - ${eHtml(it.task.name)}</b> (Week ${it.week})</li>`).join('')}</ul>` : '';
            const tbdTxt = tbdItems.length ? `\n\n*Date TBD*\n${tbdItems.map(it => `- ${it.task.sub} - ${it.task.name} (Week ${it.week})`).join('\n')}` : '';
            return {
                title: 'Upcoming Deadlines',
                fileBase: `deadlines-${new Date().toISOString().slice(0,10)}`,
                bodyHtml: `<ul>${rowsHtml}</ul>${tbdHtml}`,
                text: `*Upcoming Deadlines*\n\n${rowsTxt}${tbdTxt}`,
                screenshotSelector: '#deadlines-page'
            };
        }

        if (active === 'content' && currSub && currentContentObj) {
            const res = getExportResources(currentContentObj);
            const resHtml = res.length ? `<ul>${res.map(r => `<li><b>${eHtml(r.name)}</b>${r.desc ? ` - ${eHtml(r.desc)}` : ''}${r.link && r.link !== '#' ? ` <br><a href="${eHtml(r.link)}">${eHtml(r.link)}</a>` : ''}</li>`).join('')}</ul>` : '<p>No visible resources.</p>';
            const resTxt = res.length ? res.map(r => `- ${r.name}${r.desc ? `: ${r.desc}` : ''}${r.link && r.link !== '#' ? ` | ${r.link}` : ''}`).join('\n') : '- No visible resources.';
            return {
                title: `${currSub.code} - ${currentContentObj.title}`,
                fileBase: `${currSub.code}-${String(currentContentObj.title || 'week').replace(/\s+/g,'-').toLowerCase()}`,
                bodyHtml: `<p>${eHtml(currentContentObj.note || '')}</p><h2>Resources</h2>${resHtml}`,
                text: `*${currSub.code} - ${currentContentObj.title}*\n${currentContentObj.note ? `${currentContentObj.note}\n` : ''}\n*Resources*\n${resTxt}`,
                screenshotSelector: '#content-page'
            };
        }

        if (active === 'weeks' && currSub) {
            const source = currentSubjectView === 'events' ? (currSub.events || []) : (currentSubjectView === 'playlists' ? (currSub.playlists || []) : (currSub.weeks || []));
            if (currentSubjectView === 'playlists') {
                const htmlRows = source.length ? `<ul>${source.map(p => `<li><b>${eHtml(p.title || 'Link')}</b>${p.note ? ` - ${eHtml(p.note.split('\n')[0])}` : ''}${p.link && p.link !== '#' ? ` <br><a href="${eHtml(p.link)}">${eHtml(p.link)}</a>` : ''}</li>`).join('')}</ul>` : '<p>No links.</p>';
                const txtRows = source.length ? source.map(p => `- ${p.title || 'Link'}${p.note ? `: ${p.note.split('\n')[0]}` : ''}${p.link && p.link !== '#' ? ` | ${p.link}` : ''}`).join('\n') : '- No links.';
                return {
                    title: `${currSub.code} Useful Links`,
                    fileBase: `${currSub.code}-useful-links`,
                    bodyHtml: `${htmlRows}`,
                    text: `*${currSub.code} - Useful Links*\n\n${txtRows}`,
                    screenshotSelector: '#weeks-page'
                };
            }
            const listHtml = source.length ? source.map(item => {
                const vis = getExportResources(item);
                return `<li><b>${eHtml(item.title || 'Untitled')}</b>${item.note ? ` - ${eHtml(item.note)}` : ''}${vis.length ? `<ul>${vis.map(r => `<li>${eHtml(r.name)}${r.desc ? `: ${eHtml(r.desc)}` : ''}${r.link && r.link !== '#' ? ` <br><a href="${eHtml(r.link)}">${eHtml(r.link)}</a>` : ''}</li>`).join('')}</ul>` : ''}</li>`;
            }).join('') : '<li>No entries.</li>';
            const listTxt = source.length ? source.map(item => {
                const vis = getExportResources(item);
                const visTxt = vis.length ? `\n  ${vis.map(r => `- ${r.name}${r.desc ? `: ${r.desc}` : ''}${r.link && r.link !== '#' ? ` | ${r.link}` : ''}`).join('\n  ')}` : '';
                return `- ${item.title || 'Untitled'}${item.note ? `: ${item.note}` : ''}${visTxt}`;
            }).join('\n\n') : '- No entries.';
            const title = currentSubjectView === 'events' ? `${currSub.code} Exam Materials` : `${currSub.code} All Weeks`;
            const base = currentSubjectView === 'events' ? `${currSub.code}-exam-materials` : `${currSub.code}-all-weeks`;
            return {
                title,
                fileBase: base,
                bodyHtml: `<ul>${listHtml}</ul>`,
                text: `*${title}*\n\n${listTxt}`,
                screenshotSelector: '#weeks-page'
            };
        }

        if (active === 'useful-links') {
            const groups = collectUsefulLinksSelection(currentUsefulSubject, currentUsefulFilter);
            const htmlSections = groups.length ? groups.map(g => `<h2>${eHtml(g.subCode)} - ${eHtml(g.subName)}</h2><ul>${g.links.map(p => `<li><b>${eHtml(p.title || 'Link')}</b>${p.note ? ` - ${eHtml(p.note.split('\n')[0])}` : ''}${p.link && p.link !== '#' ? ` <br><a href="${eHtml(p.link)}">${eHtml(p.link)}</a>` : ''}</li>`).join('')}</ul>`).join('') : '<p>No matching links.</p>';
            const txtSections = groups.length ? groups.map(g => [`${g.subCode} - ${g.subName}`, ...g.links.map(p => `- ${p.title || 'Link'}${p.link && p.link !== '#' ? ` | ${p.link}` : ''}`)].join('\n')).join('\n\n') : 'No matching links.';
            const subLabel = currentUsefulSubject.size === 0 ? 'All Subjects' : [...currentUsefulSubject].join('-');
            const t = `${subLabel} - ${currentUsefulFilter}`;
            return {
                title: `Useful Links (${t})`,
                fileBase: `useful-links-${subLabel.toLowerCase().replace(/\s+/g,'-')}-${String(currentUsefulFilter).toLowerCase().replace(/\s+/g,'-')}`,
                bodyHtml: `${htmlSections}`,
                text: `*Useful Links (${t})*\n\n${txtSections}`,
                screenshotSelector: '#useful-links-page'
            };
        }

        if (active === 'schedule') {
            const modeText = scheduleViewMode === 'calendar' ? 'Calendar View' : 'List View';
            return {
                title: `Semester Map (${modeText})`,
                fileBase: `task-schedule-${scheduleViewMode}`,
                bodyHtml: `<p>Screenshot export is recommended for exact table/calendar layout.</p>`,
                text: `*Semester Map (${modeText})*\n\nUse screenshot export for the exact table/calendar layout.`,
                screenshotSelector: scheduleViewMode === 'calendar' ? '#deliverables-grid .calendar-container' : '#deliverables-grid'
            };
        }

        if (active === 'midterm') {
            const rows = (window.MIDTERM_DATA || []).map(m => `- ${m.sub} ${m.examCode ? `(${m.examCode})` : ''} | ${m.dateLabel || ''} ${m.time || ''}`);
            return {
                title: 'Midterm Exams',
                fileBase: 'midterm-exams',
                bodyHtml: `<ul>${rows.map(r => `<li>${eHtml(r.replace(/^-\s*/, ''))}</li>`).join('')}</ul>`,
                text: `*Midterm Exams*\n\n${rows.join('\n') || '- No exams configured.'}`,
                screenshotSelector: '#midterm-page'
            };
        }

        if (active === 'timetable') {
            return {
                title: 'Timetable',
                fileBase: 'timetable',
                bodyHtml: `<p>Screenshot export preserves the exact table layout.</p>`,
                text: '*Timetable*\n\nUse screenshot export for the exact timetable table layout.',
                screenshotSelector: '#timetable-grid'
            };
        }

        if (active === 'directory') {
            const staffData = (window.STAFF_DATA || []).filter(person => {
                if (directoryRoleFilter !== 'all' && person.role !== directoryRoleFilter) return false;
                if (directorySubFilter.size > 0 && !(person.subjects || []).some(s => directorySubFilter.has(s))) return false;
                return true;
            });
            const subLabel = directorySubFilter.size === 0 ? null : [...directorySubFilter].join(', ');
            const title = subLabel ? `Staff Contacts (${subLabel})` : 'Staff Contacts';
            const grouped = {};
            staffData.forEach(person => {
                (person.subjects || []).forEach(subCode => {
                    if (directorySubFilter.size > 0 && !directorySubFilter.has(subCode)) return;
                    if (!grouped[subCode]) grouped[subCode] = [];
                    if (!grouped[subCode].includes(person)) grouped[subCode].push(person);
                });
            });
            const orderedSubjects = Object.keys(grouped).sort();
            const text = orderedSubjects.length ? orderedSubjects.map(subCode => {
                const sObj = (window.COURSE_DATA || []).find(s => s.code === subCode);
                const subTitle = sObj ? `${subCode} - ${sObj.name}` : subCode;
                const rows = grouped[subCode].map(person => {
                    const roleLabel = person.role === 'doctor' ? 'Doctor' : 'TA';
                    const teamsLink = getResolvedTeamsLink(person.teamsLink || '');
                    return [
                        `- ${person.name} [${roleLabel}]`,
                        person.note ? `  Note: ${person.note}` : '',
                        teamsLink ? `  Teams Chat: ${teamsLink}` : ''
                    ].filter(Boolean).join('\n');
                }).join('\n');
                return `${subTitle}\n${rows}`;
            }).join('\n\n') : '- No staff match this filter.';
            return {
                title,
                fileBase: 'staff-contacts',
                bodyHtml: '',
                text: `*${title}*\n\n${text}`,
                screenshotSelector: ''
            };
        }

        return null;
    }

    function renderQuickActions() {
        const qa = document.getElementById('quick-actions');
        if (!qa) return;
        const active = getActivePageId();
        const policy = getActionPolicy(active);
        const actions = [];
        if (policy.pdf)        actions.push({ icon: '📄', label: '📄 Save PDF',    fn: 'downloadContextPdf()' });
        if (policy.word)       actions.push({ icon: '📝', label: '📝 Save Word',   fn: 'downloadContextWord()' });
        if (policy.screenshot) actions.push({ icon: '📸', label: '📸 Screenshot',  fn: 'downloadContextScreenshot()' });
        if (policy.share)      actions.push({ icon: '🔗', label: '🔗 Share',        fn: 'openShareMenu()' });

        if (!actions.length) {
            qa.innerHTML = '';
            qa.classList.remove('visible');
            return;
        }

        if (actions.length === 1) {
            const a = actions[0];
            const titleLabel = a.label.substring(a.label.indexOf(' ') + 1);
            qa.innerHTML = `<button class="qa-btn" title="${titleLabel}" onclick="${a.fn}">${a.icon}</button>`;
        } else {
            const submenuItems = actions.map(a =>
                `<button class="qa-submenu-btn" onclick="closeUtilsMenu();${a.fn}">${a.label}</button>`
            ).join('');
            qa.innerHTML = `<div class="qa-utils-wrap"><button class="qa-btn" title="Utilities" onclick="toggleUtilsMenu(event)">⚙️</button><div class="qa-submenu" id="qa-submenu-popup">${submenuItems}</div></div>`;
        }
        qa.classList.add('visible');
    }

    function toggleUtilsMenu(e) {
        e.stopPropagation();
        const popup = document.getElementById('qa-submenu-popup');
        if (!popup) return;
        popup.classList.toggle('open');
    }

    function closeUtilsMenu() {
        const popup = document.getElementById('qa-submenu-popup');
        if (popup) popup.classList.remove('open');
    }

    function buildWordDoc(title, bodyHtml) {
        return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${eHtml(title)}</title><style>
            body{font-family:'Segoe UI',Arial,sans-serif;color:#111;background:#fff;margin:36pt 48pt;mso-margin-top-alt:auto;mso-margin-bottom-alt:auto;}
            h1{font-size:18pt;color:#1a006a;border-bottom:2pt solid #b519d6;padding-bottom:6pt;margin-bottom:14pt;}
            h2{font-size:13pt;color:#4a0080;margin:16pt 0 6pt;}
            ul{margin:4pt 0 10pt 18pt;padding:0;}
            li{margin-bottom:6pt;line-height:1.55;color:#1a1a2e;font-size:11pt;}
            p{color:#333;font-size:11pt;line-height:1.5;}
            a{color:#1a5cb5;text-decoration:underline;word-break:break-all;}
            b{color:#000;font-weight:700;}
            em{color:#c0006a;font-style:normal;font-weight:600;}
            small{color:#555;font-size:9pt;}
        </style></head><body><h1>${eHtml(title)}</h1>${bodyHtml || ''}</body></html>`;
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    function downloadContextWord() {
        const ctx = buildExportContext();
        if (!ctx) { showToast('Nothing to export from this page.'); return; }
        const doc = buildWordDoc(ctx.title, ctx.bodyHtml || '');
        downloadBlob(new Blob([doc], { type: 'application/msword' }), `${ctx.fileBase}.doc`);
        showToast('Word document created.', 'locked');
    }

    function normalizePdfLine(rawLine) {
        let s = String(rawLine || '');
        s = s.replace(/\u00a0/g, ' ').replace(/&nbsp;/gi, ' ');
        s = s.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"');
        s = s.replace(/þ/g, '');
        s = s.replace(/\s*&\s*þ/g, ' and ');
        s = s.replace(/�/g, '');
        s = s.replace(/\s+/g, ' ').trim();

        // Fix lines that arrive as spaced letters like: P r e- R e q ...
        let prev = '';
        while (s !== prev) {
            prev = s;
            s = s.replace(/\b([A-Za-z])\s+(?=[A-Za-z]\b)/g, '$1');
        }

        s = s.replace(/\s*-\s*/g, '-');
        s = s.replace(/\s{2,}/g, ' ').trim();
        return s;
    }

    function isNoisyPdfLine(line) {
        const noUrls = String(line || '').replace(/https?:\/\/\S+/gi, '');
        const alphaNum = (noUrls.match(/[A-Za-z0-9]/g) || []).length;
        const symbols = (noUrls.match(/[^A-Za-z0-9\s.,:;!?()'"\-]/g) || []).length;
        if (symbols >= 8 && symbols > alphaNum) return true;
        if (/^(?:[&+\-]\s*){4,}/.test(noUrls)) return true;
        if (/(?:&\s*){4,}/.test(noUrls)) return true;
        return false;
    }

    function splitTextAndUrl(line) {
        const m = String(line || '').match(/^(.*?)(https?:\/\/\S+)$/i);
        if (!m) return null;
        const before = m[1].replace(/\|\s*$/, '').trim();
        return { before, url: m[2].trim() };
    }

    function downloadContextPdf() {
        const ctx = buildExportContext();
        if (!ctx) { showToast('Nothing to export from this page.'); return; }

        const jsPdfCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPdfCtor) { showToast('PDF library not available.'); return; }

        try {
            const pdf = new jsPdfCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const margin = 12;
            const usableW = pageW - (margin * 2);
            const maxY = pageH - margin;
            let y = margin;

            const addPageIfNeeded = (neededHeight) => {
                if (y + neededHeight > maxY) {
                    pdf.addPage();
                    y = margin;
                }
            };

            const drawWrapped = (text, color, fontStyle, fontSize, extraTop, extraBottom, indent) => {
                const clean = normalizePdfLine(text);
                if (!clean) return;
                if (extraTop) {
                    addPageIfNeeded(extraTop);
                    y += extraTop;
                }
                pdf.setFont('helvetica', fontStyle);
                pdf.setFontSize(fontSize);
                pdf.setTextColor(color[0], color[1], color[2]);
                const wrapped = pdf.splitTextToSize(clean, usableW - (indent || 0));
                const lineH = fontSize >= 12 ? 6 : 5;
                addPageIfNeeded((wrapped.length * lineH) + (extraBottom || 0));
                pdf.text(wrapped, margin + (indent || 0), y);
                y += wrapped.length * lineH;
                if (extraBottom) y += extraBottom;
            };

            drawWrapped(String(ctx.title || 'Export'), [20, 20, 20], 'bold', 14, 0, 4, 0);

            const contentLines = String(ctx.text || '')
                .replace(/\r/g, '')
                .replace(/\*/g, '')
                .split('\n');

            const normalizedTitle = normalizePdfLine(String(ctx.title || '')).toLowerCase();

            const isHeadingLine = (line) => {
                if (!line) return false;
                if (/^•\s+/.test(line)) return false;
                if (/https?:\/\//i.test(line)) return false;
                return line.length <= 80;
            };

            contentLines.forEach(raw => {
                let line = raw.trimEnd();
                if (!line.trim()) {
                    y += 4;
                    addPageIfNeeded(4);
                    return;
                }

                const isBullet = /^\s*-\s+/.test(line);
                line = line.replace(/^\s*-\s+/, '').trim();
                line = normalizePdfLine(line);
                if (!line) return;

                if (line.toLowerCase() === normalizedTitle) return;
                if (isNoisyPdfLine(line)) return;

                const split = splitTextAndUrl(line);
                if (isBullet && split) {
                    if (split.before) drawWrapped('• ' + split.before, [30, 30, 30], 'normal', 10.5, 0, 1.5, 0);
                    drawWrapped(split.url, [0, 82, 163], 'normal', 10, 0, 1.5, 5);
                    return;
                }
                if (split) {
                    if (split.before) {
                        drawWrapped(split.before, [30, 30, 30], isHeadingLine(split.before) ? 'bold' : 'normal', isHeadingLine(split.before) ? 11.5 : 10.5, isHeadingLine(split.before) ? 1.5 : 0, 1.5, 0);
                    }
                    drawWrapped(split.url, [0, 82, 163], 'normal', 10, 0, 1.5, 5);
                    return;
                }

                if (isBullet) {
                    drawWrapped('• ' + line, [30, 30, 30], 'normal', 10.5, 0, 1.5, 0);
                } else if (isHeadingLine(line)) {
                    drawWrapped(line, [20, 20, 20], 'bold', 11.5, 1.5, 1.5, 0);
                } else {
                    drawWrapped(line, [30, 30, 30], 'normal', 10.5, 0, 1.5, 0);
                }
            });

            pdf.save(`${ctx.fileBase}.pdf`);
            showToast('PDF created.', 'locked');
        } catch (e) {
            showToast('PDF export failed.');
        }
    }

    function getScreenshotTargetElement() {
        const ctx = buildExportContext();
        if (!ctx || !ctx.screenshotSelector) return null;
        return document.querySelector(ctx.screenshotSelector);
    }

    function closeSemesterCaptureModal(e, force = false) {
        if (!force && e && e.target && e.target.id !== 'semester-capture-modal') return;
        const modal = document.getElementById('semester-capture-modal');
        if (modal) modal.classList.remove('active');
    }

    function showSemesterCaptureModeChoices() {
        const body = document.getElementById('semester-capture-body');
        if (!body) return;
        body.innerHTML = `
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-bottom:10px;">
                <button onclick="downloadContextScreenshot({ mode: 'full' }); closeSemesterCaptureModal(null, true);" style="background:rgba(233,30,140,0.1);border:1px solid rgba(233,30,140,0.4);color:#e91e8c;padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.82rem;transition:0.2s;">🗺️ Capture Full Map</button>
                <button onclick="showSemesterCaptureWeekInput()" style="background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.4);color:#00e5ff;padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.82rem;transition:0.2s;">📅 Capture Specific Week</button>
            </div>
            <button onclick="closeSemesterCaptureModal(null, true)" style="display:block;margin:8px auto 0;background:none;border:1px solid #555;color:#888;padding:4px 16px;border-radius:8px;cursor:pointer;font-size:0.78rem;">Cancel</button>
        `;
    }

    function showSemesterCaptureWeekInput() {
        const body = document.getElementById('semester-capture-body');
        if (!body) return;
        body.innerHTML = `
            <div style="font-size:0.76rem; color:#999; text-align:center; margin-bottom:9px; letter-spacing:0.3px;">Enter week number</div>
            <input id="semester-capture-week-input" type="number" min="1" step="1" placeholder="Week #" style="display:block; width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(233,30,140,0.35); color:#fff; border-radius:10px; padding:10px 12px; outline:none; font-size:0.9rem; margin-bottom:10px;">
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
                <button onclick="runSemesterSpecificWeekCapture()" style="background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.4);color:#00e5ff;padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.82rem;transition:0.2s;">📸 Capture</button>
                <button onclick="showSemesterCaptureModeChoices()" style="background:none;border:1px solid #555;color:#888;padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.82rem;transition:0.2s;">← Back</button>
            </div>
        `;
        const input = document.getElementById('semester-capture-week-input');
        if (input) input.focus();
    }

    function runSemesterSpecificWeekCapture() {
        const input = document.getElementById('semester-capture-week-input');
        if (!input) return;
        const week = parseInt(input.value, 10);
        if (!Number.isInteger(week)) {
            showToast('Enter a valid week number.');
            input.focus();
            return;
        }
        closeSemesterCaptureModal(null, true);
        downloadContextScreenshot({ mode: 'specific-week', week: week });
    }

    function openSemesterCaptureModal() {
        showSemesterCaptureModeChoices();
        const modal = document.getElementById('semester-capture-modal');
        if (modal) modal.classList.add('active');
    }

    function downloadContextScreenshot(scheduleCaptureOptions = null) {
        const ctx = buildExportContext();
        if (!ctx) { showToast('No screenshot target on this page.'); return; }

        // Deferred load — retry until html2canvas is available
        if (!window.html2canvas) {
            showToast('⏳ Loading screenshot library...');
            const poll = setInterval(() => {
                if (window.html2canvas) { clearInterval(poll); downloadContextScreenshot(scheduleCaptureOptions); }
            }, 200);
            return;
        }

        const active = getActivePageId();
        const restoreList = [];
        let target = null;
        let shellEl = null;
        let weekWrapperEl = null;
        let scheduleSpecificWeek = null;
        let restoreScheduleMode = null;

        if (active === 'schedule') {
            if (!scheduleCaptureOptions || !scheduleCaptureOptions.mode) {
                openSemesterCaptureModal();
                return;
            }
            if (scheduleCaptureOptions.mode === 'specific-week') {
                scheduleSpecificWeek = parseInt(scheduleCaptureOptions.week, 10);
                if (!Number.isInteger(scheduleSpecificWeek)) {
                    showToast('Invalid week number.');
                    return;
                }
                if (scheduleViewMode === 'calendar') {
                    restoreScheduleMode = 'calendar';
                    scheduleViewMode = 'list';
                    renderScheduleContent();
                }
            }
        }

        // --- Midterm / Finals: build a clean off-screen tile ---
        if (active === 'midterm') {
            const isFinals = (typeof examViewMode !== 'undefined') && examViewMode === 'finals';
            const exams = (isFinals ? (window.FINAL_DATA || []) : (window.MIDTERM_DATA || []));
            const accentColor = isFinals ? '#d97706' : '#007aff';
            const titleText  = isFinals ? 'FINAL EXAMS' : 'MIDTERM EXAMS';

            const shell = document.createElement('div');
            shell.style.cssText = 'position:absolute;left:-9999px;top:0;padding:28px 32px;background:#0a0012;width:820px;font-family:Work Sans,Arial,sans-serif;box-sizing:border-box;';

            const sorted = [...exams].sort((a, b) => {
                const da = a.date || '', db = b.date || '';
                if (da && db && da !== db) return da < db ? -1 : 1;
                return 0;
            });

            let lastDate = '';
            let innerHtml = `<div style="font-family:Orbitron,Arial,sans-serif;font-size:26px;font-weight:900;color:${accentColor};text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">${titleText}</div>`;
            innerHtml += `<div style="font-size:13px;color:#888;margin-bottom:28px;letter-spacing:1px;">Spring 2026</div>`;

            if (sorted.length === 0) {
                innerHtml += `<div style="text-align:center;color:#555;padding:40px 0;font-size:14px;">No exams added yet.</div>`;
            } else {
                sorted.forEach(exam => {
                    if (exam.dateLabel !== lastDate) {
                        innerHtml += `<div style="font-family:Orbitron,Arial,sans-serif;font-size:11px;letter-spacing:2px;color:${accentColor};text-transform:uppercase;margin-bottom:10px;margin-top:22px;font-weight:700;">${eHtml(exam.dateLabel)}</div>`;
                        lastDate = exam.dateLabel;
                    }
                    let subName = exam.sub;
                    const sObj = (window.COURSE_DATA || []).find(s => s.code === exam.sub);
                    if (sObj) subName = sObj.name;
                    innerHtml += `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(${isFinals?'204,34,0':'0,122,255'},0.1);border:1px solid rgba(${isFinals?'204,34,0':'0,122,255'},0.3);border-radius:10px;margin-bottom:8px;">
                        <div style="flex:1;">
                            <div style="color:#fff;font-weight:600;font-size:15px;">${eHtml(subName)}</div>
                            <div style="color:#888;font-size:12px;margin-top:2px;">${eHtml(exam.examCode || '')}</div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="color:${accentColor};font-weight:700;font-size:14px;font-family:Orbitron,sans-serif;">${eHtml(exam.time || '')}</div>
                        </div>
                    </div>`;
                });
            }
            innerHtml += `<div style="text-align:center;margin-top:28px;font-size:11px;color:#555;letter-spacing:3px;">GOOD LUCK &nbsp;✦&nbsp; SPRING 2026</div>`;
            shell.innerHTML = innerHtml;
            document.body.appendChild(shell);
            shellEl = shell;
            target = shell;

        } else if (active === 'schedule' || active === 'timetable') {
            const liveTarget = getScreenshotTargetElement();
            if (!liveTarget) { showToast('No screenshot target on this page.'); return; }
            const liveRect = liveTarget.getBoundingClientRect();
            const targetWidth = Math.ceil(liveTarget.scrollWidth || liveRect.width || 800);
            const shell = document.createElement('div');
            shell.style.cssText = 'position:absolute;left:-9999px;top:0;padding:24px 28px;background:#0a0012;box-sizing:border-box;display:inline-block;';
            const clone = liveTarget.cloneNode(true);
            clone.style.margin = '0';
            clone.style.maxWidth = 'none';
            clone.style.boxSizing = 'border-box';
            clone.style.width = targetWidth + 'px';
            if (active === 'schedule') {
                clone.querySelectorAll('.calendar-toggle, .schedule-filters, .ctrl-bar').forEach(el => el.remove());
                clone.querySelectorAll('.waterfall-item').forEach(el => {
                    el.classList.remove('waterfall-item');
                    el.style.animation = 'none';
                    el.style.opacity = '1';
                    el.style.transform = 'none';
                    el.style.removeProperty('--wf-delay');
                });
            }
            shell.appendChild(clone);
            document.body.appendChild(shell);
            shellEl = shell;
            target = shell;

            if (active === 'schedule' && Number.isInteger(scheduleSpecificWeek)) {
                const targetCard = target.querySelector('.card[data-week="' + String(scheduleSpecificWeek) + '"]');
                if (!targetCard) {
                    if (shellEl) shellEl.remove();
                    if (restoreScheduleMode === 'calendar') {
                        scheduleViewMode = 'calendar';
                        renderScheduleContent();
                    }
                    showToast('Week not found in Semester Map.');
                    return;
                }

                const exactWidth = targetCard.offsetWidth;
                const cardClone = targetCard.cloneNode(true);
                cardClone.style.width = exactWidth + 'px';
                cardClone.style.boxSizing = 'border-box';
                cardClone.style.margin = '0';
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'position: fixed; top: -9999px; left: 0; padding: 20px; background: #0a0012; display: inline-block; width: fit-content; height: fit-content; overflow: hidden;';
                wrapper.appendChild(cardClone);
                document.body.appendChild(wrapper);

                weekWrapperEl = wrapper;
                target = wrapper;

                if (shellEl) {
                    shellEl.remove();
                    shellEl = null;
                }
            }
        } else {
            target = getScreenshotTargetElement();
        }

        if (!target) { showToast('No screenshot target on this page.'); return; }

        if (active === 'schedule') {
            const toHide = [target.querySelector('.calendar-toggle'), target.querySelector('.schedule-filters'), target.querySelector('.ctrl-bar')];
            toHide.forEach(el => {
                if (!el) return;
                restoreList.push({ el, prev: el.style.cssText });
                el.style.cssText = 'display:none!important;';
            });
        }

        const rect = target.getBoundingClientRect();
        const shotW = Math.ceil(target.scrollWidth || rect.width || 800);
        const shotH = Math.ceil(target.scrollHeight || rect.height || 600);

        const captureOpts = {
            backgroundColor: '#0a0012',
            scale: 2.5,
            useCORS: true,
            allowTaint: true,
            width: shotW,
            height: shotH,
            windowWidth: shotW,
            windowHeight: shotH,
            logging: false
        };

        if (weekWrapperEl) {
            captureOpts.backgroundColor = '#0a0012';
            captureOpts.width = weekWrapperEl.offsetWidth;
            captureOpts.height = weekWrapperEl.offsetHeight;
            captureOpts.windowWidth = weekWrapperEl.offsetWidth;
            captureOpts.windowHeight = weekWrapperEl.offsetHeight;
            captureOpts.scrollX = 0;
            captureOpts.scrollY = 0;
            captureOpts.scale = 2;
        }

        if (!shellEl && !weekWrapperEl) {
            captureOpts.scrollX = 0;
            captureOpts.scrollY = -window.scrollY;
        }

        requestAnimationFrame(() => {
            window.html2canvas(target, captureOpts).then(canvas => {
                restoreList.forEach(({el, prev}) => el.style.cssText = prev);
                if (shellEl) shellEl.remove();
                if (weekWrapperEl && weekWrapperEl.parentNode) weekWrapperEl.parentNode.removeChild(weekWrapperEl);
                if (restoreScheduleMode === 'calendar') {
                    scheduleViewMode = 'calendar';
                    renderScheduleContent();
                }
                canvas.toBlob(blob => {
                    if (!blob) return;
                    downloadBlob(blob, `${ctx.fileBase}.png`);
                    showToast('Screenshot saved.', 'locked');
                });
            }).catch(() => {
                restoreList.forEach(({el, prev}) => el.style.cssText = prev);
                if (shellEl) shellEl.remove();
                if (weekWrapperEl && weekWrapperEl.parentNode) weekWrapperEl.parentNode.removeChild(weekWrapperEl);
                if (restoreScheduleMode === 'calendar') {
                    scheduleViewMode = 'calendar';
                    renderScheduleContent();
                }
                showToast('Screenshot failed.');
            });
        });
    }

    function openShareMenu() {
        const ctx = buildExportContext();
        if (!ctx) { showToast('Nothing to share from this page.'); return; }
        sharePayload = { title: ctx.title, text: ctx.text, fileBase: ctx.fileBase };
        const sub = document.getElementById('share-sheet-sub');
        if (sub) sub.textContent = `Sharing: ${ctx.title}`;
        const sheet = document.getElementById('share-sheet');
        if (sheet) sheet.classList.add('active');
    }

    function closeShareSheet(e, force = false) {
        if (!force && e && e.target && e.target.id !== 'share-sheet') return;
        const sheet = document.getElementById('share-sheet');
        if (sheet) sheet.classList.remove('active');
    }

    function shareNative() {
        if (!navigator.share) {
            showToast('System share is not supported on this browser.');
            return;
        }
        navigator.share({ title: sharePayload.title, text: sharePayload.text }).catch(() => {});
    }

    function shareWhatsApp() {
        const txt = encodeURIComponent(sharePayload.text || '');
        window.open(`https://wa.me/?text=${txt}`, '_blank');
    }

    function copyShareText() {
        if (!navigator.clipboard) { showToast('Clipboard API not available.'); return; }
        navigator.clipboard.writeText(sharePayload.text || '').then(() => showToast('Share text copied.', 'locked'));
    }

    function downloadShareText() {
        downloadBlob(new Blob([sharePayload.text || ''], { type: 'text/plain;charset=utf-8' }), `${sharePayload.fileBase || 'share'}.txt`);
        showToast('Share text downloaded.', 'locked');
    }

    // Close utilities popup on outside click
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.qa-utils-wrap')) closeUtilsMenu();
    });

    // ======================== NEWS SYSTEM ========================
    const NEWS_SEEN_KEY = 'newsSeenKeys';
    const NEWS_MAX_VISIBLE_DAYS = 6;

    function getNewsItemKey(item) {
        return [
            item && item.emoji || '',
            item && item.title || '',
            item && item.body || '',
            item && item.publishedAt || '',
            item && item.sub || '',
            item && item.linkUrl || '',
            item && item.linkNote || '',
            item && item.eventDate || '',
            item && item.eventTime || '',
            item && item.deadlineDate || '',
            item && item.deadlineTime || ''
        ].join('||');
    }

    function getSeenNewsKeys() {
        try {
            const raw = localStorage.getItem(NEWS_SEEN_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_) {
            return [];
        }
    }

    function setSeenNewsKeys(keys) {
        localStorage.setItem(NEWS_SEEN_KEY, JSON.stringify(keys));
    }

    function isNewsVisibleToViewer(item) {
        if (!item) return false;
        if (item.sub && isSubjectHidden(item.sub)) return false;
        if (item.hasEvent && item.eventDate) {
            const eventTs = parseNewsDeadlineTs(item.eventDate, item.eventTime ? item.eventTime : '00:00');
            if (eventTs > 0 && eventTs < Date.now()) {
                return false; 
            }
        }
        if (item.hasDeadline && item.deadlineDate) {
            const deadlineTs = parseNewsDeadlineTs(item.deadlineDate, item.deadlineTime);
            if (deadlineTs > 0 && Date.now() > deadlineTs) return false;
            // Items with deadlines should stay visible until that exact deadline passes.
            return true;
        }
        // Apply publishedAt grace only to standard announcements with no event and no deadline.
        if (!item.hasEvent && !item.hasDeadline) {
            if (!item.publishedAt) return true;
            const ts = new Date(item.publishedAt).getTime();
            if (!ts || isNaN(ts)) return true;
            const now = Date.now();
            if (ts > now) return true;
            return (now - ts) <= (NEWS_MAX_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
        }
        return true;
    }

    function getVisibleNewsItems() {
        return (window.NEWS_DATA || []).filter(isNewsVisibleToViewer);
    }

    function getNewsPublishedTs(item) {
        const ts = item && item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
        return Number.isFinite(ts) && ts > 0 ? ts : 0;
    }

    function getNewsUpcomingPriorityTs(item, nowTs = Date.now()) {
        if (!item) return Number.POSITIVE_INFINITY;
        const candidates = [];
        if (item.hasEvent && item.eventDate) {
            const eventTs = parseNewsDeadlineTs(item.eventDate, item.eventTime ? item.eventTime : '00:00');
            if (eventTs > nowTs) candidates.push(eventTs);
        }
        if (item.hasDeadline && item.deadlineDate) {
            const dlTs = parseNewsDeadlineTs(item.deadlineDate, item.deadlineTime);
            if (dlTs > nowTs) candidates.push(dlTs);
        }
        return candidates.length ? Math.min(...candidates) : Number.POSITIVE_INFINITY;
    }

    function sortNewsItemsByPublishedThenUpcoming(items) {
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        const nowTs = Date.now();
        return (items || []).slice().sort((a, b) => {
            const ta = getNewsPublishedTs(a);
            const tb = getNewsPublishedTs(b);
            if (Math.abs(ta - tb) <= TWO_HOURS_MS) {
                const pa = getNewsUpcomingPriorityTs(a, nowTs);
                const pb = getNewsUpcomingPriorityTs(b, nowTs);
                if (pa !== pb) return pa - pb;
            }
            return tb - ta;
        });
    }

    function getNewsUnreadCount() {
        const seen = new Set(getSeenNewsKeys());
        return getVisibleNewsItems().filter(n => !seen.has(getNewsItemKey(n))).length;
    }

    function renderNewsBtn() {
        const btn = document.getElementById('news-fab');
        if (!btn) return;
        const count = getNewsUnreadCount();
        btn.innerHTML = `📬${count > 0 ? `<span class="news-fab-badge">${count > 9 ? '9+' : count}</span>` : ''}`;
    }

    function openNewsPanel() {
        if (typeof window.NEWS_DATA === 'undefined') window.NEWS_DATA = [];
        dismissNewsToast();
        renderNewsPanelItems();
        const panel = document.getElementById('news-panel');
        panel.style.display = 'flex';
        requestAnimationFrame(() => panel.classList.add('active'));
        setTimeout(() => {
            const seen = new Set(getSeenNewsKeys());
            getVisibleNewsItems().forEach(item => seen.add(getNewsItemKey(item)));
            setSeenNewsKeys(Array.from(seen));
            renderNewsBtn();
        }, 500);
    }

    function closeNewsPanel(e, force = false) {
        if (!force && e && !e.target.classList.contains('news-panel')) return;
        const panel = document.getElementById('news-panel');
        const card = panel.querySelector('.news-panel-card');
        if (!card) { panel.classList.remove('active'); return; }
        card.classList.add('closing');
        panel.classList.remove('active');
        setTimeout(() => {
            panel.style.display = '';
            card.classList.remove('closing');
        }, 300);
    }

    let _newsToastTimer = null;
    function showNewsToast(count) {
        const toast = document.getElementById('news-toast');
        const body = document.getElementById('news-toast-body');
        const timerBar = document.getElementById('news-toast-timer-bar');
        if (!toast || !body) return;
        body.textContent = `You have ${count} unread announcement${count !== 1 ? 's' : ''} you haven't seen yet.`;
        toast.classList.remove('hiding');
        toast.classList.add('show');
        // Progress bar countdown
        timerBar.style.transition = 'none';
        timerBar.style.width = '100%';
        requestAnimationFrame(() => {
            timerBar.style.transition = 'width 12s linear';
            timerBar.style.width = '0%';
        });
        if (_newsToastTimer) clearTimeout(_newsToastTimer);
        _newsToastTimer = setTimeout(() => dismissNewsToast(), 12000);
    }

    function dismissNewsToast() {
        const toast = document.getElementById('news-toast');
        if (!toast) return;
        if (_newsToastTimer) { clearTimeout(_newsToastTimer); _newsToastTimer = null; }
        toast.classList.add('hiding');
        toast.classList.remove('show');
        setTimeout(() => toast.classList.remove('hiding'), 350);
    }

    function maybeShowNewsToast() {
        const count = getNewsUnreadCount();
        if (count > 0) showNewsToast(count);
    }

    function renderNewsPanelItems() {
        const list = document.getElementById('news-items-list');
        if (!list) return;
        const seen = new Set(getSeenNewsKeys());
        const items = sortNewsItemsByPublishedThenUpcoming(getVisibleNewsItems());
        if (!items.length) {
            list.innerHTML = '<div style="text-align:center;color:#555;padding:32px 20px;font-style:italic;font-size:0.87rem;">No announcements yet.</div>';
            return;
        }
        list.innerHTML = items.map(item => {
            const ts = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
            const isUnread = !seen.has(getNewsItemKey(item));
            const timeAgo = formatNewsTime(ts);
            let dlHtml = '';
            if (item.hasDeadline && item.deadlineDate) {
                const dlabel = formatNewsDeadline(item.deadlineDate, item.deadlineTime);
                dlHtml = `<span class="ni-dl">⏰ ${eHtml(dlabel)}</span>`;
            }
            let evtHtml = '';
            if (item.hasEvent && item.eventDate) {
                const elabel = formatNewsDeadline(item.eventDate, item.eventTime);
                evtHtml = `<span class="ni-dl" style="background:rgba(0, 229, 255, 0.15); border-color:#00E5FF; color:#00E5FF; box-shadow:0 0 10px rgba(0,229,255,0.4);">🗓️ Held on: ${eHtml(elabel)}</span>`;
            }
            const subHtml = item.sub ? `<span class="ni-sub">${eHtml(item.sub)}</span>` : '';
            const linkUrl = String(item.linkUrl || '').trim();
            const linkNote = String(item.linkNote || '').trim();
            const normalizedLink = /^https?:\/\//i.test(linkUrl) ? linkUrl : (linkUrl ? ('https://' + linkUrl) : '');
            const linkHtml = normalizedLink
                ? `<div class="ni-link-row"><a href="${eHtml(normalizedLink)}" target="_blank" rel="noopener noreferrer" class="modal-url-badge">🔗 ${eHtml(linkNote || 'Open Link')}</a></div>`
                : '';
            return `<div class="news-item${isUnread ? ' news-unread' : ''}">
                <div class="ni-inner">
                    <div class="ni-emoji">${item.emoji || '📬'}</div>
                    <div class="ni-body">
                        <div class="ni-title">${eHtml(item.title || '')}</div>
                        ${item.body ? `<div class="ni-note">${eHtml(item.body)}</div>` : ''}
                        <div class="ni-meta">${subHtml}${evtHtml}${dlHtml}<span class="ni-time">${timeAgo}</span></div>
                        ${linkHtml}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function formatNewsTime(ts) {
        if (!ts) return '';
        const now = Date.now();
        const diff = now - ts;
        if (diff < 0) {
            const abs = -diff;
            const hrs2 = Math.floor(abs / 3600000);
            const days2 = Math.floor(abs / 86400000);
            if (days2 > 0) return `in ${days2} day${days2 > 1 ? 's' : ''}`;
            if (hrs2 > 0) return `in ${hrs2}h`;
            return 'soon';
        }
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 2) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        if (hrs < 24) return `${hrs}h ago`;
        if (days < 7) return `${days}d ago`;
        const d = new Date(ts);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function formatNewsDeadline(dateStr, timeStr) {
        try {
            const d = new Date(dateStr);
            const label = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            let formattedTime = timeStr;
            if (timeStr && /^(\d{2}):(\d{2})$/.test(timeStr)) {
                let [hh, mm] = timeStr.split(':').map(Number);
                let ampm = hh >= 12 ? 'PM' : 'AM';
                let h = hh % 12;
                if (h === 0) h = 12;
                formattedTime = `${h}:${mm.toString().padStart(2, '0')} ${ampm}`;
            }
            return formattedTime ? `${label} at ${formattedTime}` : label;
        } catch(e) { return dateStr + (timeStr ? ' ' + timeStr : ''); }
    }

    // Updated X ago helper
    function getUpdatedAgoHtml(weekObj) {
        if(!weekObj.recentDate) return '';
        const ts = parseDate(weekObj.recentDate);
        if(ts === 0) return '';
        const now = Date.now();
        const diff = now - ts;
        if(diff < 0) return '';
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        let label = '';
        if(mins < 1) label = 'just now';
        else if(mins < 60) label = mins + ' min' + (mins > 1 ? 's' : '') + ' ago';
        else if(hrs < 24) label = hrs + ' hr' + (hrs > 1 ? 's' : '') + ' ago';
        else if(days < 30) label = days + ' day' + (days > 1 ? 's' : '') + ' ago';
        else label = Math.floor(days / 30) + ' month' + (Math.floor(days/30) > 1 ? 's' : '') + ' ago';
        return `<div class="week-updated-ago">Updated ${label}</div>`;
    }

    // --- Timetable ---
    const TT_SUBJECT_COLORS = {
        'Operating Systems':    { bg:'rgba(0,229,255,0.12)',  border:'rgba(0,229,255,0.4)',  text:'#00e5ff' },
        'Computer Networks':    { bg:'rgba(74,144,226,0.12)', border:'rgba(74,144,226,0.4)', text:'#4a90e2' },
        'Data Structures':      { bg:'rgba(52,199,89,0.12)',  border:'rgba(52,199,89,0.4)',  text:'#34c759' },
        'Database Systems':     { bg:'rgba(255,149,0,0.12)',  border:'rgba(255,149,0,0.4)',  text:'#ff9500' },
        'Machine Learning':     { bg:'rgba(233,30,140,0.12)', border:'rgba(233,30,140,0.4)', text:'#e91e8c' },
        'Artificial Intelligence':{ bg:'rgba(181,25,214,0.12)', border:'rgba(181,25,214,0.4)', text:'#b519d6' },
        'Computer Architecture':{ bg:'rgba(255,55,95,0.12)',  border:'rgba(255,55,95,0.4)',  text:'#ff375f' },
        'Quantum Computing':    { bg:'rgba(94,92,230,0.12)',  border:'rgba(94,92,230,0.4)',  text:'#5e5ce6' },
        'Robotics Engineering': { bg:'rgba(255,204,0,0.12)',  border:'rgba(255,204,0,0.4)',  text:'#ffcc00' },
        'Software Testing':     { bg:'rgba(100,210,255,0.12)',border:'rgba(100,210,255,0.4)',text:'#64d2ff' }
    };
    const TT_TYPE_STYLES = {
        lec: { label:'LEC', bg:'rgba(233,30,140,0.12)', border:'rgba(233,30,140,0.4)', color:'#e91e8c', text:'#f5a0d0' },
        tut: { label:'TUT', bg:'rgba(0,229,255,0.12)',  border:'rgba(0,229,255,0.4)', color:'#00e5ff', text:'#80f0ff' },
        lab: { label:'LAB', bg:'rgba(52,199,89,0.12)',   border:'rgba(52,199,89,0.4)', color:'#34c759', text:'#8ee4a8' }
    };

    let ttSection = localStorage.getItem('tt_section') || '3-4';
    let ttSelectedSubjects = (() => {
        try {
            const raw = localStorage.getItem('tt_subjects');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    })();
    let ttMode = localStorage.getItem('tt_mode') || 'normal';
    let studioTodayIndex = 0;
    let studioTempDayEvents = [];
    let studioBaseDayEvents = [];
    let tempStudioEvents = [];
    let studioSelectedDayName = '';
    let studioSelectedDayIndex = 0;

    function getStudioSectionKey(TD) {
        const adminSec = (typeof window.ttAdminSection !== 'undefined' && window.ttAdminSection) ? String(window.ttAdminSection) : '';
        if (adminSec && TD && TD.sections && TD.sections[adminSec]) return adminSec;
        return ttSection;
    }

    function getTimetableDayIndexByName(TD, dayName) {
        if (!TD || !Array.isArray(TD.days)) return -1;
        const n = String(dayName || '').toLowerCase();
        const n3 = n.slice(0, 3);
        return TD.days.findIndex(function(d) {
            const v = String(d || '').toLowerCase();
            return v === n || v.slice(0, 3) === n3;
        });
    }

    function extractStudioEventTimeText(ev, TD) {
        if (!ev) return '';
        if (ev.displayTime && String(ev.displayTime).trim()) return String(ev.displayTime).trim();
        if (ev.timeText && String(ev.timeText).trim()) return String(ev.timeText).trim();
        if (ev.customTime && String(ev.customTime).trim()) return String(ev.customTime).trim();
        if (Number.isInteger(ev.slot)) {
            const normal = TD && TD.timeSlots && Array.isArray(TD.timeSlots.normal) ? TD.timeSlots.normal : [];
            return String(normal[ev.slot] || ('Slot ' + (ev.slot + 1)));
        }
        return '';
    }

    function parseStudioTime(timeStr) {
        if (!timeStr) return 99; // Push empty/invalid times to the bottom
        let str = timeStr.toString().toLowerCase().trim();
        
        // If it's a range (e.g., '2:30 - 4:20'), sort by the start time
        if (str.includes('-')) str = str.split('-')[0].trim(); 

        let hr = 0, min = 0;
        let isPM = str.includes('pm');
        let isAM = str.includes('am');

        let match = str.match(/(\d{1,2}):?(\d{2})?/);
        if (match) {
            hr = parseInt(match[1] || 0, 10);
            min = parseInt(match[2] || 0, 10);
        }

        // IMPLICIT TIME LOGIC: If no AM/PM is typed, assume normal college hours.
        // Hours 1 through 7 are afternoon/evening (1:00 PM - 7:59 PM).
        // Hours 8 through 11 are morning (8:00 AM - 11:59 AM).
        if (!isPM && !isAM) {
            if (hr >= 1 && hr <= 7) {
                isPM = true;
            }
        }

        // Convert to 24-hour float for perfect sorting
        if (isPM && hr < 12) hr += 12;
        if (isAM && hr === 12) hr = 0; // Midnight edge case

        return hr + (min / 60);
    }

    function studioResolveSubjectName(subjectValue, selectedOption) {
        const raw = String(subjectValue || '').trim();
        if (!raw) return '';

        if (selectedOption && selectedOption.dataset && selectedOption.dataset.fullname) {
            return String(selectedOption.dataset.fullname).trim();
        }

        const courseList = Array.isArray(window.COURSE_DATA) ? window.COURSE_DATA : [];
        const byCode = courseList.find(function(c) {
            return String(c.code || '').trim().toLowerCase() === raw.toLowerCase();
        });
        if (byCode && byCode.name) return String(byCode.name).trim();

        const byName = courseList.find(function(c) {
            return String(c.name || '').trim().toLowerCase() === raw.toLowerCase();
        });
        if (byName && byName.name) return String(byName.name).trim();

        return raw;
    }

    function studioSortTempEvents() {
        const TD = window.TIMETABLE_DATA;
        studioTempDayEvents.sort(function(a, b) {
            const ta = parseStudioTime(extractStudioEventTimeText(a, TD));
            const tb = parseStudioTime(extractStudioEventTimeText(b, TD));
            if (ta !== tb) return ta - tb;
            const sa = String(a.subject || '');
            const sb = String(b.subject || '');
            return sa.localeCompare(sb);
        });
        tempStudioEvents = studioTempDayEvents;
    }

    function showTimetable(push = true) {
        renderTimetable();
        nav('timetable', push);
    }

    function getTimetableTodayIndex(TD) {
        if (!TD || !Array.isArray(TD.days) || TD.days.length === 0) return 0;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayName = dayNames[new Date().getDay()].toLowerCase();
        const todayShort = todayName.slice(0, 3);
        const idx = TD.days.findIndex(function(d) {
            const v = String(d || '').toLowerCase();
            return v === todayName || v.slice(0, 3) === todayShort;
        });
        return idx >= 0 ? idx : 0;
    }

    function closeScreenshotStudioModal(e, force) {
        if (!force && e && e.target && e.target.id !== 'screenshot-studio-modal') return;
        const modal = document.getElementById('screenshot-studio-modal');
        if (modal) modal.classList.remove('active');
    }

    function closeScreenshotModeModal(e, force = false) {
        if (!force && e && e.target && e.target.id !== 'screenshot-mode-modal') return;
        const modal = document.getElementById('screenshot-mode-modal');
        if (modal) modal.classList.remove('active');
    }

    function openScreenshotModeModal() {
        const modal = document.getElementById('screenshot-mode-modal');
        if (modal) modal.classList.add('active');
    }

    function captureTimetableDayImage(dayIndex) {
        const TD = window.TIMETABLE_DATA;
        if (!TD || !Array.isArray(TD.days)) return Promise.reject(new Error('No timetable data'));
        const dayName = TD.days[dayIndex] || ('Day ' + (dayIndex + 1));
        return _captureOneDay(dayIndex, dayName);
    }

    function openStandardDaySelector() {
        closeScreenshotModeModal(null, true);
        const TD = window.TIMETABLE_DATA;
        if (!TD || !Array.isArray(TD.days)) { showToast('No timetable data.', 'locked'); return; }
        const days = TD.days
            .map(function(day, idx) { return { day: String(day || ''), idx: idx }; })
            .filter(function(item) { return item.day.toLowerCase() !== 'friday'; });

        const existingPicker = document.getElementById('tt-day-picker');
        if (existingPicker) existingPicker.remove();

        const picker = document.createElement('div');
        picker.id = 'tt-day-picker';
        picker.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0a0012;border:1px solid rgba(233,30,140,0.4);border-radius:16px;padding:20px 24px;z-index:10000;box-shadow:0 0 40px rgba(233,30,140,0.2);min-width:260px;';
        picker.innerHTML = '<div style="font-family:\'Orbitron\',sans-serif;font-size:0.75rem;color:var(--accent-pink);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;text-align:center;">Select Day</div>' +
            '<div id="tt-day-picker-btns" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;"></div>' +
            '<button onclick="document.getElementById(\'tt-day-picker\').remove()" style="display:block;margin:14px auto 0;background:none;border:1px solid #555;color:#888;padding:4px 16px;border-radius:8px;cursor:pointer;font-size:0.78rem;">Cancel</button>';

        const btnWrap = picker.querySelector('#tt-day-picker-btns');
        days.forEach(function(item) {
            const b = document.createElement('button');
            b.textContent = item.day;
            b.style.cssText = 'background:rgba(233,30,140,0.1);border:1px solid rgba(233,30,140,0.4);color:#e91e8c;padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.82rem;transition:0.2s;';
            b.onmouseover = function() { b.style.background = '#e91e8c'; b.style.color = '#fff'; };
            b.onmouseout = function() { b.style.background = 'rgba(233,30,140,0.1)'; b.style.color = '#e91e8c'; };
            b.onclick = function() { picker.remove(); captureTimetableDayImage(item.idx); };
            btnWrap.appendChild(b);
        });
        document.body.appendChild(picker);
    }

    function openStudioDaySelector() {
        closeScreenshotModeModal(null, true);
        const TD = window.TIMETABLE_DATA;
        if (!TD) { showToast('No timetable data.', 'locked'); return; }

        const existingPicker = document.getElementById('tt-day-picker');
        if (existingPicker) existingPicker.remove();

        const orderedDays = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const picker = document.createElement('div');
        picker.id = 'tt-day-picker';
        picker.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0a0012;border:1px solid rgba(233,30,140,0.4);border-radius:16px;padding:20px 24px;z-index:10000;box-shadow:0 0 40px rgba(233,30,140,0.2);min-width:280px;';
        picker.innerHTML = '<div style="font-family:\'Orbitron\',sans-serif;font-size:0.75rem;color:var(--accent-pink);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;text-align:center;">Select Day To Edit</div>' +
            '<div id="tt-day-picker-btns" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;"></div>' +
            '<button onclick="document.getElementById(\'tt-day-picker\').remove()" style="display:block;margin:14px auto 0;background:none;border:1px solid #555;color:#888;padding:4px 16px;border-radius:8px;cursor:pointer;font-size:0.78rem;">Cancel</button>';

        const btnWrap = picker.querySelector('#tt-day-picker-btns');
        orderedDays.forEach(function(dayName) {
            const isFriday = dayName === 'Friday';
            const b = document.createElement('button');
            b.textContent = dayName;
            b.style.cssText = isFriday
                ? 'background:rgba(255,149,0,0.13);border:1px solid rgba(255,149,0,0.5);color:#ff9500;padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.82rem;transition:0.2s; box-shadow:0 0 12px rgba(255,149,0,0.18);'
                : 'background:rgba(233,30,140,0.1);border:1px solid rgba(233,30,140,0.4);color:#e91e8c;padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.82rem;transition:0.2s;';
            b.onclick = function() {
                picker.remove();
                openScreenshotStudioModal(dayName);
            };
            btnWrap.appendChild(b);
        });
        document.body.appendChild(picker);
    }

    function studioShowDaySelector() {
        studioGoBack();
    }

    function studioGoBack() {
        studioTempDayEvents = [];
        studioBaseDayEvents = [];
        tempStudioEvents = [];
        studioSelectedDayName = '';
        studioSelectedDayIndex = 0;
        closeScreenshotStudioModal(null, true);
        openStudioDaySelector();
    }

    function studioOpenCustomizer() {
        openStudioDaySelector();
    }

    function studioSelectDay(dayName) {
        openScreenshotStudioModal(dayName);
    }

    function studioPopulatePlaces(TD) {
        const places = new Set();
        const sectionKey = getStudioSectionKey(TD);
        const sectionEntries = (TD && TD.sections && TD.sections[sectionKey]) ? TD.sections[sectionKey] : [];
        sectionEntries.forEach(function(e) {
            const room = String(e.room || '').trim();
            if (room) places.add(room);
        });
        const list = document.getElementById('studio-places');
        if (!list) return;
        list.innerHTML = '';
        Array.from(places).sort().forEach(function(room) {
            const opt = document.createElement('option');
            opt.value = room;
            list.appendChild(opt);
        });
    }

    function studioRenderEvents() {
        const TD = window.TIMETABLE_DATA;
        const box = document.getElementById('studio-day-events');
        const dayLabel = document.getElementById('studio-day-label');
        if (!box || !TD) return;
        studioSortTempEvents();
        if (dayLabel) {
            const dayName = studioSelectedDayName || (TD.days && TD.days[studioTodayIndex] ? TD.days[studioTodayIndex] : 'Current Day');
            dayLabel.textContent = 'Editing: ' + dayName;
        }
        box.innerHTML = '';
        if (!studioTempDayEvents.length) {
            box.innerHTML = '<div style="text-align:center; color:#777; font-style:italic; padding:8px 0;">No events for this day.</div>';
            return;
        }
        studioTempDayEvents.forEach(function(ev) {
                const idx = studioTempDayEvents.indexOf(ev);
                const row = document.createElement('div');
                const ts = TT_TYPE_STYLES[ev.type] || TT_TYPE_STYLES.lec;
                const timeText = extractStudioEventTimeText(ev, TD) || 'No time';
                row.style.cssText = 'display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:8px 10px;';
                row.innerHTML = '<span style="font-family:Orbitron,sans-serif; color:' + ts.color + '; font-size:0.68rem; min-width:42px;">' + ts.label + '</span>' +
                    '<span style="color:#ddd; font-size:0.84rem; min-width:120px;">' + timeText + '</span>' +
                    '<span style="color:#fff; font-weight:700; font-size:0.84rem; min-width:60px;">' + (ev.subject || '') + '</span>' +
                    '<span style="color:#aaa; font-size:0.8rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + (ev.room || 'No room') + '</span>' +
                    '<button style="background:none; border:1px solid rgba(255,59,48,0.35); color:#ff3b30; width:24px; height:24px; border-radius:6px; cursor:pointer; font-weight:700;" onclick="studioRemoveTempEvent(' + idx + ')">✕</button>';
                box.appendChild(row);
            });
    }

    function studioPopulateFormOptions() {
        const TD = window.TIMETABLE_DATA;
        if (!TD) return;
        const subSel = document.getElementById('studio-subject');
        const timeInput = document.getElementById('studio-time-input');
        const timesList = document.getElementById('studio-times');
        if (!subSel || !timeInput || !timesList) return;

        subSel.innerHTML = '';
        const courseList = Array.isArray(window.COURSE_DATA) ? window.COURSE_DATA : [];
        if (courseList.length) {
            courseList.forEach(function(c) {
                const opt = document.createElement('option');
                opt.value = c.code;
                opt.dataset.fullname = c.name;
                opt.dataset.code = c.code;
                opt.textContent = c.code + ' - ' + c.name;
                subSel.appendChild(opt);
            });
        } else {
            (TD.subjects || []).forEach(function(s) {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                subSel.appendChild(opt);
            });
        }

        const times = (TD.timeSlots && Array.isArray(TD.timeSlots.normal) ? TD.timeSlots.normal : []);
        timesList.innerHTML = '';
        times.forEach(function(t) {
            const opt = document.createElement('option');
            opt.value = t;
            timesList.appendChild(opt);
        });
        timeInput.value = '';
    }

    function studioResolveSlotIndex(TD, timeText) {
        const normalTimes = (TD && TD.timeSlots && Array.isArray(TD.timeSlots.normal)) ? TD.timeSlots.normal : [];
        if (!normalTimes.length) return 0;

        const exact = normalTimes.indexOf(timeText);
        if (exact >= 0) return exact;

        const target = parseStudioTime(timeText);
        if (!Number.isFinite(target)) return 0;

        let bestIdx = 0;
        let bestDiff = Number.POSITIVE_INFINITY;
        normalTimes.forEach(function(slotText, idx) {
            const slotVal = parseStudioTime(slotText);
            if (!Number.isFinite(slotVal)) return;
            const diff = Math.abs(slotVal - target);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = idx;
            }
        });
        return bestIdx;
    }

    function openScreenshotStudioModal(dayName) {
        const TD = window.TIMETABLE_DATA;
        const sectionKey = (typeof window.ttAdminSection !== 'undefined' && window.ttAdminSection)
            ? String(window.ttAdminSection)
            : getStudioSectionKey(TD);
        if (!TD || !TD.sections || !TD.sections[sectionKey]) {
            showToast('No timetable data.', 'locked');
            return;
        }

        const selectedDay = String(dayName || '').trim();
        if (!selectedDay) {
            openStudioDaySelector();
            return;
        }

        studioSelectedDayName = selectedDay;
        const mappedIdx = getTimetableDayIndexByName(TD, selectedDay);
        studioSelectedDayIndex = mappedIdx >= 0 ? mappedIdx : (Array.isArray(TD.days) ? TD.days.length : 0);
        studioTodayIndex = studioSelectedDayIndex;

        if (selectedDay.toLowerCase() === 'friday') {
            studioBaseDayEvents = [];
            studioTempDayEvents = [];
            tempStudioEvents = [];
        } else {
            const preloaded = (TD.sections[sectionKey] || []).filter(function(e) { return e.day === studioSelectedDayIndex; });
            studioBaseDayEvents = JSON.parse(JSON.stringify(preloaded));
            studioTempDayEvents = JSON.parse(JSON.stringify(preloaded));
            tempStudioEvents = studioTempDayEvents;
        }

        studioSortTempEvents();
        studioPopulatePlaces(TD);
        studioPopulateFormOptions();
        const label = document.getElementById('studio-day-label');
        if (label) label.textContent = 'Editing: ' + selectedDay;
        const customizer = document.getElementById('studio-customizer');
        if (customizer) customizer.style.display = 'block';
        studioRenderEvents();
        const modal = document.getElementById('screenshot-studio-modal');
        if (modal) modal.classList.add('active');
    }

    function studioAddTempEvent() {
        const TD = window.TIMETABLE_DATA;
        if (!TD) return;
        const subSel = document.getElementById('studio-subject');
        const typeSel = document.getElementById('studio-type');
        const timeInput = document.getElementById('studio-time-input');
        const roomInput = document.getElementById('studio-room');
        if (!subSel || !typeSel || !timeInput || !roomInput) return;

        const timeText = String(timeInput.value || '').trim();
        if (!timeText) {
            showToast('Enter a time.', 'locked');
            return;
        }

        const selectedOption = subSel.options[subSel.selectedIndex] || null;
        const subjectCode = String(subSel.value || '').trim();
        const subjectName = studioResolveSubjectName(subjectCode, selectedOption);
        const normalizedType = ['lec', 'tut', 'lab'].includes(typeSel.value) ? typeSel.value : 'lec';
        const matchedSlot = studioResolveSlotIndex(TD, timeText);

        studioTempDayEvents.push({
            day: studioSelectedDayIndex,
            slot: matchedSlot,
            subject: subjectName,
            subjectCode: subjectCode,
            type: normalizedType,
            room: roomInput.value.trim(),
            note: '',
            alternating: false,
            backup: false,
            displayTime: timeText,
            timeText: timeText,
            time: timeText,
            slotText: timeText,
        });
        studioSortTempEvents();
        tempStudioEvents = studioTempDayEvents;
        timeInput.value = '';
        roomInput.value = '';
        studioRenderEvents();
    }

    function studioRemoveTempEvent(idx) {
        if (idx < 0 || idx >= studioTempDayEvents.length) return;
        studioTempDayEvents.splice(idx, 1);
        tempStudioEvents = studioTempDayEvents;
        studioRenderEvents();
    }

    function studioResetTempEvents() {
        studioTempDayEvents = JSON.parse(JSON.stringify(studioBaseDayEvents));
        tempStudioEvents = studioTempDayEvents;
        studioSortTempEvents();
        studioRenderEvents();
    }

    function renderTimetable() {
        const TD = window.TIMETABLE_DATA;
        if (!TD) return;
        if (!ttSelectedSubjects) ttSelectedSubjects = [...TD.defaultSubjects];

        // Controls
        const ctrls = document.getElementById('timetable-controls');
        let html = '<div class="tt-controls">';
        // Section selector
        html += '<div class="tt-control-group"><div class="tt-control-label">Section</div><div>';
        Object.keys(TD.sections).forEach(s => {
            html += `<span class="tt-pill ${ttSection===s?'active':''}" onclick="ttSetSection('${s}')">${s}</span>`;
        });
        html += '</div></div>';
        // Mode selector
        html += '<div class="tt-control-group"><div class="tt-control-label">Timing</div><div>';
        html += `<span class="tt-pill ${ttMode==='normal'?'active':''}" onclick="ttSetMode('normal')">Normal</span>`;
        html += `<span class="tt-pill ${ttMode==='ramadan'?'active':''}" onclick="ttSetMode('ramadan')">☪ Ramadan</span>`;
        html += '</div></div>';
        // Subject checkboxes
        html += '<div class="tt-control-group" style="flex:1; min-width:280px;"><div class="tt-control-label">Subjects</div><div>';
        TD.subjects.forEach(sub => {
            const c = TT_SUBJECT_COLORS[sub] || { text:'#aaa' };
            const active = ttSelectedSubjects.includes(sub);
            html += `<span class="tt-pill-sub ${active?'active':''}" style="color:${c.text};" onclick="ttToggleSub('${sub}')"><span class="tt-check">${active?'✓':''}</span>${sub}</span>`;
        });
        html += '</div></div></div>';
        ctrls.innerHTML = html;

        // Legend
        const legend = document.getElementById('timetable-legend');
        legend.innerHTML = `<div class="tt-legend">
            <div class="tt-legend-item"><div class="tt-legend-swatch" style="background:${TT_TYPE_STYLES.lec.bg}; border:1px solid ${TT_TYPE_STYLES.lec.border};"></div>Lecture</div>
            <div class="tt-legend-item"><div class="tt-legend-swatch" style="background:${TT_TYPE_STYLES.tut.bg}; border:1px solid ${TT_TYPE_STYLES.tut.border};"></div>Tutorial</div>
            <div class="tt-legend-item"><div class="tt-legend-swatch" style="background:${TT_TYPE_STYLES.lab.bg}; border:1px solid ${TT_TYPE_STYLES.lab.border};"></div>Lab</div>
            <div class="tt-legend-item"><div class="tt-legend-swatch" style="background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.15); position:relative; overflow:hidden;"><svg style="position:absolute;top:0;left:0;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg"><line x1="100%" y1="0" x2="0" y2="100%" stroke="#aaa" stroke-width="1.5" opacity="0.5"/></svg></div>Alternating</div>
            <div class="tt-legend-item"><span style="font-size:0.55rem; font-weight:800; letter-spacing:1px; text-transform:uppercase; background:rgba(255,204,0,0.2); color:#ffcc00; border:1px solid rgba(255,204,0,0.4); padding:1px 5px; border-radius:4px;">BACKUP</span>Backup</div>
        </div>`;

        // Build grid
        const entries = (TD.sections[ttSection] || []).filter(e => ttSelectedSubjects.includes(e.subject));
        const times = TD.timeSlots[ttMode] || TD.timeSlots.normal;
        const days = TD.days;

        // Determine which time slots have content
        const usedSlots = new Set();
        entries.forEach(e => usedSlots.add(e.slot));
        const slotIndices = [];
        for (let i = 0; i < times.length; i++) { if (usedSlots.has(i)) slotIndices.push(i); }
        if (slotIndices.length === 0) for (let i = 0; i < times.length; i++) slotIndices.push(i);

        let grid = '<thead><tr><th></th>';
        days.forEach(d => { grid += `<th>${d.substring(0,3).toUpperCase()}</th>`; });
        grid += '</tr></thead><tbody>';

        slotIndices.forEach(si => {
            grid += '<tr>';
            grid += `<td class="tt-time">${times[si]}</td>`;
            for (let di = 0; di < days.length; di++) {
                const cellEntries = entries.filter(e => e.day === di && e.slot === si);
                if (cellEntries.length === 0) {
                    grid += '<td class="tt-cell"><div class="tt-empty"></div></td>';
                } else {
                    grid += '<td class="tt-cell">';
                    cellEntries.forEach(e => {
                        const sc = TT_SUBJECT_COLORS[e.subject] || { text:'#ccc' };
                        const ts = TT_TYPE_STYLES[e.type] || TT_TYPE_STYLES.lec;
                        grid += `<div class="tt-card" style="background:${ts.bg}; border:1px solid ${ts.border}; box-shadow:0 0 12px ${ts.border}, inset 0 0 12px ${ts.bg};">`;
                        if (e.alternating) {
                            grid += `<svg class="tt-alt-line" xmlns="http://www.w3.org/2000/svg"><line x1="100%" y1="0" x2="0" y2="100%" stroke="${ts.color}" stroke-width="2" opacity="0.35"/></svg>`;
                        }
                        grid += `<div class="tt-card-name" style="color:${sc.text};">${e.subject}</div>`;
                        grid += `<div class="tt-card-info" style="color:${ts.text};">${ts.label}${e.room ? ' · ' + e.room : ''}</div>`;
                        grid += `<div class="tt-badges-row">`;
                        grid += `<span class="tt-type-badge" style="background:${ts.border}; color:#000;">${ts.label}</span>`;
                        if (e.backup) grid += `<span class="tt-badge-backup">BACKUP</span>`;
                        grid += `</div>`;
                        if (e.note) grid += `<div class="tt-card-note" style="color:${ts.text};">${e.note}</div>`;
                        grid += '</div>';
                    });
                    grid += '</td>';
                }
            }
            grid += '</tr>';
        });
        grid += '</tbody>';
        document.getElementById('timetable-grid').innerHTML = grid;
    }

    function ttSetSection(s) {
        ttSection = s;
        localStorage.setItem('tt_section', s);
        renderTimetable();
    }
    function ttSetMode(m) {
        ttMode = m;
        localStorage.setItem('tt_mode', m);
        renderTimetable();
    }
    function ttToggleSub(sub) {
        const idx = ttSelectedSubjects.indexOf(sub);
        if (idx >= 0) ttSelectedSubjects.splice(idx, 1);
        else ttSelectedSubjects.push(sub);
        localStorage.setItem('tt_subjects', JSON.stringify(ttSelectedSubjects));
        renderTimetable();
    }

    // --- Staff Directory ---
    let directoryRoleFilter = 'all';
    let directorySubFilter = new Set();

    function showDirectory(push = true) {
        renderDirectory();
        nav('directory', push);
    }


    function renderDirectory() {
        const filterBar = document.getElementById('directory-filter-bar');
        const list = document.getElementById('directory-list');
        if (!filterBar || !list) return;
        filterBar.innerHTML = '';
        list.innerHTML = '';

        const staffData = getVisibleStaffData(window.STAFF_DATA || []);
        if (staffData.length === 0) {
            list.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#666; margin-top:30px; font-style:italic;">No staff data available yet.</div>';
            return;
        }

        const subjects = [...new Set(staffData.flatMap(s => s.subjects))].sort();
        const roles = [
            { key: 'all', label: 'All',          color: '#00E5FF' },
            { key: 'doctor', label: '🎓 Doctors', color: '#007aff' },
            { key: 'ta',     label: '👨‍🏫 TAs',    color: '#34c759' }
        ];

        const anyActive = directoryRoleFilter !== 'all' || directorySubFilter.size > 0;
        const isOpen = fpOpenState.directory || false;

        // Toggle button
        const togBtn = document.createElement('button');
        const getTogLabel = (open) => {
            if (directoryRoleFilter !== 'all' || directorySubFilter.size > 0) {
                const parts = [];
                if (directoryRoleFilter !== 'all') { const r = roles.find(x=>x.key===directoryRoleFilter); if(r) parts.push(r.label.replace(/^\S+\s/,'')); }
                if (directorySubFilter.size > 0) [...directorySubFilter].forEach(s => parts.push(s));
                return `Filter: <span class="fp-active-label">${parts.join(', ')}</span> <span class="fp-arrow">${open?'▲':'▼'}</span>`;
            }
            return `Filter <span class="fp-arrow">${open?'▲':'▼'}</span>`;
        };
        togBtn.className = 'fp-toggle' + (anyActive ? ' has-filter' : '') + (isOpen ? ' open' : '');
        togBtn.innerHTML = getTogLabel(isOpen);
        togBtn.style.cssText = 'display:block; margin:0 auto 8px;';
        filterBar.appendChild(togBtn);

        const collapsible = document.createElement('div');
        collapsible.className = 'fp-bar-collapsible' + (isOpen ? ' open' : '');
        collapsible.style.cssText = 'flex-direction:column; gap:0; margin-top:8px; margin-bottom:12px; align-items:stretch; max-width:900px; margin-left:auto; margin-right:auto;';

        const refreshTog = () => {
            const open = collapsible.classList.contains('open');
            const active = directoryRoleFilter !== 'all' || directorySubFilter.size > 0;
            togBtn.className = 'fp-toggle' + (active ? ' has-filter' : '') + (open ? ' open' : '');
            togBtn.innerHTML = getTogLabel(open);
        };

        const outerBar = document.createElement('div');
        outerBar.style.cssText = 'background:rgba(8,2,18,0.7); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:10px 18px; display:flex; flex-direction:column; gap:10px;';

        // ROW 1 — Staff (role) chips
        const roleRowWrapper = document.createElement('div');
        roleRowWrapper.style.cssText = 'display:flex; align-items:center; gap:10px;';
        const roleLabel = document.createElement('span');
        roleLabel.textContent = 'Staff';
        roleLabel.style.cssText = 'font-size:0.58rem; font-weight:700; color:rgba(196,181,219,0.45); text-transform:uppercase; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; min-width:46px;';
        const roleRow = document.createElement('div');
        roleRow.style.cssText = 'flex:1; display:flex; flex-wrap:wrap; justify-content:center; gap:8px; align-items:center;';

        const refreshRoleChips = () => {
            roleRow.querySelectorAll('.fp-chip').forEach(b => {
                const k = b.dataset.key;
                const act = directoryRoleFilter === k;
                b.classList.toggle('active', act);
                const r = roles.find(x=>x.key===k);
                b.style.cssText = act && r && r.color ? `background:${r.color}22; border-color:${r.color}; color:${r.color}; box-shadow:0 0 10px ${r.color}55;` : '';
            });
        };

        roles.forEach(r => {
            const btn = document.createElement('button');
            btn.className = 'fp-chip' + (directoryRoleFilter === r.key ? ' active' : '');
            btn.textContent = r.label;
            btn.dataset.key = r.key;
            if (directoryRoleFilter === r.key && r.color) btn.style.cssText = `background:${r.color}22; border-color:${r.color}; color:${r.color}; box-shadow:0 0 10px ${r.color}55;`;
            btn.addEventListener('click', () => {
                directoryRoleFilter = r.key;
                refreshRoleChips();
                refreshTog();
                syncDirClear();
                renderDirectoryList(staffData, subjects, list);
            });
            roleRow.appendChild(btn);
        });
        roleRowWrapper.appendChild(roleLabel);
        roleRowWrapper.appendChild(roleRow);
        outerBar.appendChild(roleRowWrapper);

        // ROW 2 — Subjects chips (if any)
        if (subjects.length > 0) {
            const rowDivider = document.createElement('div');
            rowDivider.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:0 -4px;';
            outerBar.appendChild(rowDivider);

            const subRowWrapper = document.createElement('div');
            subRowWrapper.style.cssText = 'display:flex; align-items:center; gap:10px;';
            const subLabelEl = document.createElement('span');
            subLabelEl.textContent = 'Subjects';
            subLabelEl.style.cssText = 'font-size:0.58rem; font-weight:700; color:rgba(196,181,219,0.45); text-transform:uppercase; letter-spacing:1.5px; white-space:nowrap; flex-shrink:0; min-width:46px;';
            const subRow = document.createElement('div');
            subRow.style.cssText = 'flex:1; display:flex; flex-wrap:wrap; justify-content:center; gap:8px; align-items:center;';

            const refreshSubChips = () => {
                subRow.querySelectorAll('.fp-chip').forEach(b => {
                    const k = b.dataset.key;
                    const isAll = k === '__all__';
                    const act = isAll ? directorySubFilter.size === 0 : directorySubFilter.has(k);
                    b.classList.toggle('active', act);
                    if (act && isAll) b.style.cssText = 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;';
                    else if (act) { const col = getSubjectColor(k); b.style.cssText = `background:${getSubjectBg(k)}; border-color:${col}; color:${col};`; }
                    else b.style.cssText = '';
                });
            };

            const allSubBtn = document.createElement('button');
            allSubBtn.className = 'fp-chip' + (directorySubFilter.size === 0 ? ' active' : '');
            allSubBtn.textContent = 'All';
            allSubBtn.dataset.key = '__all__';
            if (directorySubFilter.size === 0) allSubBtn.style.cssText = 'background:rgba(74,144,226,0.15); border-color:rgba(74,144,226,0.5); color:#4a90e2;';
            allSubBtn.addEventListener('click', () => {
                directorySubFilter.clear();
                refreshSubChips();
                refreshTog();
                syncDirClear();
                renderDirectoryList(staffData, subjects, list);
            });
            subRow.appendChild(allSubBtn);

            subjects.forEach(sub => {
                const color = getSubjectColor(sub);
                const btn = document.createElement('button');
                btn.className = 'fp-chip' + (directorySubFilter.has(sub) ? ' active' : '');
                btn.textContent = sub;
                btn.dataset.key = sub;
                if (directorySubFilter.has(sub)) btn.style.cssText = `background:${getSubjectBg(sub)}; border-color:${color}; color:${color};`;
                btn.addEventListener('click', () => {
                    if (directorySubFilter.has(sub)) directorySubFilter.delete(sub); else directorySubFilter.add(sub);
                    refreshSubChips();
                    refreshTog();
                    syncDirClear();
                    renderDirectoryList(staffData, subjects, list);
                });
                subRow.appendChild(btn);
            });
            subRowWrapper.appendChild(subLabelEl);
            subRowWrapper.appendChild(subRow);
            outerBar.appendChild(subRowWrapper);
        }

        // Clear all button
        const dirClearDivider = document.createElement('div');
        dirClearDivider.style.cssText = 'height:1px; background:rgba(255,255,255,0.08); margin:0 -4px; display:' + (anyActive ? '' : 'none') + ';';
        outerBar.appendChild(dirClearDivider);
        const dirClearRow = document.createElement('div');
        dirClearRow.style.cssText = 'display:' + (anyActive ? 'flex' : 'none') + '; justify-content:center;';
        const dirClearBtn = document.createElement('button');
        dirClearBtn.className = 'fp-clear-btn';
        dirClearBtn.innerHTML = '✕ Clear all filters';
        dirClearBtn.addEventListener('click', () => {
            directoryRoleFilter = 'all';
            directorySubFilter.clear();
            fpOpenState.directory = true;
            renderDirectory();
        });
        dirClearRow.appendChild(dirClearBtn);
        outerBar.appendChild(dirClearRow);

        const syncDirClear = () => {
            const active = directoryRoleFilter !== 'all' || directorySubFilter.size > 0;
            dirClearDivider.style.display = active ? '' : 'none';
            dirClearRow.style.display = active ? 'flex' : 'none';
        };

        collapsible.appendChild(outerBar);

        togBtn.addEventListener('click', () => {
            const nowOpen = collapsible.classList.contains('open');
            collapsible.classList.toggle('open', !nowOpen);
            fpOpenState.directory = !nowOpen;
            refreshTog();
        });

        filterBar.appendChild(collapsible);

        renderDirectoryList(staffData, subjects, list);
    }

    function renderDirectoryList(staffData, subjects, list) {
        list.innerHTML = '';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.maxWidth = '900px';
        list.style.margin = '0 auto';

        let filtered = staffData;
        if (directoryRoleFilter !== 'all') filtered = filtered.filter(s => s.role === directoryRoleFilter);
        if (directorySubFilter.size > 0) filtered = filtered.filter(s => s.subjects.some(sub => directorySubFilter.has(sub)));

        if (filtered.length === 0) {
            list.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#666; margin-top:30px; font-style:italic;">No staff match this filter.</div>';
            return;
        }

        const subjectGroups = {};
        filtered.forEach(person => {
            person.subjects.forEach(sub => {
                if (directorySubFilter.size > 0 && !directorySubFilter.has(sub)) return;
                if (!subjectGroups[sub]) subjectGroups[sub] = [];
                if (!subjectGroups[sub].includes(person)) subjectGroups[sub].push(person);
            });
        });

        const orderedSubjects = getHomepageOrderedSubjects()
            .map(s => s.code)
            .filter(s => subjectGroups[s] && subjectGroups[s].length > 0);
        orderedSubjects.forEach(sub => renderSubjectGroup(sub, subjectGroups[sub], list));
    }

    function renderSubjectGroup(subCode, people, container) {
        const color = getSubjectColor(subCode);
        const sObj = window.COURSE_DATA ? window.COURSE_DATA.find(s => s.code === subCode) : null;
        const subName = sObj ? sObj.name : subCode;

        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom:30px;';

        const header = document.createElement('div');
        header.style.cssText = `font-family:'Orbitron',sans-serif; font-size:1.1rem; color:${color}; border-bottom:2px solid ${color}; padding-bottom:8px; margin-bottom:12px; display:flex; align-items:center; gap:10px;`;
        header.innerHTML = `<span style="font-size:0.7rem; background:${getSubjectBg(subCode)}; color:${color}; padding:3px 8px; border-radius:6px; font-weight:700;">${subCode}</span>${subName}`;
        section.appendChild(header);

        // Doctors first, then TAs
        const sorted = [...people].sort((a, b) => (a.role === 'doctor' ? 0 : 1) - (b.role === 'doctor' ? 0 : 1));
        sorted.forEach(person => {
            const roleColor = person.role === 'doctor' ? '#007aff' : '#34c759';
            const roleBg = person.role === 'doctor' ? 'rgba(0,122,255,0.12)' : 'rgba(52,199,89,0.12)';
            const roleLabel = person.role === 'doctor' ? '🎓 Doctor' : '👨‍🏫 TA';

            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; gap:14px; padding:10px 14px; border-radius:10px; margin-bottom:6px; background:rgba(0,0,0,0.2); border-left:3px solid ${roleColor}; transition:all 0.2s; cursor:${person.teamsLink ? 'pointer' : 'default'};`;
            row.onmouseenter = () => { row.style.background = 'rgba(255,255,255,0.05)'; row.style.transform = 'translateX(4px)'; };
            row.onmouseleave = () => { row.style.background = 'rgba(0,0,0,0.2)'; row.style.transform = 'translateX(0)'; };

            let noteHtml = person.note ? `<div style="font-size:0.75rem; color:var(--text-sub); margin-top:2px;">${person.note}</div>` : '';
            let teamsHtml = person.teamsLink ? `<span style="font-size:0.8rem; color:#6264a7; flex-shrink:0;">💬 Teams</span>` : '';

            row.innerHTML = `
                <span style="font-size:0.65rem; font-weight:700; color:${roleColor}; background:${roleBg}; padding:3px 8px; border-radius:6px; white-space:nowrap; letter-spacing:1px; text-transform:uppercase;">${roleLabel}</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:var(--text-main); font-size:0.95rem;">${person.name}</div>
                    ${noteHtml}
                </div>
                ${teamsHtml}
            `;
            if (person.teamsLink) {
                const resolvedLink = getResolvedTeamsLink(person.teamsLink);
                row.onclick = () => {
                    if (resolvedLink) window.open(resolvedLink, '_blank', 'noopener');
                };
                if (resolvedLink) row.dataset.link = resolvedLink;
            }
            section.appendChild(row);
        });

        container.appendChild(section);
    }

    // --- Updates / Changelog ---
    function showUpdates(push = true) {
        renderUpdates();
        nav('updates', push);
    }

    function renderUpdates() {
        const list = document.getElementById('updates-list');
        if (!list) return;
        list.innerHTML = '';
        const data = window.UPDATES_DATA || [];
        if (data.length === 0) {
            list.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#666; margin-top:30px; font-style:italic;">No updates yet.</div>';
            return;
        }
        // Sort by date descending; entries without a valid date fall to the bottom
        const sorted = [...data].sort((a, b) => {
            const ta = a.date ? new Date(a.date).getTime() : 0;
            const tb = b.date ? new Date(b.date).getTime() : 0;
            if (ta === 0 && tb === 0) return 0;
            if (ta === 0) return 1;
            if (tb === 0) return -1;
            return tb - ta;
        });
        sorted.forEach(item => {
            const card = document.createElement('div');
            card.className = 'update-card';
            card.innerHTML = `
                <div class="update-card-icon">${item.icon || '🚀'}</div>
                <div class="update-card-title">${item.title || 'Update'}</div>
                <div class="update-card-desc">${item.desc || ''}</div>
                ${item.date ? `<div class="update-card-date">${item.date}</div>` : ''}
            `;
            list.appendChild(card);
        });
        applyWaterfallToContainer(list, '.update-card');
    }

    // --- GPA Calculator ---
    const GPA_GRADE_SCALE = [
        { letter: 'A+', gpa: 4.0, min: 97, max: 100 },
        { letter: 'A',  gpa: 4.0, min: 93, max: 96 },
        { letter: 'A-', gpa: 3.7, min: 89, max: 92 },
        { letter: 'B+', gpa: 3.3, min: 84, max: 88 },
        { letter: 'B',  gpa: 3.0, min: 80, max: 83 },
        { letter: 'B-', gpa: 2.7, min: 76, max: 79 },
        { letter: 'C+', gpa: 2.3, min: 73, max: 75 },
        { letter: 'C',  gpa: 2.0, min: 70, max: 72 },
        { letter: 'C-', gpa: 1.7, min: 67, max: 69 },
        { letter: 'D+', gpa: 1.3, min: 64, max: 66 },
        { letter: 'D',  gpa: 1.0, min: 60, max: 63 },
        { letter: 'F',  gpa: 0.0, min: 0,  max: 59 }
    ];

    const GPA_EXCLUDED_CODES = ['QC', 'RB', 'SW'];
    let gpaSubjects = [];
    let gpaSemesters = [];
    let gpaGroupMode = false;
    let gpaCardMode = false;
    let gpaCumulativeOn = true;
    let gpaCumGpa = '';
    let gpaCumHours = '';
    let gpaInitialized = false;

    function parseCreditsNumber(creditsStr) {
        if (!creditsStr) return 3;
        const m = String(creditsStr).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 3;
    }

    function getGpaDefaultSubjects() {
        const defaults = [];
        if (window.COURSE_DATA) {
            window.COURSE_DATA.forEach(s => {
                if (!GPA_EXCLUDED_CODES.includes(s.code)) {
                    defaults.push({ id: 'cd_' + s.code, code: s.code, name: s.name, credits: parseCreditsNumber(s.credits), grade: '', pointsLost: '' });
                }
            });
        }
        return defaults;
    }

    function getAllCourseSubjects() {
        if (!window.COURSE_DATA) return [];
        return window.COURSE_DATA.map(s => ({ code: s.code, name: s.name, credits: parseCreditsNumber(s.credits) }));
    }

    function pointsToGrade(score) {
        if (score === '' || score === null || score === undefined || isNaN(score)) return null;
        score = Math.max(0, Math.min(100, Math.round(Number(score))));
        for (const g of GPA_GRADE_SCALE) { if (score >= g.min && score <= g.max) return g; }
        return GPA_GRADE_SCALE[GPA_GRADE_SCALE.length - 1];
    }

    function letterToGrade(letter) {
        if (!letter) return null;
        return GPA_GRADE_SCALE.find(g => g.letter === letter) || null;
    }

    function getGpaLetterForValue(gpa) {
        if (gpa >= 3.85) return { letter: 'A / A+', color: '#34c759', bg: 'rgba(52,199,89,0.15)' };
        if (gpa >= 3.5)  return { letter: 'A-', color: '#30d158', bg: 'rgba(48,209,88,0.15)' };
        if (gpa >= 3.15) return { letter: 'B+', color: '#ffd60a', bg: 'rgba(255,214,10,0.15)' };
        if (gpa >= 2.85) return { letter: 'B', color: '#ff9f0a', bg: 'rgba(255,159,10,0.15)' };
        if (gpa >= 2.5)  return { letter: 'B-', color: '#ff9500', bg: 'rgba(255,149,0,0.15)' };
        if (gpa >= 2.15) return { letter: 'C+', color: '#ff6b35', bg: 'rgba(255,107,53,0.15)' };
        if (gpa >= 1.85) return { letter: 'C', color: '#cc2200', bg: 'rgba(204,34,0,0.15)' };
        if (gpa >= 1.5)  return { letter: 'C-', color: '#ff3b30', bg: 'rgba(255,59,48,0.15)' };
        if (gpa >= 1.0)  return { letter: 'D', color: '#ff2d55', bg: 'rgba(255,45,85,0.15)' };
        return { letter: 'F', color: '#ff0000', bg: 'rgba(255,0,0,0.15)' };
    }

    // --- localStorage persistence ---
    const GPA_STORAGE_KEY = 'wbw_gpa_state';

    function gpaSaveState() {
        try {
            const state = {
                subjects: gpaSubjects,
                semesters: gpaSemesters,
                groupMode: gpaGroupMode,
                cardMode: gpaCardMode,
                cumulativeOn: gpaCumulativeOn,
                cumGpa: gpaCumGpa,
                cumHours: gpaCumHours
            };
            localStorage.setItem(GPA_STORAGE_KEY, JSON.stringify(state));
        } catch(e) {}
    }

    function gpaLoadState() {
        try {
            const raw = localStorage.getItem(GPA_STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch(e) { return null; }
    }

    function showGpa(push = true) {
        if (!gpaInitialized) {
            const saved = gpaLoadState();
            if (saved) {
                gpaGroupMode = !!saved.groupMode;
                gpaCardMode = !!saved.cardMode;
                // Always show the cumulative bar by default; only hide if user explicitly turned it off
                // (saved.cumulativeOn===false means they toggled it off; undefined/null means first launch)
                gpaCumulativeOn = saved.cumulativeOn === false ? false : true;
                gpaCumGpa = saved.cumGpa || '';
                gpaCumHours = saved.cumHours || '';
                gpaSubjects = saved.subjects || getGpaDefaultSubjects();
                gpaSemesters = saved.semesters || [];
                if (gpaSemesters.length === 0) {
                    // Initialize groups with Prior Semesters + Current Semester
                    gpaSemesters.push({ id: 'sem_prior', name: 'Prior Semesters', mode: 'summary', summaryGpa: gpaCumGpa, summaryHours: gpaCumHours, subjects: [] });
                    gpaSemesters.push({ id: 'sem_curr', name: 'Current Semester', mode: 'subjects', summaryGpa: '', summaryHours: '', subjects: JSON.parse(JSON.stringify(gpaSubjects)) });
                }
            } else {
                gpaSubjects = getGpaDefaultSubjects();
                gpaSemesters = [
                    { id: 'sem_prior', name: 'Prior Semesters', mode: 'summary', summaryGpa: '', summaryHours: '', subjects: [] },
                    { id: 'sem_curr', name: 'Current Semester', mode: 'subjects', summaryGpa: '', summaryHours: '', subjects: JSON.parse(JSON.stringify(gpaSubjects)) }
                ];
            }
            gpaInitialized = true;
        }
        renderGpaPage();
        
        gpaRecalc();
        if (push) nav('gpa', true);
    }

    function toggleGpaCumulative() {
        if (!gpaGroupMode) {
            gpaCumulativeOn = !gpaCumulativeOn;
        }
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function toggleGpaGroupMode() {
        gpaGroupMode = !gpaGroupMode;
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function toggleGpaCardMode() {
        gpaCardMode = !gpaCardMode;
        gpaSaveState();
        renderGpaPage();
    }

    function gpaSelectTab(tab) {
        const wantsGroup = (tab === 'group');
        if (gpaGroupMode === wantsGroup) return; // already on this tab
        gpaGroupMode = wantsGroup;
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaAddSemester() {
        const id = 'sem_' + Date.now();
        const count = gpaSemesters.length + 1;
        gpaSemesters.push({ id: id, name: 'Semester ' + count, mode: 'subjects', summaryGpa: '', summaryHours: '', subjects: [] });
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function toggleSemesterMode(id) {
        const sem = gpaSemesters.find(s => s.id === id);
        if (sem) {
            sem.mode = sem.mode === 'subjects' ? 'summary' : 'subjects';
            renderGpaPage();
            gpaRecalc();
            gpaSaveState();
        }
    }

    function gpaMoveSemester(id, dir) {
        const idx = gpaSemesters.findIndex(s => s.id === id);
        if (idx < 0) return;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= gpaSemesters.length) return;
        const temp = gpaSemesters[idx];
        gpaSemesters[idx] = gpaSemesters[newIdx];
        gpaSemesters[newIdx] = temp;
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaRemoveSemester(id) {
        gpaSemesters = gpaSemesters.filter(s => s.id !== id);
        if (gpaSemesters.length === 0) gpaSemesters.push({ id: 'sem_1', name: 'Semester 1', isSummary: false, subjects: [] });
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function renderGpaPage() {
        // Update tab active states
        const tabSingle = document.getElementById('gpa-tab-single');
        const tabGroup  = document.getElementById('gpa-tab-group');
        if (tabSingle) tabSingle.classList.toggle('active', !gpaGroupMode);
        if (tabGroup)  tabGroup.classList.toggle('active',  gpaGroupMode);

        const container = document.getElementById('gpa-content-area');
        if (!container) return;
        container.innerHTML = '';

        const captureWrap = document.getElementById('gpa-capture-wrap');
        if (captureWrap) captureWrap.classList.toggle('card-active', gpaGroupMode && gpaCardMode);

        if (!gpaGroupMode) {
            // ── This Semester tab ──────────────────────────────────────
            // Inline cumulative sub-toggle
            const cumWrap = document.createElement('div');
            cumWrap.className = 'gpa-cum-sub-wrap';
            cumWrap.innerHTML = `<button class="gpa-cum-sub-btn ${gpaCumulativeOn ? 'active' : ''}" id="gpa-cum-toggle" onclick="toggleGpaCumulative()">📈 Include Previous GPA</button>`;
            container.appendChild(cumWrap);
            renderGpaNormal(container);
        } else {
            // ── All Semesters tab ──────────────────────────────────────
            // Inline card/list sub-toggle
            const viewWrap = document.createElement('div');
            viewWrap.className = 'gpa-view-toggle-wrap';
            viewWrap.innerHTML = `
                <span style="color:#555; font-size:0.78rem; font-weight:600; letter-spacing:0.5px;">VIEW</span>
                <button class="gpa-view-pill ${!gpaCardMode ? 'active' : ''}" id="gpa-list-pill" onclick="if(gpaCardMode){toggleGpaCardMode();}">📋 List</button>
                <button class="gpa-view-pill ${gpaCardMode ? 'active' : ''}"  id="gpa-card-pill" onclick="if(!gpaCardMode){toggleGpaCardMode();}">🪟 Cards</button>
            `;
            container.appendChild(viewWrap);
            renderGpaGrouped(container);
        }
    }

    function renderGpaNormal(container) {
        const totalCr = gpaSubjects.reduce((sum, s) => sum + s.credits, 0);
        let html = '';
        // Always show the cumulative bar — toggle only affects whether it's included in calculations
        html += `<div class="gpa-cumulative-box visible" id="gpa-cum-box" style="margin-bottom:20px;">
                <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
                    <div style="flex:1; min-width:140px;">
                        <label>Current GPA</label>
                        <input type="number" class="gpa-input" id="gpa-cum-gpa" placeholder="e.g. 3.5" min="0" max="4" step="0.01" value="${gpaCumGpa}" oninput="if(gpaGroupMode)return; gpaCumGpa=this.value; gpaRecalc(); gpaSaveState();">
                    </div>
                    <div style="flex:1; min-width:140px;">
                        <label>Passed Credit Hours</label>
                        <input type="number" class="gpa-input" id="gpa-cum-hours" placeholder="e.g. 30" min="0" step="1" value="${gpaCumHours}" oninput="if(gpaGroupMode)return; gpaCumHours=this.value; gpaRecalc(); gpaSaveState();">
                    </div>
                </div>
            </div>`;
        html += `<div class="gpa-subjects-header" style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:14px; margin-bottom:16px;">
            <h3 style="margin:0; font-size:1.1rem; color:var(--accent-pink);">Subjects</h3>
            <span id="gpa-total-credits" style="color:#888; font-size:0.8rem;">Total: ${totalCr} credits</span>
        </div>
        <div id="gpa-subj-list-normal" style="min-height:50px; padding-bottom:16px;" ondragover="gpaDragOver(event, 'normal')" ondrop="gpaDrop(event, 'normal')"></div>
        ${renderGpaAddBar('normal')}`;
        container.innerHTML = html;
        
        const list = document.getElementById('gpa-subj-list-normal');
        renderSubjectRows({ id: 'normal', subjects: gpaSubjects }, list);
    }

    function renderGpaGrouped(container) {
        const wrap = document.createElement('div');
        if (gpaCardMode) {
            wrap.className = 'gpa-grid-view';
        } else {
            wrap.style.width = '100%';
        }

        gpaSemesters.forEach((sem, idx) => {
            const card = document.createElement('div');
            // Card mode uses grid card style; list mode uses stacked list-card style
            card.className = gpaCardMode ? 'gpa-semester-card' : 'gpa-list-card';
            card.id = `card-${sem.id}`;

            let htmlCore = '';

            if (sem.mode === 'summary') {
                htmlCore = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
                        <h3 style="margin:0; font-size:1.1rem; color:var(--accent-pink); padding:4px; display:flex; align-items:center; gap:8px;">
                            <span contenteditable="true" onblur="gpaUpdateSemName('${sem.id}', this.innerText)" style="border-bottom:1px dashed rgba(255,255,255,0.5); outline:none; min-width:50px;" title="Click to rename">${sem.name}</span>
                            <span style="font-size:0.8rem; opacity:0.6; pointer-events:none;">✏️</span>
                        </h3>
                        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                            <button class="gpa-add-btn" style="padding:6px 10px; font-size:0.8rem; border:1px solid rgba(255,255,255,0.2); border-radius:12px;" onclick="toggleSemesterMode('${sem.id}')">Switch to Subjects</button>
                            <button class="gpa-add-btn" style="padding:6px 10px; font-size:0.8rem; border:1px solid rgba(255,255,255,0.2); border-radius:12px;" onclick="gpaMoveSemester('${sem.id}', -1)" title="Move Up"${idx === 0 ? ' disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>↑</button>
                            <button class="gpa-add-btn" style="padding:6px 10px; font-size:0.8rem; border:1px solid rgba(255,255,255,0.2); border-radius:12px;" onclick="gpaMoveSemester('${sem.id}', 1)" title="Move Down"${idx === gpaSemesters.length - 1 ? ' disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>↓</button>
                            <button class="gpa-row-remove" onclick="gpaRemoveSemester('${sem.id}')" title="Remove Semester">✕</button>
                        </div>
                    </div>
                    <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:flex-end; padding-bottom:8px;">
                        <div style="flex:1; min-width:140px;">
                            <label style="font-size:0.85rem; margin-bottom:6px; display:block; color:#888;">Semester GPA</label>
                            <input type="number" class="gpa-input" value="${sem.summaryGpa}" oninput="gpaUpdateSummary('${sem.id}', 'gpa', this.value)" placeholder="e.g. 3.5" min="0" max="4" step="0.01">
                        </div>
                        <div style="flex:1; min-width:140px;">
                            <label style="font-size:0.85rem; margin-bottom:6px; display:block; color:#888;">Passed Hours</label>
                            <input type="number" class="gpa-input" value="${sem.summaryHours}" oninput="gpaUpdateSummary('${sem.id}', 'hours', this.value)" placeholder="e.g. 15" min="0" step="1">
                        </div>
                    </div>`;
            } else {
                const totalCr = sem.subjects.reduce((sum, s) => sum + s.credits, 0);
                let gpaLabel = '';
                let pts = 0, crs = 0, hasG = false;
                sem.subjects.forEach(sub => {
                    let gInfo = null;
                    if (sub.grade) gInfo = letterToGrade(sub.grade);
                    else if (sub.pointsLost !== '') gInfo = pointsToGrade(100 - Number(sub.pointsLost));
                    if(gInfo) { pts += gInfo.gpa * sub.credits; crs += sub.credits; hasG = true; }
                });
                if(hasG && crs > 0) {
                    const sGPA = pts / crs;
                    const sLtr = getGpaLetterForValue(sGPA);
                    gpaLabel = `<span style="background:${sLtr.bg}; color:${sLtr.color}; padding:4px 10px; border-radius:10px; font-weight:bold; font-size:0.9rem; border:1px solid ${sLtr.color}; margin-right:12px;">${sGPA.toFixed(2)}</span>`;
                }
                htmlCore = `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:16px; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
                        <h3 style="margin:0; font-size:1.15rem; color:var(--accent-pink); flex:1; padding:4px; min-width:120px; display:flex; align-items:center; gap:8px;">
                            <span contenteditable="true" onblur="gpaUpdateSemName('${sem.id}', this.innerText)" style="border-bottom:1px dashed rgba(255,255,255,0.5); outline:none; min-width:50px;" title="Click to rename">${sem.name}</span>
                            <span style="font-size:0.8rem; opacity:0.6; pointer-events:none;">✏️</span>
                        </h3>
                        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                            ${gpaLabel} <span style="color:#888; font-size:0.85rem;">${totalCr} cr</span>
                            <button class="gpa-add-btn" style="padding:6px 10px; font-size:0.8rem; border:1px solid rgba(255,255,255,0.2); border-radius:12px;" onclick="toggleSemesterMode('${sem.id}')">Switch to Manual GPA/Hrs</button>
                            <button class="gpa-add-btn" style="padding:6px 10px; font-size:0.8rem; border:1px solid rgba(255,255,255,0.2); border-radius:12px;" onclick="gpaMoveSemester('${sem.id}', -1)" title="Move Up"${idx === 0 ? ' disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>↑</button>
                            <button class="gpa-add-btn" style="padding:6px 10px; font-size:0.8rem; border:1px solid rgba(255,255,255,0.2); border-radius:12px;" onclick="gpaMoveSemester('${sem.id}', 1)" title="Move Down"${idx === gpaSemesters.length - 1 ? ' disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>↓</button>
                            <button class="gpa-row-remove" onclick="gpaRemoveSemester('${sem.id}')" title="Remove Semester">✕</button>
                        </div>
                    </div>
                    <div id="gpa-subj-list-${sem.id}" style="min-height:50px; padding-bottom:10px;" ondragover="gpaDragOver(event, '${sem.id}')" ondrop="gpaDrop(event, '${sem.id}')"></div>
                    ${renderGpaAddBar(sem.id)}`;
            }

            card.innerHTML = htmlCore;
            wrap.appendChild(card);
        });

        container.appendChild(wrap);

        // Render subjective datasets reliably 
        gpaSemesters.forEach(sem => {
            if (sem.mode !== 'summary') {
                renderSubjectRows(sem, document.getElementById(`gpa-subj-list-${sem.id}`));
            }
        });

        const addBtns = document.createElement('div');
        addBtns.style.cssText = 'display:flex; gap:10px; justify-content:center; margin-top:20px;';
        addBtns.innerHTML = `<button class="gpa-add-btn" onclick="gpaAddSemester()">+ Add Semester</button>`;
        container.appendChild(addBtns);
    }

    function renderGpaAddBar(semId) {
        return `<div class="gpa-add-bar" style="margin-top:10px; background:rgba(0,0,0,0.2); padding:10px; border-radius:12px;">
            <div class="gpa-add-dropdown" style="margin-right:0;">
                <button class="gpa-add-btn" onclick="toggleGpaAddMenu('${semId}')">+ Subject</button>
                <div class="gpa-add-menu" id="gpa-add-menu-${semId}"></div>
            </div>
            <div class="gpa-add-custom" id="gpa-add-custom-${semId}" style="display:none; flex-wrap:wrap; margin-top:10px;">
                <input type="text" class="gpa-input" id="gpa-custom-name-${semId}" placeholder="Name" style="flex:1; min-width:80px;">
                <input type="number" class="gpa-input" id="gpa-custom-credits-${semId}" placeholder="Cr" min="1" max="6" style="width:60px;">
                <button class="gpa-add-btn" onclick="gpaAddCustom('${semId}')" style="border-style:solid; border-color:var(--accent-purple);">Add</button>
            </div>
        </div>`;
    }

    function gpaUpdateSemName(semId, name) {
        const sem = gpaSemesters.find(s => s.id === semId);
        if (sem) sem.name = name.trim();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaUpdateSummary(semId, field, value) {
        const sem = gpaSemesters.find(s => s.id === semId);
        if (sem) {
            if (field === 'gpa') sem.summaryGpa = value;
            if (field === 'hours') sem.summaryHours = value;
        }
        gpaRecalc();
        gpaSaveState();
    }

    let gpaDragSubject = null;
    let gpaDragSourceSemId = null;
    let gpaTouchTimeout = null;

    function renderSubjectRows(sem, container) {
        if (!container) return;
        container.innerHTML = '';
        sem.subjects.forEach((sub, sIdx) => {
            const row = document.createElement('div');
            row.className = 'gpa-row';
            row.id = `gpa-row-${sem.id}-${sIdx}`;
            
            row.draggable = true;
            row.ondragstart = (e) => { 
                gpaDragSubject = sub; gpaDragSourceSemId = sem.id; 
                e.dataTransfer.setData('text/plain', sub.id); 
                e.dataTransfer.effectAllowed = 'move';
                row.style.opacity = '0.5';
            };
            row.ondragend = () => { row.style.opacity = '1'; };
            row.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); row.style.borderTop = "2px solid var(--accent-pink)"; };
            row.ondragleave = () => { row.style.borderTop = ""; };
            row.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); row.style.borderTop = ""; gpaDropOnSubject(sem.id, sIdx); };

            // Mobile drag and drop touch events replaced with Up/Down buttons

            let gradeOpts = '<option value="">Grade</option>';
            GPA_GRADE_SCALE.forEach(g => {
                const sel = sub.grade === g.letter ? 'selected' : '';
                gradeOpts += `<option value="${g.letter}" ${sel}>${g.letter}</option>`;
            });

            let gradeInfo = null;
            if (sub.grade) gradeInfo = letterToGrade(sub.grade);
            else if (sub.pointsLost !== '') gradeInfo = pointsToGrade(100 - Number(sub.pointsLost));
            
            const resultHtml = gradeInfo
                ? `<div class="gpa-row-result" style="color:${getGpaLetterForValue(gradeInfo.gpa).color};">${gradeInfo.gpa}</div>`
                : `<div class="gpa-row-result" style="color:#555;">—</div>`;

            row.innerHTML = `<div class="gpa-drag-handle gpa-row-name" style="flex:1; display:flex; align-items:center;">
                <span style="opacity:0.3; padding:0 6px 0 0; cursor:grab; font-weight:normal;" title="Drag to reorder">⋮⋮</span>
                <div class="gpa-row-updown">
                    <button class="gpa-row-btn" onclick="gpaMoveSubject('${sem.id}', ${sIdx}, -1)" ${sIdx === 0 ? 'disabled' : ''}>↑</button>
                    <button class="gpa-row-btn" onclick="gpaMoveSubject('${sem.id}', ${sIdx}, 1)" ${sIdx === sem.subjects.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
                <div>
                    ${sub.code ? `<span style="color:var(--accent-purple); font-family:'Orbitron',sans-serif; font-size:0.7rem; margin-right:6px;">${sub.code}</span>` : ''}
                    ${sub.name}
                </div>
            </div>
            <div class="gpa-row-credits">${sub.credits} cr</div>
            <div class="gpa-row-inputs">
                <select class="gpa-select" style="flex:1; min-width:60px;" onchange="gpaSetGrade('${sem.id}', ${sIdx}, this.value)">${gradeOpts}</select>
                <input type="number" class="gpa-input" style="width:50px; padding:4px 6px; flex-shrink:0; text-align:center;" placeholder="Pts" min="0" max="100" value="${sub.pointsLost !== '' ? sub.pointsLost : ''}" oninput="gpaSetPoints('${sem.id}', ${sIdx}, this.value)">
            </div>
            ${resultHtml}
            <button class="gpa-row-remove" onclick="gpaRemoveSubject('${sem.id}', ${sIdx})" title="Remove">✕</button>`;
            container.appendChild(row);
        });
    }

    function gpaDragOver(e, semId) {
        e.preventDefault();
        e.currentTarget.style.backgroundColor = 'rgba(233,30,140,0.05)';
    }

    function gpaDrop(e, targetSemId) {
        if(e) { e.preventDefault(); e.currentTarget.style.backgroundColor = ''; }
        if(!gpaDragSubject || !gpaDragSourceSemId) return;
        const srcSem = gpaSemesters.find(s => s.id === gpaDragSourceSemId);
        if(!srcSem) return;
        srcSem.subjects = srcSem.subjects.filter(s => s.id !== gpaDragSubject.id);
        const tgtSem = gpaSemesters.find(s => s.id === targetSemId);
        if(tgtSem) tgtSem.subjects.push(gpaDragSubject);
        gpaDragSubject = null; gpaDragSourceSemId = null;
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaDropOnSubject(targetSemId, targetSubjIdx) {
        if(!gpaDragSubject || !gpaDragSourceSemId) return;
        const srcSem = gpaSemesters.find(s => s.id === gpaDragSourceSemId);
        const tgtSem = gpaSemesters.find(s => s.id === targetSemId);
        if(!srcSem || !tgtSem) return;
        if (srcSem.id === tgtSem.id && gpaDragSubject.id === tgtSem.subjects[targetSubjIdx].id) {
            gpaDragSubject = null; gpaDragSourceSemId = null;
            return;
        }
        srcSem.subjects = srcSem.subjects.filter(s => s.id !== gpaDragSubject.id);
        tgtSem.subjects.splice(targetSubjIdx, 0, gpaDragSubject);
        gpaDragSubject = null; gpaDragSourceSemId = null;
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaSetGrade(semId, idx, letter) {
        const subList = semId === 'normal' ? gpaSubjects : gpaSemesters.find(s => s.id === semId)?.subjects;
        if (!subList || !subList[idx]) return;
        subList[idx].grade = letter;
        const g = letterToGrade(letter);
        if (g) subList[idx].pointsLost = String(100 - g.min);
        else subList[idx].pointsLost = '';
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaSetPoints(semId, idx, val) {
        const subList = semId === 'normal' ? gpaSubjects : gpaSemesters.find(s => s.id === semId)?.subjects;
        if (!subList || !subList[idx]) return;
        subList[idx].pointsLost = val;
        const score = val !== '' ? 100 - Number(val) : NaN;
        const g = pointsToGrade(score);
        subList[idx].grade = g ? g.letter : '';
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaRemoveSubject(semId, idx) {
        const subList = semId === 'normal' ? gpaSubjects : gpaSemesters.find(s => s.id === semId)?.subjects;
        if (!subList) return;
        subList.splice(idx, 1);
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaMoveSubject(semId, idx, dir) {
        const subList = semId === 'normal' ? gpaSubjects : gpaSemesters.find(s => s.id === semId)?.subjects;
        if (!subList) return;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= subList.length) return;
        const temp = subList[idx];
        subList[idx] = subList[newIdx];
        subList[newIdx] = temp;
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function toggleGpaAddMenu(semId) {
        const menu = document.getElementById('gpa-add-menu-' + semId);
        if(!menu) return;
        menu.classList.toggle('open');
        if (menu.classList.contains('open')) {
            const allCourses = getAllCourseSubjects();
            let existingCodes;
            if (semId === 'normal') {
                existingCodes = new Set(gpaSubjects.filter(s => s.code).map(s => s.code));
            } else {
                existingCodes = new Set(gpaSemesters.flatMap(sem => sem.subjects || []).filter(s => s.code).map(s => s.code));
            }
            let html = '';
            allCourses.filter(c => !existingCodes.has(c.code)).forEach(c => {
                const color = getSubjectColor(c.code);
                html += `<div class="gpa-add-menu-item" onclick="gpaAddCourse('${semId}', '${c.code}')">
                    <span class="gpa-add-dot" style="background:${color};"></span>
                    <span style="flex:1;">${c.code} — ${c.name}</span>
                    <span style="color:#888; font-size:0.75rem;">${c.credits} cr</span>
                </div>`;
            });
            html += `<div class="gpa-add-menu-item" onclick="gpaShowCustomAdd('${semId}')" style="border-top:1px solid rgba(255,255,255,0.08); margin-top:4px; padding-top:10px; color:#ffd700;">
                <span style="font-size:1rem;">✏️</span><span>Custom subject...</span>
            </div>`;
            menu.innerHTML = html;
        }
    }

    function gpaAddCourse(semId, code) {
        const course = getAllCourseSubjects().find(c => c.code === code);
        if (!course) return;
        const subList = semId === 'normal' ? gpaSubjects : gpaSemesters.find(s => s.id === semId)?.subjects;
        if (!subList) return;
        subList.push({ id: 'cd_' + course.code + '_' + Date.now(), code: course.code, name: course.name, credits: course.credits, grade: '', pointsLost: '' });
        document.getElementById('gpa-add-menu-' + semId).classList.remove('open');
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaShowCustomAdd(semId) {
        document.getElementById('gpa-add-menu-' + semId).classList.remove('open');
        document.getElementById('gpa-add-custom-' + semId).style.display = 'flex';
        document.getElementById('gpa-custom-name-' + semId).focus();
    }

    function gpaAddCustom(semId) {
        const nameEl = document.getElementById('gpa-custom-name-' + semId);
        const crEl = document.getElementById('gpa-custom-credits-' + semId);
        const name = (nameEl.value || '').trim();
        const credits = parseInt(crEl.value, 10);
        if (!name) { nameEl.focus(); return; }
        if (!credits || credits < 1) { crEl.focus(); return; }
        const subList = semId === 'normal' ? gpaSubjects : gpaSemesters.find(s => s.id === semId)?.subjects;
        if (!subList) return;
        subList.push({ id: 'custom_' + Date.now(), code: '', name: name, credits: credits, grade: '', pointsLost: '' });
        renderGpaPage();
        gpaRecalc();
        gpaSaveState();
    }

    function gpaRecalc() {
        if (!gpaGroupMode) {
            gpaRecalcNormal();
        } else {
            gpaRecalcGrouped();
        }
    }

    function gpaRecalcNormal() {
        let pts = 0;
        let crs = 0;
        let hasGrade = false;

        gpaSubjects.forEach(sub => {
            let info = null;
            if (sub.grade) info = letterToGrade(sub.grade);
            else if (sub.pointsLost !== '') info = pointsToGrade(100 - Number(sub.pointsLost));
            
            if (info) {
                pts += info.gpa * sub.credits;
                crs += sub.credits;
                hasGrade = true;
            }
        });

        let cumPts = 0, cumCrs = 0, hasCum = false;
        // Bar is always visible — include previous GPA in calc whenever valid values are entered
        if (!gpaGroupMode) {
            const cGpa = parseFloat(gpaCumGpa);
            const cHrs = parseInt(gpaCumHours, 10);
            if (!isNaN(cGpa) && !isNaN(cHrs) && cHrs > 0 && cGpa >= 0) {
                cumPts = cGpa * cHrs;
                cumCrs = cHrs;
                hasCum = true;
            }
        } else if (gpaCumulativeOn) {
            const cGpa = parseFloat(gpaCumGpa);
            const cHrs = parseInt(gpaCumHours, 10);
            if (!isNaN(cGpa) && !isNaN(cHrs) && cHrs > 0 && cGpa >= 0) {
                cumPts = cGpa * cHrs;
                cumCrs = cHrs;
                hasCum = true;
            }
        }

        const resEl = document.getElementById('gpa-result-area');
        const expBar = document.getElementById('gpa-export-bar');
        const imgBtn = document.getElementById('gpa-export-img-btn');
        if (expBar) expBar.style.display = 'flex'; // Always show export bar
        if (!hasGrade && !hasCum) {
            resEl.innerHTML = `<div class="gpa-result-card">
                <div class="gpa-result-label">Cumulative GPA</div>
                <div class="gpa-result-value" style="font-size:1.5rem; -webkit-text-fill-color:#555;">Enter grades above</div>
            </div>`;
            if (imgBtn) imgBtn.style.display = 'none';
        } else {
            const totPts = pts + cumPts;
            const totCrs = crs + cumCrs;
            const fgpa = totPts / totCrs;
            const fgInfo = getGpaLetterForValue(fgpa);

            const listedSubjects = gpaSubjects.filter(s => s.grade || s.pointsLost !== '').length;
            const subjectsSuffix = listedSubjects > 0 ? ` (${listedSubjects} subjects)` : '';

            let semGpaHtml = '';
            if (hasCum && hasGrade && crs > 0) {
                const sGpa = pts / crs;
                semGpaHtml = `<div class="gpa-result-label" style="margin-top:15px; font-size:0.8rem;">Semester GPA: <span style="color:var(--accent-pink); font-size:1.1rem; font-family:'Orbitron',sans-serif;">${sGpa.toFixed(2)}</span> (${crs} cr${subjectsSuffix})</div>`;
            }

            resEl.innerHTML = `<div class="gpa-result-card" id="gpa-capture-area">
                <div class="gpa-result-label">Cumulative GPA</div>
                <div class="gpa-result-value">${fgpa.toFixed(2)}</div>
                ${semGpaHtml}
                <div class="gpa-result-sub" style="margin-top:10px;">Total: ${totCrs} credit hours passed${!hasCum ? subjectsSuffix : ''}</div>
            </div>`;
            if (imgBtn) imgBtn.style.display = 'flex';
        }
        gpaSaveState();
    }

    function gpaRecalcGrouped() {
        let globalPoints = 0, globalCredits = 0, hasAnyGrade = false;
        let breakdownHtml = '<div style="margin-top:16px; display:flex; flex-direction:column; gap:8px;">';
        let semesterCount = 0;

        gpaSemesters.forEach(sem => {
            let semPoints = 0, semCredits = 0, semHasGrade = false;
            
            if (sem.mode === 'summary') {
                const gpa = parseFloat(sem.summaryGpa);
                const hrs = parseInt(sem.summaryHours, 10);
                if (!isNaN(gpa) && !isNaN(hrs) && hrs > 0 && gpa >= 0) {
                    semPoints = gpa * hrs;
                    semCredits = hrs;
                    semHasGrade = true;
                }
            } else {
                sem.subjects.forEach(sub => {
                    let gradeInfo = null;
                    if (sub.grade) gradeInfo = letterToGrade(sub.grade);
                    else if (sub.pointsLost !== '') gradeInfo = pointsToGrade(100 - Number(sub.pointsLost));
                    
                    if (gradeInfo) {
                        semPoints += gradeInfo.gpa * sub.credits;
                        semCredits += sub.credits;
                        semHasGrade = true;
                    }
                });
            }

            if (semHasGrade && semCredits > 0) {
                globalPoints += semPoints;
                globalCredits += semCredits;
                hasAnyGrade = true;
                const sGPA = semPoints / semCredits;
                
                let subLabel = '';
                if (sem.mode !== 'summary') {
                    const subCount = (sem.subjects || []).filter(s => s.grade || s.pointsLost !== '').length;
                    subLabel = `, ${subCount} subjects`;
                }

                breakdownHtml += `<div style="display:flex; justify-content:space-between; font-size:0.85rem; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:#aaa;">${sem.name} <span style="font-size:0.7rem;">(${semCredits} cr${subLabel})</span></span>
                        <span style="color:var(--accent-pink); font-weight:bold;">${sGPA.toFixed(2)}</span>
                    </div>`;
                semesterCount++;
            }
        });

        breakdownHtml += '</div>';

        const resultArea = document.getElementById('gpa-result-area');
        const exportBar = document.getElementById('gpa-export-bar');

        if (!hasAnyGrade) {
            resultArea.style.cssText = 'margin: 30px auto; display: block; max-width: 400px;';
            resultArea.innerHTML = `<div class="gpa-result-card">
                <div class="gpa-result-label">Cumulative GPA</div>
                <div class="gpa-result-value" style="font-size:1.5rem; -webkit-text-fill-color:#555;">Enter grades above</div>
            </div>`;
            const imgBtn = document.getElementById('gpa-export-img-btn');
            if (imgBtn) imgBtn.style.display = 'none';
            // Need to save even if empty so state removes old data
            gpaSaveState();
            return;
        }

        const cumGpa = globalPoints / globalCredits;

        resultArea.style.cssText = 'margin: 30px auto; display: block; max-width: 400px;';
        resultArea.innerHTML = `<div class="gpa-result-card" id="gpa-capture-area">
            <div class="gpa-result-label">Cumulative GPA</div>
            <div class="gpa-result-value">${cumGpa.toFixed(2)}</div>
            <div class="gpa-result-sub" style="margin-top:10px;">Total: ${globalCredits} credit hours passed</div>
            ${semesterCount > 1 ? breakdownHtml : ''}
        </div>`;

        const imgBtn = document.getElementById('gpa-export-img-btn');
        if (imgBtn) imgBtn.style.display = 'flex';
        gpaSaveState();
    }

    // --- Page Screenshot Helpers ---
    function exportTimetableImage() {
        const el = document.getElementById('timetable-capture-wrap');
        const bar = document.getElementById('timetable-export-bar');
        const backBtn = document.querySelector('#timetable-page > .back-btn');
        const title = el ? el.querySelector('h1') : null;
        const subtitle = el ? el.querySelector('p.subtitle') : null;
        capturePageImage(el, 'timetable.png', [bar, backBtn, title, subtitle]);
    }

    function exportTimetableDayImage() {
        if (typeof window.html2canvas !== 'function') {
            showToast('⏳ Loading screenshot library...', 'locked');
            const poll = setInterval(() => { if (typeof window.html2canvas === 'function') { clearInterval(poll); exportTimetableDayImage(); } }, 200);
            return;
        }
        const TD = window.TIMETABLE_DATA;
        if (!TD) { showToast('No timetable data.'); return; }

        // Build a day-picker popup
        const days = TD.days || [];
        if (days.length === 0) { showToast('No days in timetable.'); return; }

        // If a picker already exists, remove it
        const existingPicker = document.getElementById('tt-day-picker');
        if (existingPicker) { existingPicker.remove(); return; }

        const picker = document.createElement('div');
        picker.id = 'tt-day-picker';
        picker.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0a0012;border:1px solid rgba(233,30,140,0.4);border-radius:16px;padding:20px 24px;z-index:3000;box-shadow:0 0 40px rgba(233,30,140,0.2);min-width:260px;';
        picker.innerHTML = `<div style="font-family:'Orbitron',sans-serif;font-size:0.75rem;color:var(--accent-pink);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;text-align:center;">Select Day</div>
            <div id="tt-day-picker-btns" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;"></div>
            <button onclick="document.getElementById('tt-day-picker').remove()" style="display:block;margin:14px auto 0;background:none;border:1px solid #555;color:#888;padding:4px 16px;border-radius:8px;cursor:pointer;font-size:0.78rem;">Cancel</button>`;

        const btnWrap = picker.querySelector('#tt-day-picker-btns');
        days.forEach((day, di) => {
            const b = document.createElement('button');
            b.textContent = day;
            b.style.cssText = 'background:rgba(233,30,140,0.1);border:1px solid rgba(233,30,140,0.4);color:#e91e8c;padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.82rem;transition:0.2s;';
            b.onmouseover = () => { b.style.background = '#e91e8c'; b.style.color = '#fff'; };
            b.onmouseout  = () => { b.style.background = 'rgba(233,30,140,0.1)'; b.style.color = '#e91e8c'; };
            b.onclick = () => { picker.remove(); _captureOneDay(di, day); };
            btnWrap.appendChild(b);
        });
        document.body.appendChild(picker);
    }

    function captureTimetableDayImageFromData(dayIndex, dayName, fileName) {
        return new Promise(function(resolve, reject) {
            if (typeof window.html2canvas !== 'function') {
                reject(new Error('html2canvas unavailable'));
                return;
            }
            const TD = window.TIMETABLE_DATA;
            if (!TD) {
                reject(new Error('No timetable data'));
                return;
            }
            const sectionKey = getStudioSectionKey(TD);
            const times = (TD.timeSlots && (TD.timeSlots[ttMode] || TD.timeSlots.normal)) || [];
            const entries = (TD.sections[sectionKey] || []).filter(function(e) {
                return ttSelectedSubjects.includes(e.subject) && e.day === dayIndex;
            });
            const sortedEntries = entries.slice().sort(function(a, b) {
                const ta = parseStudioTime(extractStudioEventTimeText(a, TD));
                const tb = parseStudioTime(extractStudioEventTimeText(b, TD));
                if (ta !== tb) return ta - tb;
                return String(a.subject || '').localeCompare(String(b.subject || ''));
            });

            const shell = document.createElement('div');
            shell.style.cssText = 'position:absolute;left:-9999px;top:0;background:#0a0012;padding:24px 28px;font-family:Work Sans,Arial,sans-serif;box-sizing:border-box;min-width:340px;';
            shell.innerHTML = '<div style="font-family:Orbitron,sans-serif;font-size:18px;font-weight:900;color:#e91e8c;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">' + dayName + '</div>' +
                '<div style="font-size:11px;color:#888;margin-bottom:18px;">Section ' + sectionKey + ' · ' + ttMode.charAt(0).toUpperCase() + ttMode.slice(1) + ' schedule</div>';

            if (sortedEntries.length === 0) {
                shell.innerHTML += '<div style="text-align:center;color:#555;padding:30px 0;font-size:13px;">No classes on ' + dayName + '</div>';
            } else {
                sortedEntries.forEach(function(e) {
                    const sc = TT_SUBJECT_COLORS[e.subject] || { text:'#ccc' };
                    const ts = TT_TYPE_STYLES[e.type] || TT_TYPE_STYLES.lec;
                    const timeText = extractStudioEventTimeText(e, TD) || (Number.isInteger(e.slot) ? (times[e.slot] || '') : '');
                    if (timeText) {
                        shell.innerHTML += '<div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;margin-top:12px;">' + timeText + '</div>';
                    }
                    shell.innerHTML += '<div style="background:' + ts.bg + ';border:1px solid ' + ts.border + ';border-radius:10px;padding:10px 14px;margin-bottom:6px;">' +
                        '<div style="color:' + sc.text + ';font-family:Orbitron,sans-serif;font-size:13px;font-weight:800;margin-bottom:3px;">' + e.subject + '</div>' +
                        '<div style="color:' + ts.text + ';font-size:11px;">' + ts.label + (e.room ? ' · ' + e.room : '') + '</div>' +
                        (e.note ? '<div style="color:' + ts.text + ';font-size:10px;margin-top:3px;opacity:0.8;">' + e.note + '</div>' : '') +
                        '</div>';
                });
            }

            document.body.appendChild(shell);
            showToast('📸 Generating image...', 'locked');
            requestAnimationFrame(function() {
                window.html2canvas(shell, { backgroundColor:'#0a0012', scale:2.5, useCORS:true, allowTaint:true, width:shell.scrollWidth, windowWidth:shell.scrollWidth, logging:false })
                    .then(function(canvas) {
                        canvas.toBlob(function(blob) {
                            if (blob) {
                                downloadBlob(blob, fileName || ('timetable-' + String(dayName || 'day').toLowerCase() + '.png'));
                                showToast('📸 Image saved!','locked');
                                resolve();
                            } else {
                                showToast('⚠️ Could not generate image','locked');
                                reject(new Error('Capture failed'));
                            }
                        });
                    })
                    .catch(function() {
                        showToast('⚠️ Could not generate image','locked');
                        reject(new Error('Capture failed'));
                    })
                    .finally(function() { shell.remove(); });
            });
        });
    }

    function _captureOneDay(dayIndex, dayName) {
        return captureTimetableDayImageFromData(dayIndex, dayName, `timetable-${dayName.toLowerCase()}.png`);
    }

    function studioQuickCapture() {
        const TD = window.TIMETABLE_DATA;
        if (!TD) return;
        if (typeof window.html2canvas !== 'function') {
            showToast('⏳ Loading screenshot library...', 'locked');
            const poll = setInterval(function() {
                if (typeof window.html2canvas === 'function') {
                    clearInterval(poll);
                    studioQuickCapture();
                }
            }, 200);
            return;
        }
        const dayIndex = getTimetableTodayIndex(TD);
        const dayName = (TD.days && TD.days[dayIndex]) ? TD.days[dayIndex] : 'Day';
        captureTimetableDayImageFromData(dayIndex, dayName, 'timetable-' + String(dayName).toLowerCase() + '.png')
            .then(function() { closeScreenshotStudioModal(null, true); })
            .catch(function() {});
    }

    function studioCaptureCustomTimetable(selectedDayName) {
        const TD = window.TIMETABLE_DATA;
        if (typeof window.html2canvas !== 'function') {
            showToast('⏳ Loading screenshot library...', 'locked');
            const poll = setInterval(function() {
                if (typeof window.html2canvas === 'function') {
                    clearInterval(poll);
                    studioCaptureCustomTimetable();
                }
            }, 200);
            return;
        }

        const chosenDay = String(selectedDayName || studioSelectedDayName || '').trim();
        if (!chosenDay) {
            showToast('Select a day first.', 'locked');
            studioGoBack();
            return;
        }

        studioSortTempEvents();
        const preparedEvents = studioTempDayEvents.map(function(event) {
            const copy = JSON.parse(JSON.stringify(event));
            copy.subject = studioResolveSubjectName(copy.subject || copy.subjectCode);
            const resolvedTime = String(copy.displayTime || copy.time || copy.slotText || copy.timeText || extractStudioEventTimeText(copy, TD)).trim();
            copy.displayTime = resolvedTime || 'No time';
            return copy;
        }).sort(function(a, b) {
            return parseStudioTime(a.displayTime) - parseStudioTime(b.displayTime);
        });
        tempStudioEvents = preparedEvents;

        const ghostContainer = document.createElement('div');
        ghostContainer.style.cssText = 'position:absolute; left:-9999px; top:0; width:300px; background:var(--bg-dark); padding:20px; border-radius:12px; display:flex; flex-direction:column; gap:10px;';
        document.body.appendChild(ghostContainer);

        const header = document.createElement('h2');
        header.style.cssText = 'color:var(--accent-pink); text-align:center; margin:0 0 8px 0; font-family:Orbitron,sans-serif; letter-spacing:1px; text-transform:uppercase;';
        header.textContent = chosenDay;
        ghostContainer.appendChild(header);

        preparedEvents.forEach(function(event) {
            const ts = TT_TYPE_STYLES[event.type] || TT_TYPE_STYLES.lec;
            const sc = TT_SUBJECT_COLORS[event.subject] || { text: '#ccc' };
            const typedTime = String(event.displayTime || '').trim() || 'No time';

            const block = document.createElement('div');
            block.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

            const timeLine = document.createElement('div');
            timeLine.style.cssText = 'font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase;';
            timeLine.textContent = typedTime;
            block.appendChild(timeLine);

            const card = document.createElement('div');
            card.style.cssText = 'background:' + ts.bg + '; border:1px solid ' + ts.border + '; box-shadow:0 0 12px ' + ts.border + ', inset 0 0 12px ' + ts.bg + '; border-radius:10px; padding:10px 12px;';
            card.innerHTML = '<div style="color:' + sc.text + '; font-family:Orbitron,sans-serif; font-size:13px; font-weight:800;">' + eHtml(event.subject || '') + '</div>' +
                '<div style="color:' + ts.text + '; font-size:11px; margin-top:3px;">' + ts.label + (event.room ? ' · ' + eHtml(event.room) : '') + '</div>' +
                '<div style="display:flex; gap:6px; margin-top:6px;">' +
                '<span style="background:' + ts.border + '; color:#000; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">' + ts.label + '</span>' +
                (event.backup ? '<span style="font-size:10px; font-weight:800; letter-spacing:1px; text-transform:uppercase; background:rgba(255,204,0,0.2); color:#ffcc00; border:1px solid rgba(255,204,0,0.4); padding:2px 6px; border-radius:4px;">BACKUP</span>' : '') +
                '</div>' +
                (event.note ? '<div style="color:' + ts.text + '; font-size:10px; margin-top:5px;">' + eHtml(event.note) + '</div>' : '');
            block.appendChild(card);
            ghostContainer.appendChild(block);
        });

        if (!preparedEvents.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;color:#666;font-size:12px;padding:16px 0;';
            empty.textContent = 'No events for this day.';
            ghostContainer.appendChild(empty);
        }

        setTimeout(function() {
            window.html2canvas(ghostContainer, {
                backgroundColor: '#0a0012',
                scale: 2.5,
                useCORS: true,
                allowTaint: true,
                width: ghostContainer.scrollWidth,
                windowWidth: ghostContainer.scrollWidth,
                logging: false
            }).then(function(canvas) {
                canvas.toBlob(function(blob) {
                    if (blob) {
                        downloadBlob(blob, 'timetable-custom-' + String(chosenDay).toLowerCase() + '.png');
                        showToast('📸 Image saved!', 'locked');
                    } else {
                        showToast('⚠️ Could not generate image', 'locked');
                    }
                    if (ghostContainer.parentNode) ghostContainer.parentNode.removeChild(ghostContainer);
                    closeScreenshotStudioModal(null, true);
                });
            }).catch(function() {
                    if (ghostContainer.parentNode) ghostContainer.parentNode.removeChild(ghostContainer);
                    showToast('⚠️ Could not generate image', 'locked');
                });
        }, 150);
    }

    function _buildExamShell(isFinals) {
        const exams = isFinals ? (window.FINAL_DATA || []) : (window.MIDTERM_DATA || []);
        const hiddenSet = isFinals ? (typeof finalHiddenSet !== 'undefined' ? finalHiddenSet : new Set())
                                   : (typeof midtermHiddenSet !== 'undefined' ? midtermHiddenSet : new Set());
        const accentColor = isFinals ? '#d97706' : '#007aff';
        const accentRgb   = isFinals ? '204,34,0' : '0,122,255';
        const fileName    = isFinals ? 'final-exams.png' : 'midterm-exams.png';
        const shell = document.createElement('div');
        shell.style.cssText = 'position:absolute;left:-9999px;top:0;padding:28px 32px;background:#0a0012;width:820px;font-family:Work Sans,Arial,sans-serif;box-sizing:border-box;';
        const sorted = exams.map((exam, i) => ({ exam, origIdx: i })).sort((a, b) => {
            const da = a.exam.date || '', db = b.exam.date || '';
            return da < db ? -1 : da > db ? 1 : 0;
        });
        let lastDate = '', innerHtml = '', hasAny = false;
        sorted.forEach(({ exam, origIdx }) => {
            if (hiddenSet.has(origIdx)) return;
            hasAny = true;
            let subName = exam.sub;
            const sObj = (window.COURSE_DATA || []).find(s => s.code === exam.sub);
            if (sObj) subName = sObj.name;
            if (exam.dateLabel !== lastDate) {
                innerHtml += `<div style="font-family:Orbitron,sans-serif;font-size:11px;letter-spacing:2px;color:${accentColor};text-transform:uppercase;margin-bottom:10px;margin-top:22px;font-weight:700;">${eHtml(exam.dateLabel)}</div>`;
                lastDate = exam.dateLabel;
            }
            innerHtml += `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(${accentRgb},0.1);border:1px solid rgba(${accentRgb},0.3);border-radius:10px;margin-bottom:8px;">
                <div style="background:rgba(${accentRgb},0.2);color:${accentColor};font-family:Orbitron,sans-serif;font-size:11px;font-weight:700;padding:5px 10px;border-radius:8px;min-width:48px;text-align:center;">${eHtml(exam.sub)}</div>
                <div style="flex:1;"><div style="color:#fff;font-weight:600;font-size:15px;">${eHtml(subName)}</div><div style="color:#888;font-size:12px;margin-top:2px;">${eHtml(exam.examCode || '')}</div></div>
                <div style="text-align:right;flex-shrink:0;"><div style="color:${accentColor};font-weight:700;font-size:14px;font-family:Orbitron,sans-serif;">${eHtml(exam.time || '')}</div></div>
            </div>`;
        });
        if (!hasAny) innerHtml = `<div style="text-align:center;color:#555;padding:40px 0;font-size:14px;">No exams to display.</div>`;
        shell.innerHTML = innerHtml;
        return { shell, fileName };
    }

    function exportMidtermImage() {
        if (typeof window.html2canvas !== 'function') {
            showToast('⏳ Loading screenshot library...', 'locked');
            const poll = setInterval(() => { if (typeof window.html2canvas === 'function') { clearInterval(poll); exportMidtermImage(); } }, 200);
            return;
        }
        const { shell, fileName } = _buildExamShell(false);
        document.body.appendChild(shell);
        showToast('📸 Generating image...', 'locked');
        requestAnimationFrame(() => {
            window.html2canvas(shell, { backgroundColor: '#0a0012', scale: 2.5, useCORS: true, allowTaint: true, width: shell.scrollWidth, windowWidth: shell.scrollWidth, logging: false })
                .then(canvas => { canvas.toBlob(blob => { if (blob) { downloadBlob(blob, fileName); showToast('📸 Image saved!', 'locked'); } }); })
                .catch(() => showToast('⚠️ Could not generate image', 'locked'))
                .finally(() => shell.remove());
        });
    }

    function exportFinalsImage() {
        if (typeof window.html2canvas !== 'function') {
            showToast('⏳ Loading screenshot library...', 'locked');
            const poll = setInterval(() => { if (typeof window.html2canvas === 'function') { clearInterval(poll); exportFinalsImage(); } }, 200);
            return;
        }
        const { shell, fileName } = _buildExamShell(true);
        document.body.appendChild(shell);
        showToast('📸 Generating image...', 'locked');
        requestAnimationFrame(() => {
            window.html2canvas(shell, { backgroundColor: '#0a0012', scale: 2.5, useCORS: true, allowTaint: true, width: shell.scrollWidth, windowWidth: shell.scrollWidth, logging: false })
                .then(canvas => { canvas.toBlob(blob => { if (blob) { downloadBlob(blob, fileName); showToast('📸 Image saved!', 'locked'); } }); })
                .catch(() => showToast('⚠️ Could not generate image', 'locked'))
                .finally(() => shell.remove());
        });
    }

    function exportGpaImage() {
        const el = document.getElementById('gpa-capture-wrap');
        const exportBar = document.getElementById('gpa-export-bar');
        const backBtn = document.querySelector('#gpa-page > .back-btn');
        const toggles = document.getElementById('gpa-mode-toggles');

        if (!el) { showToast('Nothing to capture', 'locked'); return; }

        if (typeof window.html2canvas !== 'function') {
            showToast('⏳ Loading screenshot library...', 'locked');
            const poll = setInterval(() => {
                if (typeof window.html2canvas === 'function') { clearInterval(poll); exportGpaImage(); }
            }, 200);
            return;
        }

        showToast('📸 Generating image...', 'locked');
        [exportBar, backBtn, toggles].forEach(item => { if (item) item.style.display = 'none'; });

        const isGrid = gpaGroupMode && gpaCardMode;
        const GRID_CAPTURE_WIDTH = 1400;
        const origMaxWidth = el.style.maxWidth;
        const origWidth = el.style.width;
        const origPadding = el.style.padding;
        const origBg = el.style.background;

        if (isGrid) {
            el.style.maxWidth = GRID_CAPTURE_WIDTH + 'px';
            el.style.width = GRID_CAPTURE_WIDTH + 'px';
        }
        el.style.padding = '40px 20px';
        el.style.background = '#0a0012';

        requestAnimationFrame(() => {
            const captureWidth = isGrid ? GRID_CAPTURE_WIDTH : el.scrollWidth;
            window.html2canvas(el, {
                backgroundColor: '#0a0012',
                scale: 2,
                useCORS: true,
                scrollY: -window.scrollY,
                width: captureWidth,
                windowWidth: captureWidth
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = 'gpa-calculator.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
                showToast('📸 Image saved!', 'locked');
            }).catch(() => {
                showToast('⚠️ Could not generate image', 'locked');
            }).finally(() => {
                [exportBar, backBtn, toggles].forEach(item => { if (item) item.style.display = ''; });
                el.style.maxWidth = origMaxWidth;
                el.style.width = origWidth;
                el.style.padding = origPadding;
                el.style.background = origBg;
            });
        });
    }

    function capturePageImage(el, fileName, hideElements = []) {
        if (!el) { showToast('Nothing to capture', 'locked'); return; }

        if (typeof window.html2canvas !== 'function') {
            showToast('⏳ Loading screenshot library...', 'locked');
            const poll = setInterval(() => {
                if (typeof window.html2canvas === 'function') {
                    clearInterval(poll);
                    capturePageImage(el, fileName, hideElements);
                }
            }, 200);
            return;
        }

        showToast('📸 Generating image...', 'locked');

        // The element may be inside a display:none container (e.g. the inactive
        // midterms/finals sub-view). Temporarily make every hidden ancestor visible
        // so html2canvas can measure and render it.
        const hiddenAncestors = [];
        let node = el.parentElement;
        while (node && node !== document.body) {
            const cs = window.getComputedStyle(node);
            if (cs.display === 'none') {
                hiddenAncestors.push({ el: node, prev: node.style.display });
                node.style.display = 'block';
            }
            node = node.parentElement;
        }

        // Save original display values before hiding chrome elements
        const origDisplays = hideElements.map(item => item ? item.style.display : null);
        hideElements.forEach(item => { if (item) item.style.display = 'none'; });

        const origPadding = el.style.padding;
        const origBg = el.style.background;
        el.style.padding = '40px 20px';
        el.style.background = '#0a0012';

        requestAnimationFrame(() => {
            window.html2canvas(el, {
                backgroundColor: '#0a0012',
                scale: 2,
                useCORS: true,
                scrollY: -window.scrollY,
                width: el.scrollWidth,
                windowWidth: el.scrollWidth
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = fileName;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showToast('📸 Image saved!', 'locked');
            }).catch(() => {
                showToast('⚠️ Could not generate image', 'locked');
            }).finally(() => {
                // Restore everything
                hideElements.forEach((item, i) => { if (item) item.style.display = origDisplays[i] || ''; });
                hiddenAncestors.forEach(({ el: a, prev }) => { a.style.display = prev; });
                el.style.padding = origPadding;
                el.style.background = origBg;
            });
        });
    }

    // Close add menu on outside click
    document.addEventListener('click', function(e) {
        const menu = document.getElementById('gpa-add-menu');
        const btn = e.target.closest('.gpa-add-btn');
        if (menu && !menu.contains(e.target) && !btn) {
            menu.classList.remove('open');
        }
    });

    // --- GPA Import/Export ---
    function openGpaDataModal() {
        const modal = document.getElementById('gpa-data-modal');
        const exportText = document.getElementById('gpa-export-text');
        const importText = document.getElementById('gpa-import-text');
        if (!modal || !exportText || !importText) return;
        
        importText.value = ''; // clear previous import attempt
        
        const state = {
            subjects: gpaSubjects,
            semesters: gpaSemesters,
            groupMode: gpaGroupMode,
            cardMode: gpaCardMode,
            cumulativeOn: gpaCumulativeOn,
            cumGpa: gpaCumGpa,
            cumHours: gpaCumHours
        };
        
        try {
            const jsonStr = JSON.stringify(state);
            exportText.value = btoa(encodeURIComponent(jsonStr));
        } catch(e) {
            exportText.value = 'Error generating data.';
        }
        
        modal.classList.add('active');
    }

    function closeGpaDataModal(event, force=false) {
        if (force || event.target.id === 'gpa-data-modal') {
            document.getElementById('gpa-data-modal').classList.remove('active');
        }
    }

    function copyGpaData() {
        const input = document.getElementById('gpa-export-text');
        if (!input.value || input.value.startsWith('Error')) return;
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value).then(() => {
                showToast('📋 Copied to clipboard!', 'success');
            }).catch(() => {
                fallbackCopy(input);
            });
        } else {
            fallbackCopy(input);
        }
    }
    
    function fallbackCopy(input) {
        input.select();
        try {
            document.execCommand('copy');
            showToast('📋 Copied to clipboard!', 'success');
        } catch (err) {
            showToast('⚠️ Could not copy automatically', 'locked');
        }
    }

    function importGpaData() {
        const textarea = document.getElementById('gpa-import-text');
        if (!textarea.value) {
            showToast('⚠️ Please paste a data code first', 'locked');
            return;
        }
        
        try {
            const jsonStr = decodeURIComponent(atob(textarea.value.trim()));
            const parsed = JSON.parse(jsonStr);
            
            if (parsed && Array.isArray(parsed.subjects)) {
                gpaSubjects = parsed.subjects;
                gpaSemesters = parsed.semesters || [];
                gpaGroupMode = !!parsed.groupMode;
                gpaCardMode = !!parsed.cardMode;
                gpaCumulativeOn = !!parsed.cumulativeOn;
                gpaCumGpa = parsed.cumGpa || '';
                gpaCumHours = parsed.cumHours || '';
                
                gpaSaveState();
                renderGpaPage();
                gpaRecalc();
                
                closeGpaDataModal(null, true);
                showToast('✅ GPA Data Imported Successfully!', 'success');
            } else {
                showToast('❌ Invalid Data Format', 'locked');
            }
        } catch(e) {
            showToast('❌ Failed to parse data. Make sure you copied the entire string.', 'locked');
        }
    }

    // ── Global link context menu ──────────────────────────────────────────────
    (function() {
        let menu = null;
        let suppressUrl = null;
        let suppressUntil = 0;

        function openInBackgroundTab(url) {
            const w = window.open(url, '_blank', 'noopener,noreferrer');
            if (w) {
                try { w.blur(); } catch (_) {}
                try { window.focus(); } catch (_) {}
                return;
            }
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.position = 'fixed';
            a.style.left = '-9999px';
            a.style.top = '-9999px';
            document.body.appendChild(a);
            try { a.click(); } finally { a.remove(); }
        }

        function closeMenu() {
            if (menu) { menu.remove(); menu = null; }
        }

        function findLink(el) {
            const toAbsoluteLink = (rawUrl) => {
                if (!rawUrl || !rawUrl.trim()) return null;
                try { return new URL(rawUrl.trim(), window.location.href).href; }
                catch (_) { return rawUrl.trim(); }
            };
            const gpaAbsUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#gpa`;

            // GPA should always resolve to GPA page, regardless of parent clickable cards.
            const gpaNode = el && typeof el.closest === 'function'
                ? el.closest('.gpa-btn, .nav-link-gpa, #nav-item-gpa, [data-nav="gpa"], [data-link="#gpa"], [onclick*="showGpa("]')
                : null;
            if (gpaNode) return gpaAbsUrl;

            const mapOnclickToLink = (node) => {
                if (!node || typeof node.getAttribute !== 'function') return null;
                const onClickCode = (node.getAttribute('onclick') || '').trim();
                if (!onClickCode) return null;

                const navMatch = onClickCode.match(/navFromBar\('([^']+)'\)/);
                if (navMatch && navMatch[1]) return `#${navMatch[1]}`;

                if (/showRecent\s*\(/.test(onClickCode)) return '#recent';
                if (/showSchedule\s*\(/.test(onClickCode)) return '#schedule';
                if (/showDeadlines\s*\(/.test(onClickCode)) return '#deadlines';
                if (/showMidterms\s*\(/.test(onClickCode)) return '#midterm';
                if (/showUsefulLinks\s*\(/.test(onClickCode)) return '#useful-links';
                if (/showTimetable\s*\(/.test(onClickCode)) return '#timetable';
                if (/showDirectory\s*\(/.test(onClickCode)) return '#directory';
                if (/showGpa\s*\(/.test(onClickCode)) return '#gpa';
                if (/showUpdates\s*\(/.test(onClickCode)) return '#updates';

                if (/goToScheduleTask\s*\(/.test(onClickCode) || /openModal\s*\(/.test(onClickCode)) return '#schedule';

                if (currSub && currSub.code) {
                    if (/renderSubjectView\('weeks'\)/.test(onClickCode)) return `#${currSub.code}`;
                    if (/renderSubjectView\('events'\)/.test(onClickCode)) return `#${currSub.code}/events`;
                    if (/renderSubjectView\('playlists'\)/.test(onClickCode)) return `#${currSub.code}/links`;
                    if (/renderSubjectView\('details'\)/.test(onClickCode)) return `#${currSub.code}/details`;
                }

                return null;
            };

            // Walk up DOM from target — find data-link attr or <a href>
            let node = el;
            while (node && node !== document.body) {
                if (node.classList && (node.classList.contains('gpa-btn') || node.classList.contains('nav-link-gpa'))) {
                    return gpaAbsUrl;
                }
                if ((node.id && node.id === 'nav-item-gpa') || (node.dataset && node.dataset.nav === 'gpa') || (node.dataset && node.dataset.link === '#gpa')) {
                    return gpaAbsUrl;
                }
                if (node.dataset && node.dataset.link && node.dataset.link.trim()) return toAbsoluteLink(node.dataset.link);
                if (node.dataset && node.dataset.nav && node.dataset.nav.trim()) return toAbsoluteLink(`#${node.dataset.nav.trim()}`);
                const mappedLink = mapOnclickToLink(node);
                if (mappedLink) return toAbsoluteLink(mappedLink);
                if (node.tagName === 'A' && node.href && !node.href.startsWith('javascript')) return toAbsoluteLink(node.href);
                node = node.parentElement;
            }
            return null;
        }

        function showMenu(x, y, url) {
            closeMenu();
            suppressUrl = url;
            suppressUntil = Date.now() + 1200;
            menu = document.createElement('div');
            menu.id = 'wbw-ctx-menu';

            const openBtn = document.createElement('button');
            openBtn.innerHTML = '<span class="ctx-icon">↗</span> Open in new tab';
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                suppressUrl = url;
                suppressUntil = Date.now() + 600;
                openInBackgroundTab(url);
                closeMenu();
            });

            const sep = document.createElement('hr');

            const copyBtn = document.createElement('button');
            copyBtn.innerHTML = '<span class="ctx-icon">🔗</span> Copy link';
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(url).then(() => {
                        copyBtn.innerHTML = '<span class="ctx-icon">✓</span> Copied!';
                        copyBtn.style.color = '#34c759';
                        setTimeout(closeMenu, 800);
                    }).catch(() => fallbackCopyCtx(url, copyBtn));
                } else {
                    fallbackCopyCtx(url, copyBtn);
                }
            });

            menu.appendChild(openBtn);
            menu.appendChild(sep);
            menu.appendChild(copyBtn);
            document.body.appendChild(menu);

            // Position — keep inside viewport
            const mw = 190, mh = 80;
            const vw = window.innerWidth, vh = window.innerHeight;
            menu.style.left = (x + mw > vw ? vw - mw - 8 : x) + 'px';
            menu.style.top  = (y + mh > vh ? y - mh : y) + 'px';
        }

        function fallbackCopyCtx(url, btn) {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.cssText = 'position:fixed; opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); btn.innerHTML = '<span class="ctx-icon">✓</span> Copied!'; btn.style.color = '#34c759'; } catch(_) { btn.innerHTML = '<span class="ctx-icon">✗</span> Failed'; }
            document.body.removeChild(ta);
            setTimeout(closeMenu, 800);
        }

        document.addEventListener('auxclick', function(e) {
            if (e.button !== 1) return; // only middle click
            const url = findLink(e.target);
            if (!url) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            openInBackgroundTab(url);
        });

        // Extra guard: block accidental same-tab click-through right after opening a new tab.
        document.addEventListener('click', function(e) {
            if (!suppressUrl || Date.now() > suppressUntil) return;
            const url = findLink(e.target);
            if (url && url === suppressUrl) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            }
        }, true);

        document.addEventListener('contextmenu', function(e) {
            const url = findLink(e.target);
            if (!url) { closeMenu(); return; } // no link — let browser handle it
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            showMenu(e.clientX, e.clientY, url);
        }, true);

        document.addEventListener('click', closeMenu);
        document.addEventListener('scroll', closeMenu, true);
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeMenu(); });
    })();

    window.addEventListener('message', function(event) {
        const msg = event && event.data;
        if (!msg || msg.type !== 'LIVE_UPDATE' || !msg.payload || typeof msg.payload !== 'object') return;

        const payload = msg.payload;
        const prevPage = currentPageId || 'home';
        const prevSubCode = currSub && currSub.code ? currSub.code : null;
        const prevSubView = currentSubjectView || 'weeks';
        const prevContentTitle = currentContentObj && currentContentObj.title ? currentContentObj.title : null;
        const prevContentFrom = weekNavFrom || 'weeks';

        if (payload.CONFIG !== undefined) window.CONFIG = payload.CONFIG;
        if (payload.COURSE_DATA !== undefined) window.COURSE_DATA = payload.COURSE_DATA;
        if (payload.SUBJECT_DETAILS_DATA !== undefined) window.SUBJECT_DETAILS_DATA = payload.SUBJECT_DETAILS_DATA;
        if (payload.SCHEDULE_DATA !== undefined) window.SCHEDULE_DATA = payload.SCHEDULE_DATA;
        if (payload.MIDTERM_DATA !== undefined) window.MIDTERM_DATA = payload.MIDTERM_DATA;
        if (payload.FINAL_DATA !== undefined) window.FINAL_DATA = payload.FINAL_DATA;
        if (payload.STAFF_DATA !== undefined) window.STAFF_DATA = payload.STAFF_DATA;
        if (payload.TIMETABLE_DATA !== undefined) window.TIMETABLE_DATA = payload.TIMETABLE_DATA;
        if (payload.UPDATES_DATA !== undefined) window.UPDATES_DATA = payload.UPDATES_DATA;
        if (payload.NEWS_DATA !== undefined) window.NEWS_DATA = payload.NEWS_DATA;

        iconMap = {};
        if (window.CONFIG && window.CONFIG.resources) {
            window.CONFIG.resources.forEach(r => iconMap[r.name] = r.icon);
        }

        init();

        const restoreSub = prevSubCode ? (window.COURSE_DATA || []).find(s => s.code === prevSubCode) : null;
        if (prevPage === 'weeks' && restoreSub) {
            currentSubjectView = prevSubView;
            showWeeks(restoreSub, false);
            return;
        }

        if (prevPage === 'content' && restoreSub && prevContentTitle) {
            currentSubjectView = prevSubView;
            currSub = restoreSub;
            const source = prevSubView === 'events' ? (restoreSub.events || []) : (restoreSub.weeks || []);
            const found = source.find(w => w.title === prevContentTitle) || null;
            if (found) {
                showContentByObj(found, false, prevContentFrom);
                return;
            }
            showWeeks(restoreSub, false);
            return;
        }

        if (prevPage === 'schedule') { showSchedule(false, 'home'); return; }
        if (prevPage === 'deadlines') { showDeadlines(false); return; }
        if (prevPage === 'midterm') { showMidterms(false, 'home'); return; }
        if (prevPage === 'useful-links') { showUsefulLinks(false, currentUsefulFilter, currentUsefulSubject); return; }
        if (prevPage === 'directory') { showDirectory(false); return; }
        if (prevPage === 'timetable') { showTimetable(false); return; }
        if (prevPage === 'gpa') { showGpa(false); return; }
        if (prevPage === 'updates') { showUpdates(false); return; }
        if (prevPage === 'recent') { showRecent(); return; }

        nav('home', false);
    });
