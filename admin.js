/* Academic Hub - admin.js (extracted from admin.html, Phase 1) */
    let cIdx = 0; let wIdx = 0; let eIdx = 0; let pIdx = 0; let schWIdx = 0; 
    let schedulePanelMode = 'weeks';
    let dlWIdx = -1;
    let dlTIdx = -1;
    let dragSrcIndex = null; 
    let viewMode = 'editor'; 
    let subViewMode = 'weeks'; 
    let adminScheduleSubjectFilter = new Set();
    let adminScheduleTypeFilter = new Set();
    let adminScheduleFiltersOpen = false;

    function getSubjectColorFallback(code) {
        const colors = { 'CA': '#ff9500', 'DSA': '#34c759', 'DB': '#007aff', 'OS': '#ff2d55', 'CN': '#af52de', 'AI': '#B388FF' };
        return colors[code] || '#e91e8c';
    }

    function getSubjectColor(code) { 
        if(window.COURSE_DATA) {
            const s = window.COURSE_DATA.find(x => x.code === code);
            if(s && s.color) return s.color;
        }
        return getSubjectColorFallback(code);
    }

    function escAttr(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function pDate(str) {
        if(!str) return null;
        try {
            const parts = str.trim().split(/\s+/); if(parts.length < 2) return null;
            const dParts = parts[0].split('/'); const tParts = parts[1].split(':'); const ampm = parts[2] ? parts[2].toUpperCase() : '';
            let h = parseInt(tParts[0], 10); const m = parseInt(tParts[1], 10);
            if(ampm === 'PM' && h < 12) h += 12; if(ampm === 'AM' && h === 12) h = 0;
            return new Date(dParts[2], dParts[1]-1, dParts[0], h, m);
        } catch(e) { return null; }
    }

    function pad2(v) { return String(v).padStart(2, '0'); }

    function formatLocalDateTimeValue(dateObj) {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
        return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}T${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`;
    }

    function getNowLocalDateTimeString() {
        return `${formatLocalDateTimeValue(new Date())}:00`;
    }

    function parseStoredDateTime(value) {
        if (!value || !String(value).trim()) return null;
        const txt = String(value).trim();

        const localIso = txt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (localIso) {
            return new Date(
                parseInt(localIso[1], 10),
                parseInt(localIso[2], 10) - 1,
                parseInt(localIso[3], 10),
                parseInt(localIso[4], 10),
                parseInt(localIso[5], 10),
                parseInt(localIso[6] || '0', 10)
            );
        }

        const d = new Date(txt);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function getPublishedAtInputValue(value) {
        const dt = parseStoredDateTime(value);
        return dt ? formatLocalDateTimeValue(dt) : '';
    }

    function setNewsPublishedAtFromInput(idx, inputValue) {
        if (typeof window.NEWS_DATA === 'undefined') window.NEWS_DATA = [];
        if (!window.NEWS_DATA[idx]) return;
        window.NEWS_DATA[idx].publishedAt = inputValue ? `${inputValue}:00` : '';
        markDirty();
    }

    function getNewsPcDeltaLabel(value) {
        const dt = parseStoredDateTime(value);
        if (!dt) return 'No publish time set.';
        const now = new Date();
        const diffMin = Math.round((dt.getTime() - now.getTime()) / 60000);
        const absMin = Math.abs(diffMin);
        if (absMin < 1) return 'Matches your PC time.';
        const dir = diffMin > 0 ? 'ahead of' : 'behind';
        if (absMin < 60) return `${absMin} minute${absMin === 1 ? '' : 's'} ${dir} your PC time.`;
        const hrs = Math.round((absMin / 60) * 10) / 10;
        return `${hrs} hour${hrs === 1 ? '' : 's'} ${dir} your PC time.`;
    }

    function syncNewsPublishedAtNow(idx) {
        if (!window.NEWS_DATA || !window.NEWS_DATA[idx]) return;
        window.NEWS_DATA[idx].publishedAt = getNowLocalDateTimeString();
        markDirty();
        renderAnnouncementsManager();
    }

    function inferScheduleTaskType(task) {
        const rawName = ((task && task.name) || '').trim();
        const lowerName = rawName.toLowerCase();
        const presets = (window.CONFIG && window.CONFIG.taskPresets) || [];

        for (const preset of presets) {
            const pName = (preset && preset.name) ? preset.name.trim() : '';
            if (!pName) continue;
            const pLower = pName.toLowerCase();
            if (lowerName === pLower || lowerName.startsWith(`${pLower} `) || lowerName.includes(pLower)) return pName;
        }

        return rawName || 'Other';
    }

    function getAdminSchedulePresetOptions() {
        return ((window.CONFIG && window.CONFIG.taskPresets) || [])
            .map(p => ({
                name: (p && p.name ? p.name.trim() : ''),
                icon: (p && p.icon ? p.icon : '📝')
            }))
            .filter(p => p.name);
    }

    function taskPassesAdminScheduleFilters(task) {
        const subOk = adminScheduleSubjectFilter.size === 0 || adminScheduleSubjectFilter.has(task.sub || '');
        const typeOk = adminScheduleTypeFilter.size === 0 || adminScheduleTypeFilter.has(inferScheduleTaskType(task));
        return subOk && typeOk;
    }

    function toggleAdminScheduleSubjectFilter(code) {
        if (!code) return;
        if (adminScheduleSubjectFilter.has(code)) adminScheduleSubjectFilter.delete(code);
        else adminScheduleSubjectFilter.add(code);
        refreshScheduleViews();
    }

    function toggleAdminScheduleTypeFilter(typeName) {
        if (!typeName) return;
        if (adminScheduleTypeFilter.has(typeName)) adminScheduleTypeFilter.delete(typeName);
        else adminScheduleTypeFilter.add(typeName);
        refreshScheduleViews();
    }

    function clearAdminScheduleFilters() {
        adminScheduleSubjectFilter.clear();
        adminScheduleTypeFilter.clear();
        refreshScheduleViews();
    }

    function toggleAdminScheduleFiltersPanel() {
        adminScheduleFiltersOpen = !adminScheduleFiltersOpen;
        renderScheduleWeeks();
    }

    function getCurrentScheduleWeekIndex() {
        return inferWeekIndexFromDate(new Date());
    }

    function renderAdminScheduleFilterBar() {
        const subjectCodes = (window.COURSE_DATA || []).map(s => s.code).filter(Boolean);
        const typeOptions = getAdminSchedulePresetOptions();
        const hasFilters = adminScheduleSubjectFilter.size > 0 || adminScheduleTypeFilter.size > 0;

        const subjectChips = subjectCodes.map(code => {
            const active = adminScheduleSubjectFilter.has(code);
            const color = getSubjectColor(code);
            return `<button class="btn" style="padding:4px 10px; border-radius:14px; font-size:0.72rem; background:${active ? `${color}22` : 'rgba(255,255,255,0.04)'}; border:1px solid ${active ? color : 'rgba(255,255,255,0.18)'}; color:${active ? color : '#999'};" onclick="toggleAdminScheduleSubjectFilter(decodeURIComponent('${encodeURIComponent(code)}'))">${escHtml(code)}</button>`;
        }).join('');

        const typeChips = typeOptions.map(tp => {
            const active = adminScheduleTypeFilter.has(tp.name);
            const label = `${tp.icon} ${tp.name}`;
            return `<button class="btn" style="padding:4px 10px; border-radius:14px; font-size:0.72rem; background:${active ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${active ? '#00E5FF' : 'rgba(255,255,255,0.18)'}; color:${active ? '#00E5FF' : '#999'};" onclick="toggleAdminScheduleTypeFilter(decodeURIComponent('${encodeURIComponent(tp.name)}'))">${escHtml(label)}</button>`;
        }).join('');

        const activeCount = adminScheduleSubjectFilter.size + adminScheduleTypeFilter.size;
        const arrow = adminScheduleFiltersOpen ? '▲' : '▼';

        return `
            <div style="padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <button class="btn" style="padding:5px 12px; border-radius:14px; font-size:0.74rem; background:${hasFilters ? 'rgba(233,30,140,0.12)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${hasFilters ? 'rgba(233,30,140,0.45)' : 'rgba(255,255,255,0.18)'}; color:${hasFilters ? '#e91e8c' : '#aaa'};" onclick="toggleAdminScheduleFiltersPanel()">Filters ${activeCount ? `(${activeCount})` : ''} ${arrow}</button>
                    ${hasFilters ? '<button class="btn" style="padding:3px 9px; font-size:0.68rem; border-radius:10px; border:1px dashed rgba(255,255,255,0.35); color:#ccc; background:transparent;" onclick="clearAdminScheduleFilters()">Clear All Filters</button>' : ''}
                </div>
                ${adminScheduleFiltersOpen ? `
                    <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;"><span style="font-size:0.66rem; color:#666; margin-right:2px;">Subjects:</span>${subjectChips || '<span style="font-size:0.72rem; color:#666;">No subjects</span>'}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;"><span style="font-size:0.66rem; color:#666; margin-right:2px;">Presets:</span>${typeChips || '<span style="font-size:0.72rem; color:#666;">No presets</span>'}</div>
                ` : ''}
            </div>`;
    }

    function init() {
        if(typeof window.COURSE_DATA === 'undefined') window.COURSE_DATA = [];
        if(typeof window.CONFIG === 'undefined') window.CONFIG = { resources: [], taskPresets: [] };
        if(typeof window.SUBJECT_DETAILS_DATA === 'undefined') window.SUBJECT_DETAILS_DATA = {};
        
        if(!window.CONFIG.taskPresets || window.CONFIG.taskPresets.length === 0) {
            window.CONFIG.taskPresets = [
                { name: "Quiz", icon: "🧠" }, { name: "Assignment", icon: "📝" }, { name: "Mini Project", icon: "🚀" },
                { name: "Report", icon: "📊" }, { name: "Lab Exam", icon: "🧪" }, { name: "Midterm", icon: "🎓" }, { name: "Final", icon: "🏁" }
            ];
        }

        if(typeof window.MIDTERM_DATA === 'undefined') {
            window.MIDTERM_DATA = [
                { dateLabel: 'Friday · 27 March', sub: 'DSA', examCode: 'CSE-XXX', time: '2:30 PM', note: '', coverage: '', where: '', whereLink: '' }
            ];
        }
        if(typeof window.FINAL_DATA === 'undefined') {
            window.FINAL_DATA = [];
        }
        if(typeof window.SCHEDULE_DATA === 'undefined') {
            window.SCHEDULE_DATA = [{ week: 1, tasks: [] }];
        }
        if(typeof window.STAFF_DATA === 'undefined') {
            window.STAFF_DATA = [];
        }
        if(typeof window.TIMETABLE_DATA === 'undefined') {
            window.TIMETABLE_DATA = {
                timeSlots: { normal:["8:00 - 9:50","10:00 - 11:50","12:30 - 2:20","2:30 - 4:20","4:30 - 6:20","6:30 - 8:20"], ramadan:["8:00 - 9:25","9:30 - 10:55","11:00 - 12:25","1:00 - 2:25","2:30 - 3:55","4:00 - 5:25"] },
                days: ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday"],
                subjects: ["Operating Systems","Computer Networks","Data Structures","Database Systems","Machine Learning","Artificial Intelligence","Computer Architecture","Quantum Computing","Robotics Engineering","Software Testing"],
                defaultSubjects: ["Operating Systems","Computer Networks","Data Structures","Database Systems","Machine Learning","Artificial Intelligence","Computer Architecture"],
                sections: {"1-2":[],"3-4":[]}
            };
        }

        if(!window.CONFIG.resources || window.CONFIG.resources.length === 0) {
            window.CONFIG.resources = [ { name: "Lecture", icon: "▶️", defaultDesc: "" }, { name: "Notes", icon: "💡", defaultDesc: "" }, { name: "Lab", icon: "🧪", defaultDesc: "" } ];
        }
        if(typeof window.NEWS_DATA === 'undefined') window.NEWS_DATA = [];

        window.COURSE_DATA.forEach(sub => {
            if(!sub.weeks) sub.weeks = [];
            if(!sub.events) sub.events = [];
            if(!sub.playlists) sub.playlists = [];
            if (!window.SUBJECT_DETAILS_DATA[sub.code] || typeof window.SUBJECT_DETAILS_DATA[sub.code] !== 'object') {
                window.SUBJECT_DETAILS_DATA[sub.code] = { gradeDistribution: '', examTypes: '', generalNotes: '' };
            }
            if (typeof window.SUBJECT_DETAILS_DATA[sub.code].gradeDistribution !== 'string') window.SUBJECT_DETAILS_DATA[sub.code].gradeDistribution = '';
            if (typeof window.SUBJECT_DETAILS_DATA[sub.code].examTypes !== 'string') window.SUBJECT_DETAILS_DATA[sub.code].examTypes = '';
            if (typeof window.SUBJECT_DETAILS_DATA[sub.code].generalNotes !== 'string') window.SUBJECT_DETAILS_DATA[sub.code].generalNotes = '';
            
            const lists = [sub.weeks, sub.events];
            lists.forEach(list => {
                list.forEach(item => {
                    if(!item.resources) item.resources = {};
                    window.CONFIG.resources.forEach(conf => {
                        if(!item.resources[conf.name]) { 
                            item.resources[conf.name] = { vis:false, link:"#", desc:conf.defaultDesc, isNew:false, isRecent:false, recentDate:"" }; 
                        }
                    });
                });
            });
        });

        renderSubjects();
        exitView(); // default to subjects view so panel is visible on load
    }

    // Help box builder — call this at the top of any render function
    function makeHelpBox(id, text) {
        const stored = localStorage.getItem('help_dismissed_' + id);
        if (stored === '1') {
            return `<div style="text-align:right; margin-bottom:8px;"><button onclick="localStorage.removeItem('help_dismissed_${id}'); renderCurrentView();" style="background:none;border:none;color:#444;font-size:0.72rem;cursor:pointer;">ℹ Show help</button></div>`;
        }
        return `<div style="background:rgba(74,144,226,0.08); border:1px solid rgba(74,144,226,0.25); border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:0.82rem; color:#9aa2b3; line-height:1.55; display:flex; gap:10px; align-items:flex-start;">
            <span style="font-size:1.1rem; flex-shrink:0;">ℹ</span>
            <span style="flex:1;">${text}</span>
            <button onclick="localStorage.setItem('help_dismissed_${id}','1'); this.closest('div').remove();" style="background:none;border:none;color:#555;font-size:1rem;cursor:pointer;flex-shrink:0;padding:0 2px;" title="Dismiss">✕</button>
        </div>`;
    }

    function renderCurrentView() {
        const v = document.body.dataset.view || '';
        if (v === 'schedule') { renderScheduleWeeks(); renderScheduleEditor(); }
        else if (v === 'midterms') renderMidtermsManager();
        else if (v === 'usefullinks') renderUsefulLinksManager();
        else if (v === 'staff') renderStaffManager();
        else if (v === 'timetable') renderTimetableManager();
        else if (v === 'updates') renderAnnouncementsManager();
        else if (v === 'config') renderConfigEditor();
    }

    function toggleSidebar() {
        const sb = document.querySelector('.sidebar');
        const bd = document.getElementById('sidebar-backdrop');
        const isOpen = sb.classList.contains('open');
        if (isOpen) { sb.classList.remove('open'); bd.classList.remove('open'); }
        else { sb.classList.add('open'); bd.classList.add('open'); }
    }

    function closeSidebar() {
        document.querySelector('.sidebar').classList.remove('open');
        document.getElementById('sidebar-backdrop').classList.remove('open');
    }

    function toggleConfig() { setView('config'); renderConfigEditor(); closeSidebar(); }
    function toggleSchedule() { setView('schedule'); schedulePanelMode = 'weeks'; renderScheduleWeeks(); renderScheduleEditor(); closeSidebar(); }
    function toggleScheduleDeadlines() { setView('schedule'); schedulePanelMode = 'deadlines'; renderScheduleWeeks(); renderDeadlineEditor(); closeSidebar(); }
    function toggleMidterms() { setView('midterms'); renderMidtermsManager(); closeSidebar(); }
    function toggleUsefulLinks() { setView('usefullinks'); renderUsefulLinksManager(); closeSidebar(); }
    function toggleSubjectsTab() { exitView(); closeSidebar(); }
    function exitView() { setView('editor'); renderSubjects(); renderMiddleColumn(); renderEditor(); }

    function setView(mode) {
        viewMode = mode;
        document.body.dataset.view = mode;
        const mid = document.getElementById('middle-col');
        const subjectsPanel = document.getElementById('subjects-panel');

        // Show subjects panel only when editing subject content
        subjectsPanel.style.display = mode === 'editor' ? 'flex' : 'none';

        // Highlight active nav item
        const navMap = {
            editor: 'nav-subjects',
            schedule: 'nav-schedule',
            usefullinks: 'nav-useful',
            midterms: 'nav-midterms',
            staff: 'nav-staff',
            timetable: 'nav-timetable',
            updates: 'nav-announcements',
            config: 'nav-config',
        };
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
        const activeId = navMap[mode];
        if (activeId) {
            const activeEl = document.getElementById(activeId);
            if (activeEl) activeEl.classList.add('active');
        }

        if (mode === 'editor' || mode === 'schedule' || mode === 'usefullinks' || mode === 'timetable') {
            mid.style.display = 'flex';
        } else {
            mid.style.display = 'none';
        }
    }

    // --- NORMAL EDITOR (SUBJECTS & TABS) ---
    function renderSubjects() {
        const list = document.getElementById('subject-list');
        list.innerHTML = '';
        window.COURSE_DATA.forEach((sub, i) => {
            const el = document.createElement('div');
            el.className = `list-item ${i === cIdx && viewMode==='editor' ? 'active' : ''}`;
            el.draggable = true;
            el.addEventListener('dragstart', (e) => handleDragStart(e, i, 'sub'));
            el.addEventListener('dragover', handleDragOver);
            el.addEventListener('drop', (e) => handleDrop(e, i, 'sub'));
            
            el.innerHTML = `
                <span class="drag-handle">☰</span>
                <div style="flex:1">${sub.code || 'New'}</div>
                <button class="btn-move" onclick="moveItem(event, 'sub', ${i}, -1)">▲</button>
                <button class="btn-move" onclick="moveItem(event, 'sub', ${i}, 1)">▼</button>
                <button class="btn btn-del" onclick="delSubject(event, ${i})">✕</button>
            `;
            el.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { cIdx = i; wIdx = 0; eIdx = 0; pIdx = 0; exitView(); } };
            list.appendChild(el);
        });
        if(window.COURSE_DATA.length > 0 && viewMode === 'editor') renderMiddleColumn();
    }

    function renderMiddleColumn() {
        const mid = document.getElementById('middle-col');
        const sub = window.COURSE_DATA[cIdx];
        if(!sub) return;

        let bulkToolbar = '';

        if (subViewMode === 'weeks' || subViewMode === 'events') {
            bulkToolbar = '';
        }

        mid.innerHTML = `
            <div class="panel-header" style="padding:10px;">
                <select class="view-select" onchange="subViewMode=this.value; wIdx=0; eIdx=0; pIdx=0; renderMiddleColumn(); renderEditor();">
                    <option value="subject" ${subViewMode==='subject'?'selected':''}>📋 SUBJECT DETAILS</option>
                    <option value="details" ${subViewMode==='details'?'selected':''}>📚 SUBJECT CONTENT DETAILS</option>
                    <option value="weeks" ${subViewMode==='weeks'?'selected':''}>📚 WEEKS</option>
                    <option value="events" ${subViewMode==='events'?'selected':''}>🎯 EXAM MATERIALS</option>
                </select>
            </div>
            ${bulkToolbar}
            <div id="middle-list-container" class="list-container"></div>
            <div id="middle-btn-container"></div>
        `;

        const listContainer = document.getElementById('middle-list-container');
        const btnContainer = document.getElementById('middle-btn-container');

        if (subViewMode === 'subject') {
            // No list needed for subject details view
            listContainer.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px; padding:10px;">Subject basic info is shown in the editor panel →</div>';
            btnContainer.innerHTML = '';
        }
        else if (subViewMode === 'details') {
            listContainer.innerHTML = '<div style="text-align:center; color:#888; margin-top:20px; padding:10px;">Subject content details are shown in the editor panel →</div>';
            btnContainer.innerHTML = '';
        }
        else if (subViewMode === 'weeks') {
            sub.weeks.forEach((wk, i) => {
                const el = document.createElement('div');
                el.className = `list-item ${i === wIdx ? 'active' : ''}`;
                el.draggable = true;
                el.addEventListener('dragstart', (e) => handleDragStart(e, i, 'week'));
                el.addEventListener('dragover', handleDragOver);
                el.addEventListener('drop', (e) => handleDrop(e, i, 'week'));
                el.innerHTML = `<span class="drag-handle">☰</span><div style="flex:1">${wk.title}</div><button class="btn-move" onclick="moveItem(event, 'week', ${i}, -1)">▲</button><button class="btn-move" onclick="moveItem(event, 'week', ${i}, 1)">▼</button><button class="btn btn-del" onclick="delMiddleItem(event, 'week', ${i})">✕</button>`;
                el.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { wIdx = i; renderMiddleColumn(); renderEditor(); } };
                listContainer.appendChild(el);
            });
            btnContainer.innerHTML = `<button class="btn btn-add" style="width:calc(100% - 16px); border-radius:6px; margin:6px 8px;" onclick="addMiddleItem('week')">＋ Add Week</button>`;
        } 
        else if (subViewMode === 'events') {
            sub.events.forEach((ev, i) => {
                const el = document.createElement('div');
                el.className = `list-item ${i === eIdx ? 'active' : ''}`;
                el.draggable = true;
                el.addEventListener('dragstart', (e) => handleDragStart(e, i, 'event'));
                el.addEventListener('dragover', handleDragOver);
                el.addEventListener('drop', (e) => handleDrop(e, i, 'event'));
                el.innerHTML = `<span class="drag-handle">☰</span><div style="flex:1">${ev.title}</div><button class="btn-move" onclick="moveItem(event, 'event', ${i}, -1)">▲</button><button class="btn-move" onclick="moveItem(event, 'event', ${i}, 1)">▼</button><button class="btn btn-del" onclick="delMiddleItem(event, 'event', ${i})">✕</button>`;
                el.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { eIdx = i; renderMiddleColumn(); renderEditor(); } };
                listContainer.appendChild(el);
            });
            btnContainer.innerHTML = `<button class="btn btn-add" style="width:calc(100% - 16px); border-radius:6px; margin:6px 8px;" onclick="addMiddleItem('event')">＋ Add Event Material</button>`;
        }
        else if (subViewMode === 'playlists') {
            let lastGroup = null;
            sub.playlists.forEach((pl, i) => {
                const group = (pl.group || '').trim();
                if (group && group !== lastGroup) {
                    const groupHeader = document.createElement('div');
                    groupHeader.style.cssText = 'padding:8px 12px; font-size:0.78rem; color:#4a90e2; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-top:1px solid rgba(74,144,226,0.25); margin-top:8px; display:flex; align-items:center; gap:6px;';
                    const groupCount = sub.playlists.filter(p => (p.group||'').trim() === group).length;
                    groupHeader.innerHTML = `📁 ${group} <span style="font-size:0.65rem; color:#888; font-weight:normal; text-transform:none;">(${groupCount})</span>`;
                    listContainer.appendChild(groupHeader);
                }
                lastGroup = group;
                const el = document.createElement('div');
                el.className = `list-item ${i === pIdx ? 'active' : ''}`;
                el.draggable = true;
                el.addEventListener('dragstart', (e) => handleDragStart(e, i, 'playlist'));
                el.addEventListener('dragover', handleDragOver);
                el.addEventListener('drop', (e) => handleDrop(e, i, 'playlist'));
                const plBadges = pl.badges || (pl.badgeText ? [{text:pl.badgeText, color:pl.badgeColor||'#e91e8c'}] : []);
                const badgePills = plBadges.filter(b=>b.text).map(b => `<span style="background:${b.color||'#e91e8c'}; color:#fff; font-size:0.55rem; padding:1px 5px; border-radius:4px; font-weight:700; white-space:nowrap;">${b.text}</span>`).join('');
                const groupTag = group ? `<span style="font-size:0.55rem; color:#4a90e2; border:1px solid rgba(74,144,226,0.3); padding:1px 5px; border-radius:4px; white-space:nowrap;">📁 ${group}</span>` : '';
                el.innerHTML = `<span class="drag-handle">☰</span><span style="font-size:1rem;">${pl.icon || '🔗'}</span><div style="flex:1; min-width:0;"><div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pl.title || 'Link'}</div><div style="display:flex; gap:3px; flex-wrap:wrap; margin-top:2px;">${badgePills}${groupTag}</div></div><button class="btn-move" onclick="moveItem(event, 'playlist', ${i}, -1)">▲</button><button class="btn-move" onclick="moveItem(event, 'playlist', ${i}, 1)">▼</button><button class="btn btn-del" onclick="delMiddleItem(event, 'playlist', ${i})">✕</button>`;
                el.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { pIdx = i; renderMiddleColumn(); renderEditor(); } };
                listContainer.appendChild(el);
            });
            btnContainer.innerHTML = `<button class="btn btn-add" onclick="addMiddleItem('playlist')">+ Add Useful Link</button>`;
        }
    }

    function addMiddleItem(type) {
        if(type === 'week') { window.COURSE_DATA[cIdx].weeks.push({title:`WEEK ${window.COURSE_DATA[cIdx].weeks.length+1}`, resources:{}}); wIdx=window.COURSE_DATA[cIdx].weeks.length-1; }
        else if(type === 'event') { window.COURSE_DATA[cIdx].events.push({title:`Quiz ${window.COURSE_DATA[cIdx].events.length+1}`, resources:{}}); eIdx=window.COURSE_DATA[cIdx].events.length-1; }
        else if(type === 'playlist') { window.COURSE_DATA[cIdx].playlists.push({title:`New Link`, link:"#", icon:"🔗", note:"", badges:[]}); pIdx=window.COURSE_DATA[cIdx].playlists.length-1; }
        renderMiddleColumn(); renderEditor();
    }
    
    function delMiddleItem(e, type, i) {
        e.stopPropagation();
        if(confirm("Delete this item?")) {
            if(type === 'week') { window.COURSE_DATA[cIdx].weeks.splice(i,1); wIdx=0; }
            else if(type === 'event') { window.COURSE_DATA[cIdx].events.splice(i,1); eIdx=0; }
            else if(type === 'playlist') { window.COURSE_DATA[cIdx].playlists.splice(i,1); pIdx=0; }
            renderMiddleColumn(); renderEditor();
        }
    }

    function renderEditor() {
        if(viewMode !== 'editor') return;
        const container = document.getElementById('editor-area');
        if(!window.COURSE_DATA[cIdx]) { container.innerHTML = ''; return; }
        const sub = window.COURSE_DATA[cIdx];
        const mainEl = document.querySelector('.main');
        const savedScroll = mainEl ? mainEl.scrollTop : 0;
        
        let html = '';

        if (subViewMode === 'subject') {
            // Subject basic info
            html += `
            <div class="form-section">
                <h3>Subject Basic Info</h3>
                <div style="display:grid; grid-template-columns: 1fr 3fr; gap:10px;">
                    <div><label>Code</label><input type="text" value="${sub.code}" oninput="setSubjectCode(this.value)" onblur="renderSubjects()"></div>
                    <div><label>Name</label><input type="text" value="${sub.name}" oninput="updateData('sub', 'name', this.value)"></div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr 2fr; gap:10px; margin-top:10px;">
                    <div><label>Subject Code</label><input type="text" placeholder="e.g. CSE331S" value="${sub.subCode || ''}" oninput="updateData('sub', 'subCode', this.value)"></div>
                    <div><label>Credits</label><input type="text" value="${sub.credits}" oninput="updateData('sub', 'credits', this.value)"></div>
                    <div><label>Semester</label><input type="text" value="${sub.semester}" oninput="updateData('sub', 'semester', this.value)"></div>
                    <div><label>Color</label><input type="color" value="${sub.color || getSubjectColorFallback(sub.code)}" oninput="updateData('sub', 'color', this.value)"></div>
                    <div><label>Drive Link</label><input type="text" placeholder="https://drive..." value="${sub.driveLink || ''}" oninput="updateData('sub', 'driveLink', this.value)"></div>
                </div>
            </div>`;
            container.innerHTML = html;
            if (mainEl) requestAnimationFrame(() => { mainEl.scrollTop = savedScroll; });
            return;
        }

        if (subViewMode === 'details') {
            const details = getSubjectDetailsEntry(sub.code);
            html += `
            <div class="form-section">
                <h3>Subject Content Details</h3>
                <label>Grade Distribution</label>
                <textarea rows="4" placeholder="e.g. Midterm 25%, Final 35%, Assignments 20%, Labs 20%" oninput="window.SUBJECT_DETAILS_DATA['${sub.code}'].gradeDistribution=this.value; markDirty();">${details.gradeDistribution || ''}</textarea>
                <label>Exam Types</label>
                <textarea rows="4" placeholder="e.g. MCQ + Problem Solving, closed-book final" oninput="window.SUBJECT_DETAILS_DATA['${sub.code}'].examTypes=this.value; markDirty();">${details.examTypes || ''}</textarea>
                <label>General Notes</label>
                <textarea rows="6" placeholder="Any subject-specific notes for students..." oninput="window.SUBJECT_DETAILS_DATA['${sub.code}'].generalNotes=this.value; markDirty();">${details.generalNotes || ''}</textarea>
            </div>`;
            container.innerHTML = html;
            if (mainEl) requestAnimationFrame(() => { mainEl.scrollTop = savedScroll; });
            return;
        }

        if (subViewMode === 'weeks' || subViewMode === 'events') {
            const isEvent = subViewMode === 'events';
            const item = isEvent ? sub.events[eIdx] : sub.weeks[wIdx];
            
            if(item) {
                html += `
                <div class="form-section">
                    <h3 style="color:${isEvent ? 'var(--accent-blue)' : 'var(--accent-pink)'}">${isEvent ? 'Event Details' : 'Week Details'}</h3>
                    <label>Title</label><input type="text" value="${item.title}" oninput="updateData('${subViewMode}', 'title', this.value)" onblur="renderMiddleColumn()">
                    
                    <div class="checkbox-row" style="background:#150a25; padding:10px; border-radius:8px;">
                        <label class="checkbox-label"><input type="checkbox" ${item.locked ? 'checked' : ''} onchange="updateData('${subViewMode}', 'locked', this.checked)"> Locked</label>
                    </div>

                    <div style="background:#150a25; padding:10px; border-radius:8px; margin-top:10px;">
                        <div class="checkbox-row">
                            <label class="checkbox-label" style="font-weight:bold; color:var(--accent);">Custom Badge (Top Right):</label>
                            <label class="checkbox-label"><input type="checkbox" ${item.showBadge ? 'checked' : ''} onchange="updateData('${subViewMode}', 'showBadge', this.checked)"> Enable</label>
                        </div>
                        <div style="display:grid; grid-template-columns: 3fr 1fr; gap:10px;">
                            <input type="text" placeholder="Text (e.g. Midterm)" value="${item.badgeText || ''}" oninput="updateData('${subViewMode}', 'badgeText', this.value)">
                            <input type="color" value="${item.badgeColor || '#e91e8c'}" oninput="updateData('${subViewMode}', 'badgeColor', this.value)">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; padding-bottom:10px; margin-bottom:15px;">
                        <h3 style="border:none; margin:0; padding:0;">Resources</h3>
                    </div>
                    <div id="res-list-container"></div>
                </div>`;
                container.innerHTML = html;
                renderResources(item);
                if (mainEl) requestAnimationFrame(() => { mainEl.scrollTop = savedScroll; });
            } else {
                container.innerHTML = html + `<p style="text-align:center;">No ${subViewMode} found.</p>`;
                if (mainEl) requestAnimationFrame(() => { mainEl.scrollTop = savedScroll; });
            }
        } 
        else if (subViewMode === 'playlists') {
            const p = sub.playlists[pIdx];
            if(p) {
                html += `
                <div class="form-section" style="border-color:#4a90e2;">
                    <h3 style="color:#4a90e2;">Link Details</h3>
                    <div style="display:grid; grid-template-columns: 60px 1fr; gap:10px;">
                        <div><label>Icon</label><div style="position:relative;"><input type="text" style="text-align:center;" value="${p.icon || '🔗'}" oninput="updateData('playlists', 'icon', this.value); renderMiddleColumn()" onfocus="showEmojiPicker(this)"><div class="emoji-picker-dropdown" style="display:none;"></div></div></div>
                        <div><label>Title</label><input type="text" value="${p.title || ''}" oninput="updateData('playlists', 'title', this.value); renderMiddleColumn()"></div>
                    </div>
                    <label>Link (URL)</label><input type="text" placeholder="https://..." value="${p.link || ''}" oninput="updateData('playlists', 'link', this.value)">
                    <label>Group <span style="font-size:0.75rem; color:#888; font-weight:normal;">(playlists with the same group name appear together)</span></label><input type="text" placeholder="e.g. Dr. Manal Morad" value="${p.group || ''}" oninput="updateData('playlists', 'group', this.value); renderMiddleColumn()">
                    <label>Description / Note</label><textarea rows="2" placeholder="Notes about this link..." oninput="updateData('playlists', 'note', this.value)">${p.note || ''}</textarea>
                    
                    <div style="background:#150a25; padding:10px; border-radius:8px; margin-top:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <label style="font-weight:bold; color:var(--accent);">Badges:</label>
                            <button class="btn btn-add" style="font-size:0.75rem; padding:3px 10px;" onclick="addPlaylistBadge()">+ Badge</button>
                        </div>
                        <div id="playlist-badges-list" style="margin-top:8px;"></div>
                    </div>`;
                container.innerHTML = html;
                renderPlaylistBadges();
                if (mainEl) requestAnimationFrame(() => { mainEl.scrollTop = savedScroll; });
                return;
            } else {
                container.innerHTML = html + `<p style="text-align:center;">No useful links found.</p>`;
                if (mainEl) requestAnimationFrame(() => { mainEl.scrollTop = savedScroll; });
            }
        }
    }

    function getPlaylistBadges(p) {
        if (p.badges && p.badges.length > 0) return p.badges;
        if (p.badgeText) return [{text: p.badgeText, color: p.badgeColor || '#e91e8c'}];
        return [];
    }

    function renderPlaylistBadges() {
        const container = document.getElementById('playlist-badges-list');
        if (!container) return;
        const p = window.COURSE_DATA[cIdx].playlists[pIdx];
        if (!p) return;
        if (!p.badges) p.badges = getPlaylistBadges(p);
        delete p.badgeText; delete p.badgeColor;
        container.innerHTML = '';
        p.badges.forEach((b, i) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid; grid-template-columns:1fr 50px 30px; gap:6px; margin-bottom:5px; align-items:center;';
            row.innerHTML = `<input type="text" value="${b.text||''}" placeholder="Badge text" oninput="window.COURSE_DATA[${cIdx}].playlists[${pIdx}].badges[${i}].text=this.value; renderMiddleColumn()">
                <input type="color" value="${b.color||'#e91e8c'}" oninput="window.COURSE_DATA[${cIdx}].playlists[${pIdx}].badges[${i}].color=this.value; renderMiddleColumn()" style="height:32px;cursor:pointer;">
                <button class="btn btn-del" style="padding:2px 6px;font-size:0.8rem;" onclick="window.COURSE_DATA[${cIdx}].playlists[${pIdx}].badges.splice(${i},1); renderPlaylistBadges(); renderMiddleColumn()">✕</button>`;
            container.appendChild(row);
        });
        if (p.badges.length === 0) {
            container.innerHTML = '<div style="color:#666; font-size:0.8rem; font-style:italic;">No badges. Click + Badge to add one.</div>';
        }
    }

    function addPlaylistBadge() {
        const p = window.COURSE_DATA[cIdx].playlists[pIdx];
        if (!p) return;
        if (!p.badges) p.badges = getPlaylistBadges(p);
        delete p.badgeText; delete p.badgeColor;
        p.badges.push({text: '', color: '#e91e8c'});
        renderPlaylistBadges();
        renderMiddleColumn();
    }

    function renderResources(itemObj) {
        const container = document.getElementById('res-list-container');
        const sub = window.COURSE_DATA[cIdx];
        
        // Count how many times each resource is used (vis:true) in this subject's weeks
        const usageCount = {};
        window.CONFIG.resources.forEach(conf => { usageCount[conf.name] = 0; });
        const allItems = [...(sub.weeks || []), ...(sub.events || [])];
        allItems.forEach(item => {
            if(item.resources) {
                Object.keys(item.resources).forEach(k => {
                    if(item.resources[k] && item.resources[k].vis) {
                        usageCount[k] = (usageCount[k] || 0) + 1;
                    }
                });
            }
        });

        // Sort: frequently used in this subject first, then by global order
        const sortedResources = [...window.CONFIG.resources].sort((a, b) => {
            const aUsed = usageCount[a.name] > 0 ? 1 : 0;
            const bUsed = usageCount[b.name] > 0 ? 1 : 0;
            if(aUsed !== bUsed) return bUsed - aUsed; // used ones first
            // Among used ones, sort by global order (original index)
            const aGlobal = window.CONFIG.resources.indexOf(a);
            const bGlobal = window.CONFIG.resources.indexOf(b);
            return aGlobal - bGlobal;
        });

        sortedResources.forEach((conf, i) => {
            const key = conf.name;
            if(!itemObj.resources[key]) itemObj.resources[key] = { vis:false, link:"#", desc:conf.defaultDesc, isNew:false, isRecent:false };
            const val = itemObj.resources[key];

            const el = document.createElement('div');
            el.className = 'res-item';
            el.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <div style="font-size:1.5rem;">${conf.icon}</div>
                </div>
                <div class="res-content">
                    <div class="res-header">
                        <strong>${key}</strong>
                        <div class="checkbox-row" style="margin:0; gap:10px;">
                            <label class="checkbox-label"><input type="checkbox" ${val.vis ? 'checked' : ''} onchange="updateRes('${key}', 'vis', this.checked)"> Show</label>
                        </div>
                    </div>
                    <input type="text" placeholder="Link/File..." value="${val.link}" oninput="updateRes('${key}', 'link', this.value)">
                    <textarea rows="2" placeholder="Notes..." oninput="updateRes('${key}', 'desc', this.value)">${val.desc}</textarea>
                </div>
            `;
            container.appendChild(el);
        });
    }

    function updateData(scope, field, val) {
        if(scope === 'sub') window.COURSE_DATA[cIdx][field] = val;
        else if(scope === 'weeks') window.COURSE_DATA[cIdx].weeks[wIdx][field] = val;
        else if(scope === 'events') window.COURSE_DATA[cIdx].events[eIdx][field] = val;
        else if(scope === 'playlists') window.COURSE_DATA[cIdx].playlists[pIdx][field] = val;
    }

    function getSubjectDetailsEntry(code) {
        if(typeof window.SUBJECT_DETAILS_DATA === 'undefined' || !window.SUBJECT_DETAILS_DATA) window.SUBJECT_DETAILS_DATA = {};
        if(!window.SUBJECT_DETAILS_DATA[code] || typeof window.SUBJECT_DETAILS_DATA[code] !== 'object') {
            window.SUBJECT_DETAILS_DATA[code] = { gradeDistribution: '', examTypes: '', generalNotes: '' };
        }
        if (typeof window.SUBJECT_DETAILS_DATA[code].gradeDistribution !== 'string') window.SUBJECT_DETAILS_DATA[code].gradeDistribution = '';
        if (typeof window.SUBJECT_DETAILS_DATA[code].examTypes !== 'string') window.SUBJECT_DETAILS_DATA[code].examTypes = '';
        if (typeof window.SUBJECT_DETAILS_DATA[code].generalNotes !== 'string') window.SUBJECT_DETAILS_DATA[code].generalNotes = '';
        return window.SUBJECT_DETAILS_DATA[code];
    }

    function setSubjectCode(newCode) {
        const oldCode = window.COURSE_DATA[cIdx].code;
        updateData('sub', 'code', newCode);
        if (oldCode !== newCode && window.SUBJECT_DETAILS_DATA) {
            const existing = window.SUBJECT_DETAILS_DATA[oldCode];
            if (existing && !window.SUBJECT_DETAILS_DATA[newCode]) {
                window.SUBJECT_DETAILS_DATA[newCode] = existing;
                delete window.SUBJECT_DETAILS_DATA[oldCode];
            } else if (!window.SUBJECT_DETAILS_DATA[newCode]) {
                window.SUBJECT_DETAILS_DATA[newCode] = { gradeDistribution: '', examTypes: '', generalNotes: '' };
            }
        }
        markDirty();
    }
    
    function updateRes(key, field, val) {
        const item = subViewMode === 'events' ? window.COURSE_DATA[cIdx].events[eIdx] : window.COURSE_DATA[cIdx].weeks[wIdx];
        item.resources[key][field] = val;
        // Auto-show resource when a real link is entered
        if (field === 'link' && val && val.trim() !== '' && val.trim() !== '#') {
            if (!item.resources[key].vis) {
                item.resources[key].vis = true;
                renderEditor(); // refresh so Show checkbox reflects new state
            }
        }
    }

    function moveItem(e, type, idx, dir) {
        e.stopPropagation(); let arr;
        if(type === 'sub') arr = window.COURSE_DATA; 
        else if(type === 'week') arr = window.COURSE_DATA[cIdx].weeks;
        else if(type === 'event') arr = window.COURSE_DATA[cIdx].events;
        else if(type === 'playlist') arr = window.COURSE_DATA[cIdx].playlists;
        if(idx + dir < 0 || idx + dir >= arr.length) return;
        [arr[idx], arr[idx+dir]] = [arr[idx+dir], arr[idx]];
        if(type === 'sub' && cIdx === idx) cIdx += dir; 
        else if(type === 'week' && wIdx === idx) wIdx += dir;
        else if(type === 'event' && eIdx === idx) eIdx += dir;
        else if(type === 'playlist' && pIdx === idx) pIdx += dir;
        if(type==='sub') renderSubjects(); else renderMiddleColumn();
    }

    function handleDragStart(e, idx, type) { dragSrcIndex = idx; e.dataTransfer.setData('type', type); }
    function handleDragOver(e) { e.preventDefault(); }
    function handleDrop(e, dropIndex, type) {
        e.stopPropagation();
        const srcType = e.dataTransfer.getData('type');
        if(srcType !== type || dragSrcIndex === dropIndex) return;
        let arr;
        if(type === 'sub') { arr = window.COURSE_DATA; if(cIdx === dragSrcIndex) cIdx = dropIndex; }
        else if(type === 'week') { arr = window.COURSE_DATA[cIdx].weeks; if(wIdx === dragSrcIndex) wIdx = dropIndex; }
        else if(type === 'event') { arr = window.COURSE_DATA[cIdx].events; if(eIdx === dragSrcIndex) eIdx = dropIndex; }
        else if(type === 'playlist') { arr = window.COURSE_DATA[cIdx].playlists; if(pIdx === dragSrcIndex) pIdx = dropIndex; }
        else if(type === 'config') { arr = window.CONFIG.resources; }
        else if(type === 'configTask') { arr = window.CONFIG.taskPresets; }
        const item = arr.splice(dragSrcIndex, 1)[0];
        arr.splice(dropIndex, 0, item);
        if(type === 'sub') renderSubjects(); 
        else if(['week','event','playlist'].includes(type)) renderMiddleColumn(); 
        else renderConfigEditor();
    }
    
    function bulkResGlobal(f, v) {
        const list = subViewMode === 'events' ? window.COURSE_DATA[cIdx].events : window.COURSE_DATA[cIdx].weeks;
        list.forEach(item => {
            window.CONFIG.resources.forEach(c => { if(item.resources[c.name]) item.resources[c.name][f] = v; });
        });
        renderEditor();
    }

    // --- SCHEDULE EDITOR ---
    function createEmptyScheduleTask(defaultSubCode) {
        return {
            sub: defaultSubCode || (window.COURSE_DATA.length > 0 ? window.COURSE_DATA[0].code : 'UNK'),
            name: 'New Task',
            icon: '📝',
            when: '',
            where: '',
            coverage: '',
            note: '',
            noteLink: '',
            noteNote: '',
            whenLink: '',
            whereLink: '',
            whenNote: '',
            whereNote: '',
            coverageLink: '',
            coverageNote: '',
            submitText: '',
            submitLink: '',
            submitNote: '',
            deadlineDate: '',
            deadlineEndDate: '',
            isCompleted: false
        };
    }

    function parseAdminDeadlineDate(raw) {
        if (!raw || !raw.trim()) return null;
        const txt = raw.trim();
        const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10), 23, 59);
        const dm = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/i);
        if (!dm) return null;
        let hour = 23;
        let min = 59;
        if (dm[4] && dm[5]) {
            hour = parseInt(dm[4], 10);
            min = parseInt(dm[5], 10);
            const ampm = (dm[6] || '').toUpperCase();
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
        }
        return new Date(parseInt(dm[3], 10), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10), hour, min);
    }

    function normalizeAdminDeadlineDate(raw) {
        if (!raw || !raw.trim()) return '';
        const txt = raw.trim();
        const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return `${iso[3]}/${iso[2]}/${iso[1]} 11:59 PM`;
        const dmNoTime = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmNoTime) return `${dmNoTime[1].padStart(2,'0')}/${dmNoTime[2].padStart(2,'0')}/${dmNoTime[3]} 11:59 PM`;
        return txt;
    }

    function inferWeekIndexFromDate(dateObj) {
        if (!dateObj || !window.SCHEDULE_DATA || window.SCHEDULE_DATA.length === 0) return -1;

        for (let i = 0; i < window.SCHEDULE_DATA.length; i++) {
            const wk = window.SCHEDULE_DATA[i] || {};
            if (!wk.dateStart || !wk.dateEnd) continue;
            const s = new Date(`${wk.dateStart}T00:00:00`);
            const e = new Date(`${wk.dateEnd}T23:59:59`);
            if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && dateObj >= s && dateObj <= e) return i;
        }

        const startSource = (window.CONFIG && window.CONFIG.semesterStart) ? window.CONFIG.semesterStart : '2026-02-07';
        const semStart = new Date(`${startSource}T00:00:00`);
        if (!Number.isNaN(semStart.getTime())) {
            const diffDays = Math.floor((dateObj - semStart) / 86400000);
            if (diffDays >= 0) {
                const expectedWeek = Math.floor(diffDays / 7) + 1;
                const idx = window.SCHEDULE_DATA.findIndex(wk => Number(wk.week) === expectedWeek);
                if (idx !== -1) return idx;
            }
        }

        return window.SCHEDULE_DATA.length > 0 ? 0 : -1;
    }

    function collectScheduleDeadlineEntries() {
        const now = Date.now();
        const out = [];
        window.SCHEDULE_DATA.forEach((wk, weekIdx) => {
            (wk.tasks || []).forEach((task, taskIdx) => {
                if (!task.deadlineDate || !task.deadlineDate.trim()) return;
                if (!taskPassesAdminScheduleFilters(task)) return;
                const endStr = (task.deadlineEndDate && task.deadlineEndDate.trim()) ? task.deadlineEndDate : task.deadlineDate;
                const endDate = pDate(endStr) || parseAdminDeadlineDate(endStr);
                const endTs = endDate ? endDate.getTime() : NaN;
                out.push({
                    weekIdx,
                    taskIdx,
                    week: wk,
                    task,
                    endTs,
                    validDate: Number.isFinite(endTs),
                    upcoming: Number.isFinite(endTs) ? endTs >= now : false,
                    completed: !!task.isCompleted
                });
            });
        });

        const bucket = item => {
            if (item.completed) return 3;
            if (!item.validDate) return 2;
            return item.upcoming ? 0 : 1;
        };

        out.sort((a, b) => {
            const ba = bucket(a), bb = bucket(b);
            if (ba !== bb) return ba - bb;
            if (ba === 0) return a.endTs - b.endTs;
            if (ba === 1 || ba === 3) return b.endTs - a.endTs;
            if (a.weekIdx !== b.weekIdx) return a.weekIdx - b.weekIdx;
            return a.taskIdx - b.taskIdx;
        });
        return out;
    }

    function ensureDeadlineSelection(entries) {
        if (!entries || entries.length === 0) { dlWIdx = -1; dlTIdx = -1; return; }
        if (!entries.some(e => e.weekIdx === dlWIdx && e.taskIdx === dlTIdx)) {
            dlWIdx = entries[0].weekIdx;
            dlTIdx = entries[0].taskIdx;
        }
    }

    function refreshScheduleViews() {
        if (viewMode !== 'schedule') return;
        renderScheduleWeeks();
        if (schedulePanelMode === 'deadlines') renderDeadlineEditor();
        else renderScheduleEditor();
    }

    function setSchedulePanelMode(mode) {
        schedulePanelMode = mode === 'deadlines' ? 'deadlines' : 'weeks';
        refreshScheduleViews();
    }

    function renderScheduleWeeks() {
        const prevList = document.getElementById('sch-week-list');
        const prevScrollTop = prevList ? prevList.scrollTop : 0;
        const mid = document.getElementById('middle-col');
        const isDeadlineMode = schedulePanelMode === 'deadlines';
        mid.innerHTML = `
            <div class="panel-header" style="background:#ff9500; color:black; display:flex; flex-direction:column; align-items:stretch; gap:8px;">
                <span>SCHEDULE MANAGER</span>
                <select class="view-select" style="font-family:'Segoe UI',sans-serif; font-size:0.84rem; text-transform:none; border-color:#aa6400;" onchange="setSchedulePanelMode(this.value)">
                    <option value="weeks" ${!isDeadlineMode ? 'selected' : ''}>📅 All Weeks</option>
                    <option value="deadlines" ${isDeadlineMode ? 'selected' : ''}>⏳ Upcoming Deadlines</option>
                </select>
            </div>
            ${renderAdminScheduleFilterBar()}
            <div id="sch-week-list" class="list-container"></div>
            ${isDeadlineMode ? '<button class="btn btn-add" style="background:#00E5FF; color:black;" onclick="renderDeadlineEditor()">↻ Refresh Deadlines</button>' : '<button class="btn btn-add" style="background:#ff9500; color:black;" onclick="addScheduleWeek()">+ Add Schedule Week</button>'}
        `;
        const list = document.getElementById('sch-week-list');

        if (isDeadlineMode) {
            const entries = collectScheduleDeadlineEntries();
            ensureDeadlineSelection(entries);
            if (entries.length === 0) {
                list.innerHTML = '<div style="text-align:center; color:#777; padding:20px;">No tasks with deadlines yet.<br><span style="font-size:0.8rem; color:#666;">Use the add box in the editor panel to create one.</span></div>';
                list.scrollTop = prevScrollTop;
                return;
            }
            entries.forEach(entry => {
                const el = document.createElement('div');
                const isActive = entry.weekIdx === dlWIdx && entry.taskIdx === dlTIdx;
                el.className = `list-item ${isActive ? 'active' : ''}`;
                if (isActive) el.style.borderLeftColor = '#00E5FF';
                const weekLabel = (entry.week.weekName && entry.week.weekName.trim()) ? entry.week.weekName.trim() : `Week ${entry.week.week}`;
                const status = entry.completed
                    ? '<span style="font-size:0.62rem; background:rgba(90,90,90,0.45); color:#ccc; padding:1px 6px; border-radius:10px;">COMPLETED</span>'
                    : (entry.upcoming ? '<span style="font-size:0.62rem; background:rgba(52,199,89,0.2); color:#34c759; padding:1px 6px; border-radius:10px;">UPCOMING</span>' : '<span style="font-size:0.62rem; background:rgba(255,149,0,0.2); color:#ff9500; padding:1px 6px; border-radius:10px;">PAST</span>');
                el.innerHTML = `
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;"><span style="font-weight:700; color:${getSubjectColor(entry.task.sub)};">${escHtml(entry.task.sub || 'UNK')}</span>${status}</div>
                        <div style="margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(entry.task.icon || '📝')} ${escHtml(entry.task.name || 'Untitled Task')}</div>
                        <div style="font-size:0.72rem; color:#8aa2bd; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(entry.task.deadlineDate || '')} • ${escHtml(weekLabel)}</div>
                    </div>`;
                el.onclick = () => { dlWIdx = entry.weekIdx; dlTIdx = entry.taskIdx; renderScheduleWeeks(); renderDeadlineEditor(); };
                list.appendChild(el);
            });
            list.scrollTop = prevScrollTop;
            return;
        }

        const currentWeekIdx = getCurrentScheduleWeekIndex();
        window.SCHEDULE_DATA.forEach((wk, i) => {
            const el = document.createElement('div');
            el.className = `list-item ${i === schWIdx ? 'active' : ''}`;
            if(i === schWIdx) el.style.borderLeftColor = "#ff9500";
            const displayName = (wk.weekName && wk.weekName.trim()) ? wk.weekName.trim().toUpperCase() : `WEEK ${wk.week}`;
            const isCurrent = i === currentWeekIdx;
            if (isCurrent) el.style.boxShadow = '0 0 0 1px rgba(52,199,89,0.45), 0 0 15px rgba(52,199,89,0.2)';
            const marker = isCurrent ? '<span style="font-size:0.66rem; background:rgba(52,199,89,0.2); color:#34c759; border:1px solid rgba(52,199,89,0.5); padding:2px 6px; border-radius:10px; margin-right:6px;">●</span>' : '';
            el.innerHTML = `<div style="flex:1">${marker}${displayName} <span style="font-size:0.7rem; background:#333; padding:2px 5px; border-radius:4px;">${wk.tasks ? wk.tasks.length : 0} tasks</span></div><button class="btn btn-del" onclick="delScheduleWeek(event, ${i})">✕</button>`;
            el.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { schWIdx = i; renderScheduleWeeks(); renderScheduleEditor(); } };
            list.appendChild(el);
        });

        list.scrollTop = prevScrollTop;
    }

    function getTaskDeadlineTimestamp(task) {
        if (!task) return Number.POSITIVE_INFINITY;
        const ref = (task.deadlineEndDate && task.deadlineEndDate.trim()) ? task.deadlineEndDate : task.deadlineDate;
        const dt = pDate(ref) || parseAdminDeadlineDate(ref);
        return dt ? dt.getTime() : Number.POSITIVE_INFINITY;
    }

    function insertTaskSortedByDeadline(tasks, task) {
        const ts = getTaskDeadlineTimestamp(task);
        let idx = tasks.findIndex(t => ts < getTaskDeadlineTimestamp(t));
        if (idx === -1) idx = tasks.length;
        tasks.splice(idx, 0, task);
        return idx;
    }

    function relocateScheduleTaskByDeadline(weekIdx, taskIdx) {
        const srcWeek = window.SCHEDULE_DATA[weekIdx];
        if (!srcWeek || !srcWeek.tasks || !srcWeek.tasks[taskIdx]) return { moved: false, weekIdx, taskIdx };

        const task = srcWeek.tasks[taskIdx];
        if (!task.deadlineDate || !task.deadlineDate.trim()) return { moved: false, weekIdx, taskIdx };

        const normalized = normalizeAdminDeadlineDate(task.deadlineDate);
        const parsed = parseAdminDeadlineDate(normalized) || pDate(normalized);
        if (!parsed) return { moved: false, weekIdx, taskIdx };

        task.deadlineDate = normalized;
        const targetWeekIdx = inferWeekIndexFromDate(parsed);
        if (targetWeekIdx < 0 || !window.SCHEDULE_DATA[targetWeekIdx]) return { moved: false, weekIdx, taskIdx };

        const movedTask = srcWeek.tasks.splice(taskIdx, 1)[0];
        const targetTasks = window.SCHEDULE_DATA[targetWeekIdx].tasks || (window.SCHEDULE_DATA[targetWeekIdx].tasks = []);
        const targetTaskIdx = insertTaskSortedByDeadline(targetTasks, movedTask);

        schWIdx = targetWeekIdx;
        if (schedulePanelMode === 'deadlines') {
            dlWIdx = targetWeekIdx;
            dlTIdx = targetTaskIdx;
        }

        return {
            moved: targetWeekIdx !== weekIdx || targetTaskIdx !== taskIdx,
            weekIdx: targetWeekIdx,
            taskIdx: targetTaskIdx
        };
    }

    function commitScheduleTaskDeadline(weekIdx, taskIdx) {
        relocateScheduleTaskByDeadline(weekIdx, taskIdx);
        refreshScheduleViews();
    }

    function autoExtractDeadline(tIdx) {
        const task = window.SCHEDULE_DATA[schWIdx].tasks[tIdx];
        const whenStr = task.when || '';
        
        // Extract ALL dates in brackets: (25/03) or [25/03]
        const dateMatches = [...whenStr.matchAll(/[\(\[](\d{1,2})[\/ \-](\d{1,2})[\)\]]/g)];
        // Extract ALL times: 10:00 AM, 2:00 PM
        const timeMatches = [...whenStr.matchAll(/(\d{1,2}:\d{2})\s*(AM|PM)/gi)];

        function fmtDate(m) { return m[1].padStart(2,'0') + '/' + m[2].padStart(2,'0') + '/2026'; }
        function fmtTime(m) { return m[1] + ' ' + m[2].toUpperCase(); }

        let startStr = '';
        let endStr = '';

        if (dateMatches.length >= 2 && timeMatches.length >= 2) {
            // Two dates + two times: (23/03) 10:00 AM to (25/03) 2:00 PM
            startStr = fmtDate(dateMatches[0]) + ' ' + fmtTime(timeMatches[0]);
            endStr = fmtDate(dateMatches[1]) + ' ' + fmtTime(timeMatches[1]);
        } else if (dateMatches.length >= 2 && timeMatches.length === 1) {
            // Two dates + one time
            startStr = fmtDate(dateMatches[0]) + ' ' + fmtTime(timeMatches[0]);
            endStr = fmtDate(dateMatches[1]) + ' 11:59 PM';
        } else if (dateMatches.length >= 2 && timeMatches.length === 0) {
            // Two dates, no times
            startStr = fmtDate(dateMatches[0]) + ' 12:00 AM';
            endStr = fmtDate(dateMatches[1]) + ' 11:59 PM';
        } else if (dateMatches.length === 1 && timeMatches.length >= 2) {
            // One date + two times: (25/03) 10:00 AM to 2:00 PM
            const d = fmtDate(dateMatches[0]);
            startStr = d + ' ' + fmtTime(timeMatches[0]);
            endStr = d + ' ' + fmtTime(timeMatches[1]);
        } else if (dateMatches.length === 1 && timeMatches.length === 1) {
            // One date + one time (simple case)
            startStr = fmtDate(dateMatches[0]) + ' ' + fmtTime(timeMatches[0]);
            endStr = '';
        } else if (dateMatches.length === 1 && timeMatches.length === 0) {
            startStr = fmtDate(dateMatches[0]) + ' 11:59 PM';
            endStr = '';
            alert("Found the date, but no time (e.g., 10:00 AM). Defaulted to 11:59 PM.");
        } else if (dateMatches.length === 0 && timeMatches.length >= 1) {
            alert("Found time(s) but no date in brackets like (25/03). Please add a date.");
            return;
        } else {
            alert("Couldn't find a date in brackets like (25/03) or a time like 10:00 AM.");
            return;
        }

        task.deadlineDate = startStr;
        task.deadlineEndDate = endStr;
        relocateScheduleTaskByDeadline(schWIdx, tIdx);
        refreshScheduleViews();
    }

    function renderScheduleEditor() {
        const container = document.getElementById('editor-area');
        if(!window.SCHEDULE_DATA[schWIdx]) { container.innerHTML = ''; return; }
        const wk = window.SCHEDULE_DATA[schWIdx];
        if(!wk.tasks) wk.tasks = [];
        
        let subOptions = '';
        window.COURSE_DATA.forEach(sub => { subOptions += `<option value="${sub.code}">${sub.code} - ${sub.name}</option>`; });

        let presetOptions = '<option value="" disabled selected>Preset...</option>';
        window.CONFIG.taskPresets.forEach(tp => { presetOptions += `<option value="${tp.icon}|${tp.name}">${tp.icon} ${tp.name}</option>`; });

        let html = `
            <div class="form-section" style="border-color:#ff9500;">
                <h3 style="color:#ff9500;">${(wk.weekName && wk.weekName.trim()) ? wk.weekName.trim().toUpperCase() : 'WEEK ' + wk.week} — Settings</h3>
                ${makeHelpBox('schedule', 'Schedule weeks appear on the Semester Map page. Each week can hold multiple deliverables (assignments, quizzes, labs, exams). Deadlines from schedule weeks also feed the Deadlines page and the navbar counter. Mark a week as Midterm or Finals to change its color on the map. Drag weeks in the left panel to reorder.')}
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                    <div>
                        <label>Week Number:</label>
                        <input type="number" style="width:100%;" value="${wk.week}" oninput="window.SCHEDULE_DATA[schWIdx].week = parseInt(this.value); renderScheduleWeeks();">
                    </div>
                    <div>
                        <label>Week Display Name <span style="color:#888;font-weight:normal;">(shown instead of "WEEK N")</span>:</label>
                        <input type="text" style="width:100%;" placeholder='e.g. Finals or "Reading Week"' value="${wk.weekName || ''}" oninput="window.SCHEDULE_DATA[schWIdx].weekName = this.value; renderScheduleWeeks();">
                    </div>
                </div>

                <div style="margin-bottom:10px;">
                    <label>Week Note <span style="color:#888;font-weight:normal;">(small line under title)</span>:</label>
                    <input type="text" style="width:100%;" placeholder="e.g. No classes — study days" value="${wk.note || ''}" oninput="window.SCHEDULE_DATA[schWIdx].note = this.value;">
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                    <div>
                        <label>Date Range Override:</label>
                        <div style="display:flex; gap:5px; align-items:center;">
                            <input type="date" style="flex:1;" value="${wk.dateStart || ''}" oninput="window.SCHEDULE_DATA[schWIdx].dateStart = this.value;" title="Start date (leave blank for auto)">
                            <span style="color:#888; font-size:0.8rem;">→</span>
                            <input type="date" style="flex:1;" value="${wk.dateEnd || ''}" oninput="window.SCHEDULE_DATA[schWIdx].dateEnd = this.value;" title="End date (leave blank for auto)">
                        </div>
                        <div style="font-size:0.72rem; color:#888; margin-top:3px;">Leave blank to use auto-calculated dates</div>
                    </div>
                    <div>
                        <label>"Current Period" Badge Label:</label>
                        <input type="text" style="width:100%;" placeholder="e.g. FINALS PERIOD" value="${wk.currentLabel || ''}" oninput="window.SCHEDULE_DATA[schWIdx].currentLabel = this.value;" title="Replaces '📍 CURRENT WEEK' badge text">
                        <div style="font-size:0.72rem; color:#888; margin-top:3px;">Leave blank for default "CURRENT WEEK"</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                    <label class="checkbox-label" style="background:rgba(0,122,255,0.15); border:1px solid #007aff; padding:10px; margin:0; border-radius:8px;">
                        <input type="checkbox" ${wk.isMidterm ? 'checked' : ''} onchange="window.SCHEDULE_DATA[schWIdx].isMidterm=this.checked; if(this.checked) window.SCHEDULE_DATA[schWIdx].isFinals=false; renderScheduleWeeks();">
                        <span style="color:#007aff; font-weight:bold;">📝 Midterm Week (Blue)</span>
                    </label>
                    <label class="checkbox-label" style="background:rgba(217,119,6,0.15); border:1px solid #d97706; padding:10px; margin:0; border-radius:8px;">
                        <input type="checkbox" ${wk.isFinals ? 'checked' : ''} onchange="window.SCHEDULE_DATA[schWIdx].isFinals=this.checked; if(this.checked) window.SCHEDULE_DATA[schWIdx].isMidterm=false; renderScheduleWeeks();">
                        <span style="color:#d97706; font-weight:bold;">🏁 Finals Week (Amber)</span>
                    </label>
                </div>

                <div style="margin-bottom:20px;">
                    <label>Custom Card Accent Color:</label>
                    <div style="display:flex; align-items:center; gap:10px; margin-top:5px; flex-wrap:wrap;">
                        <input type="color" value="${wk.cardColor || '#b519d6'}" oninput="window.SCHEDULE_DATA[schWIdx].cardColor = this.value;" style="width:44px;height:32px;border-radius:6px;border:1px solid #555;cursor:pointer;">
                        <button onclick="window.SCHEDULE_DATA[schWIdx].cardColor=''; this.closest('.form-section').querySelector('input[type=color]').value='#b519d6'; renderScheduleWeeks(); renderScheduleEditor();" style="padding:5px 12px;background:rgba(255,255,255,0.05);border:1px solid #555;color:#aaa;border-radius:6px;cursor:pointer;font-size:0.78rem;">↺ Reset to Default</button>
                        <span style="color:#888; font-size:0.75rem;">Overrides midterm / finals / current-week colors</span>
                    </div>
                </div>

                <div id="sch-task-list"></div>
                <button class="btn btn-add" style="background:#ff9500; color:black; border-radius:4px; margin-top:20px;" onclick="addScheduleTask()">+ Add Deliverable to ${(wk.weekName && wk.weekName.trim()) ? wk.weekName.trim() : 'Week ' + wk.week}</button>
            </div>
        `;
        container.innerHTML = html;

        const list = document.getElementById('sch-task-list');
        const visibleTasks = wk.tasks.map((task, tIdx) => ({ task, tIdx })).filter(({ task }) => taskPassesAdminScheduleFilters(task));

        if (visibleTasks.length === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'text-align:center; color:#777; padding:16px; border:1px dashed rgba(255,255,255,0.18); border-radius:10px; margin-bottom:10px;';
            msg.innerHTML = 'No tasks match current admin filters for this week.';
            list.appendChild(msg);
        }

        visibleTasks.forEach(({ task, tIdx }) => {
            const el = document.createElement('div');
            el.className = 'res-item';
            el.style.flexDirection = 'column';
            el.style.borderLeft = `4px solid ${getSubjectColor(task.sub)}`;
            
            let myOpts = ''; window.COURSE_DATA.forEach(sub => { myOpts += `<option value="${sub.code}" ${task.sub === sub.code ? 'selected' : ''}>${sub.code}</option>`; });

            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom:10px; gap:10px; flex-wrap:wrap;">
                    <select style="width:100px; margin:0;" onchange="updateSchTask(${tIdx}, 'sub', this.value); renderScheduleEditor();">${myOpts}</select>
                    <select style="width:140px; margin:0; font-size:0.85rem;" onchange="if(this.value){ const v=this.value.split('|'); updateSchTask(${tIdx}, 'icon', v[0]); updateSchTask(${tIdx}, 'name', v[1]); renderScheduleEditor(); }">${presetOptions}</select>
                    <input type="text" placeholder="Icon" value="${task.icon}" style="width:50px; margin:0;" oninput="updateSchTask(${tIdx}, 'icon', this.value)">
                    <input type="text" placeholder="Task Name" value="${task.name}" style="flex:1; margin:0;" oninput="updateSchTask(${tIdx}, 'name', this.value)">
                    <button class="btn btn-del" onclick="delScheduleTask(${tIdx})">✕ Remove</button>
                </div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:12px; width:100%; overflow:hidden;">
                    <div style="min-width:0;">
                        <label style="height:40px; display:flex; align-items:flex-end; padding-bottom:5px; box-sizing:border-box;">
                            <span style="line-height:1.2;">When? <span style="font-size:0.7rem; color:#888; font-weight:normal; display:block;">(Date in brackets like (25/03))</span></span>
                        </label>
                        <input type="text" placeholder="e.g. Mon (25/03) 10:00 AM" value="${task.when || ''}" style="margin-bottom:4px;" oninput="updateSchTask(${tIdx}, 'when', this.value)">
                        <input type="text" placeholder="URL (Optional)" value="${task.whenLink || ''}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="updateSchTask(${tIdx}, 'whenLink', this.value)">
                        <input type="text" placeholder="Link note (e.g. Check your time here)" value="${task.whenNote || ''}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="updateSchTask(${tIdx}, 'whenNote', this.value)">
                    </div>
                    <div style="min-width:0;">
                        <label style="height:40px; display:flex; align-items:flex-end; padding-bottom:5px; box-sizing:border-box;">Where?</label>
                        <input type="text" placeholder="e.g. Online / Hall 3" value="${task.where || ''}" style="margin-bottom:4px;" oninput="updateSchTask(${tIdx}, 'where', this.value)">
                        <input type="text" placeholder="URL (Optional)" value="${task.whereLink || ''}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="updateSchTask(${tIdx}, 'whereLink', this.value)">
                        <input type="text" placeholder="Link note (e.g. Check your place here)" value="${task.whereNote || ''}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="updateSchTask(${tIdx}, 'whereNote', this.value)">
                    </div>
                    <div style="min-width:0;">
                        <label style="height:40px; display:flex; align-items:flex-end; padding-bottom:5px; box-sizing:border-box;">Coverage?</label>
                        <input type="text" placeholder="e.g. Weeks 1 to 4" value="${task.coverage || ''}" style="margin-bottom:4px;" oninput="updateSchTask(${tIdx}, 'coverage', this.value)">
                        <input type="text" placeholder="URL (Optional)" value="${task.coverageLink || ''}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="updateSchTask(${tIdx}, 'coverageLink', this.value)">
                        <input type="text" placeholder="Link note (e.g. Check your coverage here)" value="${task.coverageNote || ''}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="updateSchTask(${tIdx}, 'coverageNote', this.value)">
                    </div>
                    <div style="min-width:0;">
                        <label style="height:40px; display:flex; align-items:flex-end; padding-bottom:5px; box-sizing:border-box;">📤 Submit?</label>
                        <input type="text" placeholder="e.g. MS Teams / Moodle" value="${task.submitText || ''}" style="margin-bottom:4px;" oninput="updateSchTask(${tIdx}, 'submitText', this.value)">
                        <input type="text" placeholder="URL (optional)" value="${task.submitLink || ''}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="updateSchTask(${tIdx}, 'submitLink', this.value)">
                        <input type="text" placeholder="Link note (e.g. Submit here)" value="${task.submitNote || ''}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="updateSchTask(${tIdx}, 'submitNote', this.value)">
                    </div>
                </div>
                <label>Extra Notes:</label><textarea rows="2" placeholder="e.g. Bring calculators" oninput="updateSchTask(${tIdx}, 'note', this.value)">${task.note || ''}</textarea>
                <input type="text" placeholder="URL for Notes (Optional)" value="${task.noteLink || ''}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="updateSchTask(${tIdx}, 'noteLink', this.value)">
                <input type="text" placeholder="Link note (e.g. Read before attending)" value="${task.noteNote || ''}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="updateSchTask(${tIdx}, 'noteNote', this.value)">
                
                <div style="width:100%; margin-top:10px; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(0, 229, 255, 0.3);">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                        <label style="color:#00E5FF; margin:0;">⏳ Deadline Tracker</label>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <label class="checkbox-label" style="margin:0;"><input type="checkbox" ${task.isCompleted ? 'checked' : ''} onchange="updateSchTask(${tIdx}, 'isCompleted', this.checked)"> Mark Completed</label>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px; margin-bottom:6px;">
                        <input type="text" placeholder="e.g. 25/03/2026 10:00 AM" value="${task.deadlineDate || ''}" style="margin:0; flex:1;" oninput="updateSchTask(${tIdx}, 'deadlineDate', this.value)" onblur="commitScheduleTaskDeadline(${schWIdx}, ${tIdx})">
                        <button class="btn-time" style="background:#00E5FF; color:black; font-weight:bold; border:none; padding:8px 12px; font-size:0.9rem;" onclick="autoExtractDeadline(${tIdx})" title="Auto-Extract from 'When?' field">🪄 Auto</button>
                    </div>
                    ${task.deadlineEndDate ? `<div style="display:flex; align-items:center; gap:8px; margin-top:4px; background:rgba(175,82,222,0.1); padding:6px 10px; border-radius:6px; border:1px solid rgba(175,82,222,0.25);">
                        <span style="color:#af52de; font-size:0.8rem; font-weight:bold; white-space:nowrap;">🔄 Ends:</span>
                        <input type="text" value="${task.deadlineEndDate}" style="margin:0; flex:1; font-size:0.85rem;" oninput="updateSchTask(${tIdx}, 'deadlineEndDate', this.value)">
                        <button class="btn btn-del" style="font-size:0.7rem; padding:2px 8px;" onclick="updateSchTask(${tIdx}, 'deadlineEndDate', ''); renderScheduleEditor();">Clear</button>
                    </div>` : ''}
                    <div style="font-size:0.7rem; color:#888; margin-top:4px;">Click 🪄 Auto to extract from the "When?" field. Ranges like "10:00 AM to 2:00 PM" or two dates are auto-detected.</div>
                </div>
            `;
            list.appendChild(el);
        });
    }

    function updateSchTask(tIdx, field, val) { window.SCHEDULE_DATA[schWIdx].tasks[tIdx][field] = val; }
    function addScheduleWeek() { window.SCHEDULE_DATA.push({ week: window.SCHEDULE_DATA.length + 1, tasks: [] }); schWIdx = window.SCHEDULE_DATA.length - 1; refreshScheduleViews(); }
    function delScheduleWeek(e, i) { e.stopPropagation(); if(confirm("Delete this week?")) { window.SCHEDULE_DATA.splice(i, 1); schWIdx = Math.max(0, Math.min(schWIdx, window.SCHEDULE_DATA.length - 1)); refreshScheduleViews(); } }
    function addScheduleTask() { window.SCHEDULE_DATA[schWIdx].tasks.push(createEmptyScheduleTask()); refreshScheduleViews(); }
    function delScheduleTask(tIdx) { if(confirm("Remove this task?")) { window.SCHEDULE_DATA[schWIdx].tasks.splice(tIdx, 1); refreshScheduleViews(); } }

    function addScheduleDeadlineQuick() {
        const subEl = document.getElementById('dl-add-sub');
        const nameEl = document.getElementById('dl-add-name');
        const iconEl = document.getElementById('dl-add-icon');
        const dateEl = document.getElementById('dl-add-date');
        if (!subEl || !nameEl || !iconEl || !dateEl) return;

        const normalized = normalizeAdminDeadlineDate(dateEl.value || '');
        const parsed = parseAdminDeadlineDate(normalized);
        if (!parsed) { alert('Please enter a valid deadline date. Example: 07/04/2026 11:59 PM or 2026-04-07'); return; }

        const wIdx = inferWeekIndexFromDate(parsed);
        if (wIdx < 0 || !window.SCHEDULE_DATA[wIdx]) { alert('Could not infer week. Add schedule weeks first.'); return; }
        if (!window.SCHEDULE_DATA[wIdx].tasks) window.SCHEDULE_DATA[wIdx].tasks = [];

        const task = createEmptyScheduleTask(subEl.value || (window.COURSE_DATA[0] && window.COURSE_DATA[0].code) || 'UNK');
        task.name = (nameEl.value || '').trim() || 'New Deadline Task';
        task.icon = (iconEl.value || '').trim() || '📝';
        task.deadlineDate = normalized;
        window.SCHEDULE_DATA[wIdx].tasks.push(task);

        dlWIdx = wIdx;
        dlTIdx = window.SCHEDULE_DATA[wIdx].tasks.length - 1;
        schedulePanelMode = 'deadlines';
        refreshScheduleViews();
    }

    function renderDeadlineEditor() {
        const container = document.getElementById('editor-area');
        const entries = collectScheduleDeadlineEntries();
        ensureDeadlineSelection(entries);

        const subOptions = window.COURSE_DATA.map(sub => `<option value="${escAttr(sub.code)}">${escHtml(sub.code)} - ${escHtml(sub.name)}</option>`).join('');
        const addPanel = `
            <div class="form-section" style="border-color:#00E5FF;">
                <h3 style="color:#00E5FF;">⏳ Add New Deadline (Auto Week Detection)</h3>
                <div style="display:grid; grid-template-columns: 90px 1fr 1fr 1.2fr auto; gap:10px; align-items:end;">
                    <div><label>Icon</label><input id="dl-add-icon" type="text" value="📝" style="margin:0;"></div>
                    <div><label>Task Name</label><input id="dl-add-name" type="text" placeholder="e.g. Assignment 2" style="margin:0;"></div>
                    <div><label>Subject</label><select id="dl-add-sub" style="margin:0;">${subOptions}</select></div>
                    <div><label>Deadline Date</label><input id="dl-add-date" type="text" placeholder="dd/mm/yyyy hh:mm AM or yyyy-mm-dd" style="margin:0;"></div>
                    <button class="btn" style="background:#00E5FF; color:black; height:36px;" onclick="addScheduleDeadlineQuick()">+ Add</button>
                </div>
                <div style="font-size:0.75rem; color:#888; margin-top:8px;">Date is used to auto-place the task in the matching week by range or semester timeline.</div>
            </div>`;

        if (entries.length === 0) {
            container.innerHTML = addPanel + '<div class="form-section" style="border-color:#333;"><div style="text-align:center; color:#777;">No deadlines found yet. Add one above to start managing them in upcoming order.</div></div>';
            return;
        }

        const wk = window.SCHEDULE_DATA[dlWIdx];
        const task = wk && wk.tasks ? wk.tasks[dlTIdx] : null;
        if (!task) {
            container.innerHTML = addPanel + '<div class="form-section" style="border-color:#333;"><div style="text-align:center; color:#777;">Select a deadline from the middle list.</div></div>';
            return;
        }

        let myOpts = '';
        window.COURSE_DATA.forEach(sub => { myOpts += `<option value="${sub.code}" ${task.sub === sub.code ? 'selected' : ''}>${sub.code}</option>`; });
        const weekLabel = (wk.weekName && wk.weekName.trim()) ? wk.weekName.trim() : `Week ${wk.week}`;
        let presetOptions = '<option value="" disabled selected>Preset...</option>';
        window.CONFIG.taskPresets.forEach(tp => { presetOptions += `<option value="${tp.icon}|${tp.name}">${tp.icon} ${tp.name}</option>`; });

        container.innerHTML = addPanel + `
            <div class="form-section" style="border-color:#00E5FF;">
                <h3 style="color:#00E5FF;">Deadline Editor</h3>
                <div class="res-item" style="flex-direction:column; border-left:4px solid ${getSubjectColor(task.sub)};">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; gap:10px; flex-wrap:wrap;">
                        <div style="font-size:0.8rem; color:#8aa2bd;">📍 ${escHtml(weekLabel)} <span style="color:#666;">(task #${dlTIdx + 1})</span></div>
                        <button class="btn-time" style="background:#2f3d55; border-color:#4a90e2;" onclick="schedulePanelMode='weeks'; schWIdx=${dlWIdx}; renderScheduleWeeks(); renderScheduleEditor();">Open in Week View</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom:10px; gap:10px; flex-wrap:wrap;">
                        <select style="width:100px; margin:0;" onchange="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].sub=this.value; refreshScheduleViews();">${myOpts}</select>
                        <select style="width:140px; margin:0; font-size:0.85rem;" onchange="if(this.value){ const v=this.value.split('|'); window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].icon=v[0]; window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].name=v[1]; refreshScheduleViews(); }">${presetOptions}</select>
                        <input type="text" placeholder="Icon" value="${escAttr(task.icon || '')}" style="width:50px; margin:0;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].icon=this.value">
                        <input type="text" placeholder="Task Name" value="${escAttr(task.name || '')}" style="flex:1; margin:0;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].name=this.value">
                        <button class="btn btn-del" onclick="if(confirm('Remove this task?')){ window.SCHEDULE_DATA[${dlWIdx}].tasks.splice(${dlTIdx},1); refreshScheduleViews(); }">✕ Remove</button>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:12px; width:100%; overflow:hidden;">
                        <div style="min-width:0;"><label style="height:40px; display:flex; align-items:flex-end; padding-bottom:5px; box-sizing:border-box;"><span style="line-height:1.2;">When? <span style="font-size:0.7rem; color:#888; font-weight:normal; display:block;">(Date in brackets like (25/03))</span></span></label><input type="text" value="${escAttr(task.when || '')}" style="margin-bottom:4px;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].when=this.value"><input type="text" placeholder="URL (Optional)" value="${escAttr(task.whenLink || '')}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].whenLink=this.value"><input type="text" placeholder="Link note" value="${escAttr(task.whenNote || '')}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].whenNote=this.value"></div>
                        <div style="min-width:0;"><label style="height:40px; display:flex; align-items:flex-end; padding-bottom:5px; box-sizing:border-box;">Where?</label><input type="text" value="${escAttr(task.where || '')}" style="margin-bottom:4px;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].where=this.value"><input type="text" placeholder="URL (Optional)" value="${escAttr(task.whereLink || '')}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].whereLink=this.value"><input type="text" placeholder="Link note" value="${escAttr(task.whereNote || '')}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].whereNote=this.value"></div>
                        <div style="min-width:0;"><label style="height:40px; display:flex; align-items:flex-end; padding-bottom:5px; box-sizing:border-box;">Coverage?</label><input type="text" value="${escAttr(task.coverage || '')}" style="margin-bottom:4px;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].coverage=this.value"><input type="text" placeholder="URL (Optional)" value="${escAttr(task.coverageLink || '')}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].coverageLink=this.value"><input type="text" placeholder="Link note" value="${escAttr(task.coverageNote || '')}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].coverageNote=this.value"></div>
                        <div style="min-width:0;"><label style="height:40px; display:flex; align-items:flex-end; padding-bottom:5px; box-sizing:border-box;">📤 Submit?</label><input type="text" value="${escAttr(task.submitText || '')}" style="margin-bottom:4px;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].submitText=this.value"><input type="text" placeholder="URL (optional)" value="${escAttr(task.submitLink || '')}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].submitLink=this.value"><input type="text" placeholder="Link note" value="${escAttr(task.submitNote || '')}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].submitNote=this.value"></div>
                    </div>
                    <label>Extra Notes:</label><textarea rows="2" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].note=this.value">${escHtml(task.note || '')}</textarea>
                    <input type="text" placeholder="URL for Notes (Optional)" value="${escAttr(task.noteLink || '')}" style="font-size:0.8rem; margin-bottom:4px; background:rgba(0,0,0,0.5);" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].noteLink=this.value">
                    <input type="text" placeholder="Link note" value="${escAttr(task.noteNote || '')}" style="font-size:0.75rem; margin-bottom:4px; background:rgba(74,144,226,0.1); border-color:rgba(74,144,226,0.3); color:#4a90e2;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].noteNote=this.value">
                    <div style="width:100%; margin-top:10px; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; border:1px solid rgba(0, 229, 255, 0.3);">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;"><label style="color:#00E5FF; margin:0;">⏳ Deadline Tracker</label><label class="checkbox-label" style="margin:0;"><input type="checkbox" ${task.isCompleted ? 'checked' : ''} onchange="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].isCompleted=this.checked; refreshScheduleViews();"> Mark Completed</label></div>
                        <div style="display:flex; align-items:center; gap:5px; margin-bottom:6px;"><input type="text" value="${escAttr(task.deadlineDate || '')}" style="margin:0; flex:1;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].deadlineDate=this.value" onblur="commitScheduleTaskDeadline(${dlWIdx}, ${dlTIdx})"><button class="btn-time" style="background:#00E5FF; color:black; font-weight:bold; border:none; padding:8px 12px; font-size:0.9rem;" onclick="schWIdx=${dlWIdx}; autoExtractDeadline(${dlTIdx})" title="Auto-Extract from 'When?' field">🪄 Auto</button></div>
                        ${task.deadlineEndDate ? `<div style="display:flex; align-items:center; gap:8px; margin-top:4px; background:rgba(175,82,222,0.1); padding:6px 10px; border-radius:6px; border:1px solid rgba(175,82,222,0.25);"><span style="color:#af52de; font-size:0.8rem; font-weight:bold; white-space:nowrap;">🔄 Ends:</span><input type="text" value="${escAttr(task.deadlineEndDate)}" style="margin:0; flex:1; font-size:0.85rem;" oninput="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].deadlineEndDate=this.value"><button class="btn btn-del" style="font-size:0.7rem; padding:2px 8px;" onclick="window.SCHEDULE_DATA[${dlWIdx}].tasks[${dlTIdx}].deadlineEndDate=''; refreshScheduleViews();">Clear</button></div>` : ''}
                    </div>
                </div>
            </div>`;
    }

    function updateDeadlines() {
        let count = 0;
        const now = new Date().getTime();
        window.SCHEDULE_DATA.forEach(wk => {
            if(wk.tasks) {
                wk.tasks.forEach(t => {
                    if(!t.isCompleted && t.deadlineDate && t.deadlineDate.trim() !== '') {
                        const endStr = (t.deadlineEndDate && t.deadlineEndDate.trim() !== '') ? t.deadlineEndDate : t.deadlineDate;
                        const ts = pDate(endStr); 
                        if(ts && now > ts.getTime()) {
                            t.isCompleted = true;
                            count++;
                        }
                    }
                });
            }
        });
        refreshScheduleViews();
        alert(`Updated and automatically marked ${count} past tasks as completed!`);
    }

    // --- MIDTERMS / FINALS EDITOR ---
    let midtermDragSrc = null;
    let adminExamView = 'midterms'; // 'midterms' | 'finals'
    let adminAnnounceTab = 'news'; // 'news' | 'updates'

    function addMidterm() {
        const arr = adminExamView === 'finals' ? window.FINAL_DATA : window.MIDTERM_DATA;
        arr.push({ dateLabel: '', sub: '', examCode: '', time: '', date: '', note: '', coverage: '', where: '', whereLink: '', whereNote: '' });
        renderMidtermsManager();
        setTimeout(() => {
            const list = document.getElementById('midterm-list-admin');
            if (list && list.lastElementChild) list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    function deleteMidterm(i) {
        const arr = adminExamView === 'finals' ? window.FINAL_DATA : window.MIDTERM_DATA;
        if (!confirm(`Delete "${arr[i].sub || 'this exam'}"?`)) return;
        arr.splice(i, 1);
        renderMidtermsManager();
    }

    function midtermDragStart(e, i) {
        midtermDragSrc = i;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.4';
    }
    function midtermDragEnd(e) { e.currentTarget.style.opacity = '1'; }
    function midtermDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    function midtermDrop(e, i) {
        e.preventDefault();
        if (midtermDragSrc === null || midtermDragSrc === i) return;
        const arr = adminExamView === 'finals' ? window.FINAL_DATA : window.MIDTERM_DATA;
        const [moved] = arr.splice(midtermDragSrc, 1);
        arr.splice(i, 0, moved);
        midtermDragSrc = null;
        renderMidtermsManager();
    }

    function renderMidtermsManager() {
        const container = document.getElementById('editor-area');
        const isFinals = adminExamView === 'finals';
        const activeArr = isFinals ? window.FINAL_DATA : window.MIDTERM_DATA;
        const accentColor = isFinals ? '#d97706' : '#007aff';
        const accentBg   = isFinals ? 'rgba(217,119,6,0.1)' : 'rgba(0,122,255,0.1)';
        const label      = isFinals ? 'Finals' : 'Midterms';
        const icon       = isFinals ? '🏁' : '📝';

        // Tab switcher HTML
        const tabHtml = `
            <div style="display:flex; gap:10px; margin-bottom:24px;">
                <button onclick="adminExamView='midterms'; renderMidtermsManager();" style="flex:1; padding:12px; border-radius:10px; font-weight:bold; font-size:0.9rem; cursor:pointer; border:2px solid ${adminExamView==='midterms' ? '#007aff' : '#333'}; background:${adminExamView==='midterms' ? 'rgba(0,122,255,0.15)' : 'transparent'}; color:${adminExamView==='midterms' ? '#007aff' : '#666'}; transition:all 0.2s;">
                    📝 Midterms <span style="font-size:0.75rem; opacity:0.7;">(${window.MIDTERM_DATA.length})</span>
                </button>
                <button onclick="adminExamView='finals'; renderMidtermsManager();" style="flex:1; padding:12px; border-radius:10px; font-weight:bold; font-size:0.9rem; cursor:pointer; border:2px solid ${adminExamView==='finals' ? '#d97706' : '#333'}; background:${adminExamView==='finals' ? 'rgba(217,119,6,0.15)' : 'transparent'}; color:${adminExamView==='finals' ? '#d97706' : '#666'}; transition:all 0.2s;">
                    🏁 Finals <span style="font-size:0.75rem; opacity:0.7;">(${window.FINAL_DATA.length})</span>
                </button>
            </div>`;

        container.innerHTML = `
            <div class="form-section" style="border-color:${accentColor}; max-width:900px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; padding-bottom:12px; margin-bottom:20px;">
                    <h3 style="color:${accentColor}; margin:0; border:none; padding:0;">${icon} Manage Midterms & Finals</h3>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <span style="color:#666; font-size:0.8rem;">${activeArr.length} exam${activeArr.length !== 1 ? 's' : ''} · drag ☰ to reorder</span>
                        ${!isFinals ? `<button class="btn" style="background:${accentColor}; padding:8px 18px;" onclick="addMidterm()">+ Add ${label} Exam</button>` : ''}
                    </div>
                </div>
                ${makeHelpBox('exams', 'Each entry is one subject\'s exam slot. Set the subject code, date, time, location, and coverage. On the site, midterms (blue) and finals (amber) appear on the Midterms / Finals page, ordered by date. The home page subject ordering switches to exam-time order when exams are within 3 days (midterms) or 5 days (finals) away.')}
                ${tabHtml}
                <div id="midterm-list-admin"></div>
                ${isFinals ? `<div style="display:flex; justify-content:center; margin-top:18px;"><button class="btn" style="background:${accentColor}; padding:10px 22px;" onclick="addMidterm()">+ Add ${label} Exam</button></div>` : ''}
            </div>
        `;

        const list = document.getElementById('midterm-list-admin');

        activeArr.forEach((m, i) => {
            const accentCardColor = getSubjectColor(m.sub) || accentColor;
            const el = document.createElement('div');
            el.className = 'res-item';
            el.draggable = true;
            el.style.cssText = `flex-direction:column; border-left:4px solid ${accentCardColor}; margin-bottom:14px; position:relative; cursor:default;`;
            el.addEventListener('dragstart', (e) => midtermDragStart(e, i));
            el.addEventListener('dragend',   midtermDragEnd);
            el.addEventListener('dragover',  midtermDragOver);
            el.addEventListener('drop',      (e) => midtermDrop(e, i));

            const dataRef = isFinals ? 'window.FINAL_DATA' : 'window.MIDTERM_DATA';

            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; width:100%; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="drag-handle" style="cursor:grab; color:#555; font-size:1.2rem; user-select:none;">☰</span>
                        <span style="background:${accentCardColor}22; color:${accentCardColor}; font-weight:bold; font-size:1rem; padding:3px 10px; border-radius:6px; border:1px solid ${accentCardColor}44;">
                            ${m.sub || '—'} &nbsp;·&nbsp; ${m.dateLabel || 'No date'} &nbsp;@&nbsp; ${m.time || '?'}
                        </span>
                    </div>
                    <button class="btn btn-del" onclick="deleteMidterm(${i})" title="Delete" style="flex-shrink:0;">🗑 Delete</button>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap:10px; width:100%; margin-bottom:4px;">
                    <div>
                        <label>📖 Subject Code</label>
                        <select oninput="${dataRef}[${i}].sub = this.value; renderMidtermsManager();" style="width:100%; padding:8px; background:#0a0012; border:1px solid #444; color:white; border-radius:4px; margin-bottom:10px; font-family:inherit;">
                            <option value="">-- Select --</option>
                            ${window.COURSE_DATA.map(s => `<option value="${escAttr(s.code)}" ${m.sub === s.code ? 'selected' : ''}>${escHtml(s.code)}</option>`).join('')}
                        </select>
                        ${!window.COURSE_DATA.find(s=>s.code===m.sub) && m.sub ? `<input type="text" placeholder="Custom code" value="${escAttr(m.sub)}" oninput="${dataRef}[${i}].sub = this.value;" style="margin-top:-6px;">` : ''}
                    </div>
                    <div>
                        <label>🔢 Exam Code</label>
                        <input type="text" placeholder="e.g. CSE333s" value="${escAttr(m.examCode || '')}" oninput="${dataRef}[${i}].examCode = this.value;">
                    </div>
                    <div>
                        <label>📅 Date <span style="font-size:0.72rem; color:#666; font-weight:normal;">(sets label auto)</span></label>
                        <input type="date" value="${escAttr(m.date || '')}" oninput="
                            ${dataRef}[${i}].date = this.value;
                            if(this.value) {
                                const d = new Date(this.value + 'T12:00:00');
                                const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                                ${dataRef}[${i}].dateLabel = days[d.getDay()] + ' · ' + d.getDate() + ' ' + months[d.getMonth()];
                                this.parentElement.nextElementSibling.querySelector('input').value = ${dataRef}[${i}].dateLabel;
                            }
                        " style="color-scheme:dark;">
                    </div>
                    <div>
                        <label>🏷 Date Label <span style="font-size:0.72rem; color:#666; font-weight:normal;">(override)</span></label>
                        <input type="text" placeholder="e.g. Friday · 27 March" value="${escAttr(m.dateLabel || '')}" oninput="${dataRef}[${i}].dateLabel = this.value;">
                    </div>
                    <div>
                        <label>🕐 Time</label>
                        <input type="text" placeholder="e.g. 2:30 PM" value="${escAttr(m.time || '')}" oninput="${dataRef}[${i}].time = this.value;">
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; width:100%;">
                    <div>
                        <label>📍 Location</label>
                        <input type="text" placeholder="e.g. Hall C (150), Hall D (36)" value="${escAttr(m.where || '')}" oninput="${dataRef}[${i}].where = this.value;">
                        <input type="text" placeholder="Location URL (Optional)" value="${escAttr(m.whereLink || '')}" style="font-size:0.8rem; margin-top:-5px; background:rgba(0,0,0,0.5);" oninput="${dataRef}[${i}].whereLink = this.value;">
                        <input type="text" placeholder="Link label (e.g. Check your seat here)" value="${escAttr(m.whereNote || '')}" style="font-size:0.75rem; background:rgba(${isFinals?'217,119,6':'74,144,226'},0.1); border-color:rgba(${isFinals?'217,119,6':'74,144,226'},0.3); color:${accentColor};" oninput="${dataRef}[${i}].whereNote = this.value;">
                    </div>
                    <div>
                        ${isFinals ? '' : `<label>📚 Coverage</label><input type="text" placeholder="e.g. Weeks 1–4" value="${escAttr(m.coverage || '')}" oninput="${dataRef}[${i}].coverage = this.value;">`}
                        <label style="margin-top:4px;">📝 Extra Notes</label>
                        <textarea rows="2" placeholder="e.g. Bring Student ID" oninput="${dataRef}[${i}].note = this.value;" style="margin-bottom:0;">${escHtml(m.note || '')}</textarea>
                    </div>
                </div>
            `;

            list.appendChild(el);
        });

        if (activeArr.length === 0) {
            list.innerHTML = `<div style="text-align:center; color:#555; padding:40px;">No ${label.toLowerCase()} exams yet. Click <strong style="color:${accentColor};">+ Add ${label} Exam</strong> to get started.</div>`;
        }
    }

    // --- CONFIG & HELPERS ---
    function renderConfigEditor() {
        const container = document.getElementById('editor-area');
        
        let html = `
            <div class="form-section" style="border-color:#34c759;">
                <h3 style="color:#34c759;">📅 Semester Start Date</h3>
                <p style="color:#888; font-size:0.8rem; margin-bottom:10px;">Used by the "Jump to Current Week" feature on the student view.</p>
                <input type="date" value="${window.CONFIG.semesterStart || ''}" style="max-width:250px;" onchange="window.CONFIG.semesterStart = this.value;">
            </div>
            <div class="form-section">
                <h3>Manage Resources</h3>
                <div id="config-list"></div>
                <button class="btn btn-add" style="margin-top:10px" onclick="addConfigType()">+ Add New Resource Type</button>
            </div>
            <div class="form-section" style="border-color:#ff9500;">
                <h3 style="color:#ff9500;">Manage Schedule Presets</h3>
                <div id="config-task-list"></div>
                <button class="btn btn-add" style="margin-top:10px; background:#ff9500; color:black;" onclick="addConfigTaskPreset()">+ Add New Task Preset</button>
            </div>
        `;
        container.innerHTML = html;
        
        const list = document.getElementById('config-list');
        window.CONFIG.resources.forEach((res, i) => {
            const el = document.createElement('div');
            el.className = 'res-item';
            el.draggable = true;
            el.addEventListener('dragstart', (e) => handleDragStart(e, i, 'config'));
            el.addEventListener('dragover', handleDragOver);
            el.addEventListener('drop', (e) => handleDrop(e, i, 'config'));
            el.innerHTML = `
                <div class="drag-handle">☰</div>
                <div style="flex:1; display:flex; gap:10px;">
                    <div style="flex:0 0 50px;"><input type="text" value="${res.icon}" style="text-align:center" onchange="window.CONFIG.resources[${i}].icon=this.value"></div>
                    <div style="flex:1;"><input type="text" value="${res.name}" onchange="updateConfigName(${i}, this.value)"></div>
                </div>
                <button class="btn btn-del" onclick="delConfigType(${i})">✕</button>
            `;
            list.appendChild(el);
        });

        const taskList = document.getElementById('config-task-list');
        window.CONFIG.taskPresets.forEach((tp, i) => {
            const el = document.createElement('div');
            el.className = 'res-item';
            el.style.borderLeft = '4px solid #ff9500';
            el.draggable = true;
            el.addEventListener('dragstart', (e) => handleDragStart(e, i, 'configTask'));
            el.addEventListener('dragover', handleDragOver);
            el.addEventListener('drop', (e) => handleDrop(e, i, 'configTask'));
            el.innerHTML = `
                <div class="drag-handle">☰</div>
                <div style="flex:1; display:flex; gap:10px;">
                    <div style="flex:0 0 50px;"><input type="text" value="${tp.icon}" style="text-align:center" onchange="updateConfigTaskPreset(${i}, 'icon', this.value)"></div>
                    <div style="flex:1;"><input type="text" value="${tp.name}" onchange="updateConfigTaskPreset(${i}, 'name', this.value)"></div>
                </div>
                <button class="btn btn-del" onclick="delConfigTaskPreset(${i})">✕</button>
            `;
            taskList.appendChild(el);
        });
    }

    function addConfigTaskPreset() { window.CONFIG.taskPresets.push({ name: "New Preset", icon: "📌" }); renderConfigEditor(); }
    function delConfigTaskPreset(i) { if(confirm("Delete this preset?")) { window.CONFIG.taskPresets.splice(i, 1); renderConfigEditor(); } }
    function updateConfigTaskPreset(i, field, val) { window.CONFIG.taskPresets[i][field] = val; }
    
    
    function addConfigType() { window.CONFIG.resources.push({name:"New", icon:"📦", defaultDesc:""}); renderConfigEditor(); }
    function delConfigType(i) { if(confirm("Del?")) { window.CONFIG.resources.splice(i,1); renderConfigEditor(); } }
    function updateConfigName(i, name) { window.CONFIG.resources[i].name = name; }
    
    function addSubject() { 
        const newSubject = {code:"NEW", name:"New", credits:"3 Credits", semester:"Spring 2026", color: "#e91e8c", subCode: "", weeks:[], events:[], playlists:[]};
        window.COURSE_DATA.push(newSubject);
        if(typeof window.SUBJECT_DETAILS_DATA === 'undefined' || !window.SUBJECT_DETAILS_DATA) window.SUBJECT_DETAILS_DATA = {};
        window.SUBJECT_DETAILS_DATA[newSubject.code] = { gradeDistribution: '', examTypes: '', generalNotes: '' };
        cIdx = window.COURSE_DATA.length-1;
        subViewMode = 'subject';
        renderSubjects(); renderMiddleColumn(); renderEditor(); 
        markDirty();
    }
    function delSubject(e, i) { 
        e.stopPropagation(); 
        if(confirm("Del?")) { 
            const code = window.COURSE_DATA[i] && window.COURSE_DATA[i].code;
            if(code && window.SUBJECT_DETAILS_DATA && window.SUBJECT_DETAILS_DATA[code]) delete window.SUBJECT_DETAILS_DATA[code];
            window.COURSE_DATA.splice(i,1);
            cIdx=0;
            renderSubjects(); renderEditor(); 
            markDirty();
        } 
    }

    window.saveData = () => {
        let content = "window.CONFIG = " + JSON.stringify(window.CONFIG, null, 4) + ";\n\n";
        content += "window.COURSE_DATA = " + JSON.stringify(window.COURSE_DATA, null, 4) + ";\n\n";
        content += "window.SUBJECT_DETAILS_DATA = " + JSON.stringify(window.SUBJECT_DETAILS_DATA || {}, null, 4) + ";\n\n";
        content += "window.SCHEDULE_DATA = " + JSON.stringify(window.SCHEDULE_DATA, null, 4) + ";\n\n";
        content += "window.MIDTERM_DATA = " + JSON.stringify(window.MIDTERM_DATA, null, 4) + ";\n\n";
        content += "window.FINAL_DATA = " + JSON.stringify(window.FINAL_DATA, null, 4) + ";\n\n";
        content += "window.STAFF_DATA = " + JSON.stringify(window.STAFF_DATA, null, 4) + ";\n\n";
        content += "window.TIMETABLE_DATA = " + JSON.stringify(window.TIMETABLE_DATA, null, 4) + ";\n\n";
        content += "window.UPDATES_DATA = " + JSON.stringify(window.UPDATES_DATA || [], null, 4) + ";";
        content += "\n\nwindow.NEWS_DATA = " + JSON.stringify(window.NEWS_DATA || [], null, 4) + ";";
        const blob = new Blob([content], {type: "text/javascript"});
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "course_data.js"; a.click();
    };

    // --- USEFUL LINKS MANAGER ---
    let ulSubIdx = 0; let ulLinkIdx = 0;

    function renderUsefulLinksManager(options = {}) {
        const preserveScroll = options.preserveScroll !== false;
        const skipEditorRender = options.skipEditor === true;
        const existingList = document.getElementById('ul-links-list');
        const previousScrollTop = preserveScroll && existingList ? existingList.scrollTop : 0;
        const mid = document.getElementById('middle-col');
        const sub = window.COURSE_DATA[ulSubIdx];
        if(!sub) return;
        if(!sub.playlists) sub.playlists = [];
        
        // Subject selector tabs at top
        let html = `<div class="panel-header" style="background:#b519d6; color:white;">USEFUL LINKS</div>`;
        html += `<div style="display:flex; overflow-x:auto; background:#1a0d2e; border-bottom:1px solid #2a1b3d; padding:4px 6px; gap:4px;">`;
        window.COURSE_DATA.forEach((s, i) => {
            const count = (s.playlists || []).length;
            const isActive = i === ulSubIdx;
            html += `<button style="flex-shrink:0; padding:5px 10px; border-radius:6px; border:1px solid ${isActive ? '#b519d6' : '#333'}; background:${isActive ? 'rgba(181,25,214,0.25)' : 'transparent'}; color:${isActive ? '#d77bff' : '#888'}; font-size:0.7rem; font-weight:${isActive?'bold':'normal'}; cursor:pointer; white-space:nowrap;" onclick="ulSubIdx=${i}; ulLinkIdx=-1; renderUsefulLinksManager();">${s.code} <span style='opacity:0.5;'>${count}</span></button>`;
        });
        html += `</div>`;
        
        // Links list with badges, groups, icons, reorder
        html += `<div class="list-container" id="ul-links-list" style="flex:1; overflow-y:auto;"></div>`;
        html += `<div style="padding:8px;"><button class="btn btn-add" style="width:100%;" onclick="addUsefulLink()">+ Add Useful Link to ${sub.code}</button></div>`;
        mid.innerHTML = html;
        
        const list = document.getElementById('ul-links-list');
        let lastGroup = null;
        sub.playlists.forEach((pl, i) => {
            // Migrate old format
            if (!pl.badges && pl.badgeText) { pl.badges = [{text: pl.badgeText, color: pl.badgeColor || '#e91e8c'}]; delete pl.badgeText; delete pl.badgeColor; }
            if (!pl.badges) pl.badges = [];
            
            const group = (pl.group || '').trim();
            if (group && group !== lastGroup) {
                const groupCount = sub.playlists.filter(p => (p.group||'').trim() === group).length;
                const gh = document.createElement('div');
                gh.style.cssText = 'padding:8px 12px; font-size:0.75rem; color:#4a90e2; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-top:1px solid rgba(74,144,226,0.25); margin-top:4px; display:flex; align-items:center; gap:6px;';
                gh.innerHTML = `📁 ${group} <span style="font-size:0.6rem; color:#888; font-weight:normal; text-transform:none;">(${groupCount})</span>`;
                list.appendChild(gh);
            }
            lastGroup = group;
            
            const el = document.createElement('div');
            el.className = `list-item ${i === ulLinkIdx ? 'active' : ''}`;
            el.draggable = true;
            el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('ulIdx', i); });
            el.addEventListener('dragover', (e) => e.preventDefault());
            el.addEventListener('drop', (e) => {
                e.stopPropagation();
                const srcIdx = parseInt(e.dataTransfer.getData('ulIdx'));
                if (isNaN(srcIdx) || srcIdx === i) return;
                const item = sub.playlists.splice(srcIdx, 1)[0];
                sub.playlists.splice(i, 0, item);
                ulLinkIdx = i;
                markDirty();
                renderUsefulLinksManager();
            });
            
            const badgePills = pl.badges.filter(b=>b.text).map(b => `<span style="background:${b.color||'#e91e8c'}; color:#fff; font-size:0.55rem; padding:1px 5px; border-radius:4px; font-weight:700; white-space:nowrap;">${b.text}</span>`).join('');
            const groupTag = group ? `<span style="font-size:0.55rem; color:#4a90e2; border:1px solid rgba(74,144,226,0.3); padding:1px 5px; border-radius:4px; white-space:nowrap;">📁</span>` : '';
            
            el.innerHTML = `<span class="drag-handle">☰</span><span style="font-size:1rem;">${pl.icon || '🔗'}</span><div style="flex:1; min-width:0;"><div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pl.title || 'Link'}</div><div style="display:flex; gap:3px; flex-wrap:wrap; margin-top:2px;">${badgePills}${groupTag}</div></div><button class="btn-move" onclick="event.stopPropagation(); moveUL(${i},-1)">▲</button><button class="btn-move" onclick="event.stopPropagation(); moveUL(${i},1)">▼</button><button class="btn btn-del" onclick="event.stopPropagation(); delUsefulLink(${i})">✕</button>`;
            el.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { ulLinkIdx = i; renderUsefulLinksManager({ preserveScroll: true }); renderUsefulLinksEditor(); } };
            list.appendChild(el);
        });

        if (preserveScroll) list.scrollTop = previousScrollTop;
        
        if (!skipEditorRender) renderUsefulLinksEditor();
    }

    function renderUsefulLinksEditor() {
        const container = document.getElementById('editor-area');
        if(!window.COURSE_DATA[ulSubIdx]) { container.innerHTML = ''; return; }
        const sub = window.COURSE_DATA[ulSubIdx];
        if(!sub.playlists) sub.playlists = [];
        const p = sub.playlists[ulLinkIdx];
        
        if (!p) {
            container.innerHTML = `<div class="form-section" style="border-color:#b519d6;"><h3 style="color:#b519d6;">🔗 ${sub.code} - ${sub.name}</h3><p style="color:#888; font-style:italic;">Select a link from the list or add a new one.</p></div>`;
            return;
        }
        
        // Migrate old format
        if (!p.badges && p.badgeText) { p.badges = [{text: p.badgeText, color: p.badgeColor || '#e91e8c'}]; delete p.badgeText; delete p.badgeColor; }
        if (!p.badges) p.badges = [];
        
        let html = `<div class="form-section" style="border-color:#b519d6;"><h3 style="color:#b519d6;">🔗 Edit Link #${ulLinkIdx+1} in ${sub.code}</h3>`;
        html += `<div style="display:grid; grid-template-columns: 60px 1fr; gap:10px;">`;
        html += `<div><label>Icon</label><div style="position:relative;"><input type="text" style="text-align:center;" value="${p.icon || '🔗'}" oninput="window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx].icon=this.value; markDirty(); renderUsefulLinksManager({ preserveScroll: true, skipEditor: true });" onfocus="showEmojiPicker(this)"><div class="emoji-picker-dropdown" style="display:none;"></div></div></div>`;
        html += `<div><label>Title</label><input type="text" value="${p.title || ''}" oninput="window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx].title=this.value; markDirty(); renderUsefulLinksManager({ preserveScroll: true, skipEditor: true });"></div></div>`;
        html += `<label>Link (URL)</label><input type="text" placeholder="https://..." value="${p.link || ''}" oninput="window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx].link=this.value; markDirty();">`;
        html += `<label>Group <span style="font-size:0.75rem; color:#888; font-weight:normal;">(playlists with the same group name appear together)</span></label><input type="text" placeholder="e.g. Dr. Manal Morad" value="${p.group || ''}" oninput="window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx].group=this.value; markDirty(); renderUsefulLinksManager({ preserveScroll: true, skipEditor: true });">`;
        html += `<label>Description / Note</label><textarea rows="2" placeholder="Notes about this link..." oninput="window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx].note=this.value; markDirty();">${p.note || ''}</textarea>`;
        html += `<div style="background:#150a25; padding:10px; border-radius:8px; margin-top:10px;"><div style="display:flex; justify-content:space-between; align-items:center;"><label style="font-weight:bold; color:#b519d6;">Badges:</label><button class="btn btn-add" style="font-size:0.75rem; padding:3px 10px;" onclick="addULBadge()">+ Badge</button></div><div id="ul-badges-list" style="margin-top:8px;"></div></div>`;
        html += `</div>`;
        container.innerHTML = html;
        renderULBadges();
    }
    
    function renderULBadges() {
        const container = document.getElementById('ul-badges-list');
        if (!container) return;
        const p = window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx];
        if (!p) return;
        if (!p.badges) p.badges = [];
        container.innerHTML = '';
        p.badges.forEach((b, i) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid; grid-template-columns:1fr 50px 30px; gap:6px; margin-bottom:5px; align-items:center;';
            row.innerHTML = `<input type="text" value="${b.text||''}" placeholder="Badge text" oninput="window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx].badges[${i}].text=this.value; markDirty(); renderUsefulLinksManager({ preserveScroll: true, skipEditor: true });"><input type="color" value="${b.color||'#e91e8c'}" oninput="window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx].badges[${i}].color=this.value; markDirty(); renderUsefulLinksManager({ preserveScroll: true, skipEditor: true });" style="height:32px;cursor:pointer;"><button class="btn btn-del" style="padding:2px 6px;font-size:0.8rem;" onclick="window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx].badges.splice(${i},1); markDirty(); renderULBadges(); renderUsefulLinksManager();">✕</button>`;
            container.appendChild(row);
        });
        if (p.badges.length === 0) {
            container.innerHTML = '<div style="color:#666; font-size:0.8rem; font-style:italic;">No badges. Click + Badge to add one.</div>';
        }
    }
    
    function addULBadge() {
        const p = window.COURSE_DATA[ulSubIdx].playlists[ulLinkIdx];
        if (!p) return;
        if (!p.badges) p.badges = [];
        p.badges.push({text: '', color: '#e91e8c'});
        markDirty();
        renderULBadges();
        renderUsefulLinksManager();
    }
    
    function moveUL(idx, dir) {
        const arr = window.COURSE_DATA[ulSubIdx].playlists;
        if (idx + dir < 0 || idx + dir >= arr.length) return;
        [arr[idx], arr[idx+dir]] = [arr[idx+dir], arr[idx]];
        if (ulLinkIdx === idx) ulLinkIdx += dir;
        markDirty();
        renderUsefulLinksManager();
    }

    function addUsefulLink() {
        window.COURSE_DATA[ulSubIdx].playlists.push({ title: "New Link", link: "#", icon: "🔗", note: "", badges: [] });
        ulLinkIdx = window.COURSE_DATA[ulSubIdx].playlists.length - 1;
        markDirty();
        renderUsefulLinksManager();
    }

    function delUsefulLink(i) {
        if(confirm("Delete this link?")) {
            window.COURSE_DATA[ulSubIdx].playlists.splice(i, 1);
            if (ulLinkIdx >= window.COURSE_DATA[ulSubIdx].playlists.length) ulLinkIdx = window.COURSE_DATA[ulSubIdx].playlists.length - 1;
            markDirty();
            renderUsefulLinksManager();
        }
    }

    // --- STAFF CONTACTS MANAGER ---
    let staffAdminSubject = null;

    function toggleStaffDirectory() { setView('staff'); renderStaffManager(); closeSidebar(); }

    function renderStaffManager() {
        const mid = document.getElementById('middle-col');
        mid.style.display = 'flex';

        if(typeof window.STAFF_DATA === 'undefined') window.STAFF_DATA = [];

        // Middle column: list of subjects
        let midHtml = `<div class="panel-header" style="background:#34c759; color:black;">👥 STAFF CONTACTS</div>`;
        midHtml += `<div class="list-container">`;
        midHtml += `<div class="list-item ${staffAdminSubject===null?'active':''}" style="${staffAdminSubject===null?'border-left:5px solid #34c759;':''}" onclick="staffAdminSubject=null; renderStaffManager(); renderStaffEditor();">
            <div style="flex:1; ${staffAdminSubject===null?'':'color:#34c759'}">📋 All Staff</div>
            <span style="font-size:0.7rem; background:#333; padding:2px 6px; border-radius:4px;">${window.STAFF_DATA.length}</span>
        </div>`;
        window.COURSE_DATA.forEach(sub => {
            const count = window.STAFF_DATA.filter(p => (p.subjects || []).includes(sub.code)).length;
            const active = staffAdminSubject === sub.code;
            const color = sub.color || '#34c759';
            midHtml += `<div class="list-item ${active?'active':''}" style="${active?'border-left:5px solid '+color+';':''}" onclick="staffAdminSubject='${sub.code}'; renderStaffManager(); renderStaffEditor();">
                <div style="width:8px; height:8px; border-radius:50%; background:${color}; flex-shrink:0;"></div>
                <div style="flex:1; ${active?'':'color:'+color}">${sub.code} - ${sub.name}</div>
                <span style="font-size:0.7rem; background:#333; padding:2px 6px; border-radius:4px;">${count}</span>
            </div>`;
        });
        midHtml += `</div>`;
        mid.innerHTML = midHtml;

        renderStaffEditor();
    }

    function renderStaffEditor() {
        const container = document.getElementById('editor-area');
        if(typeof window.STAFF_DATA === 'undefined') window.STAFF_DATA = [];

        let filtered;
        let title, color;
        if (staffAdminSubject === null) {
            filtered = window.STAFF_DATA.map((p,i) => ({...p, _idx:i}));
            title = 'All Staff Members';
            color = '#34c759';
        } else {
            filtered = window.STAFF_DATA.map((p,i) => ({...p, _idx:i})).filter(p => (p.subjects || []).includes(staffAdminSubject));
            const sub = window.COURSE_DATA.find(s => s.code === staffAdminSubject);
            title = sub ? sub.code + ' - ' + sub.name : staffAdminSubject;
            color = sub ? (sub.color || '#34c759') : '#34c759';
        }

        let subOptions = '';
        window.COURSE_DATA.forEach(sub => { subOptions += `<option value="${sub.code}">${sub.code} - ${sub.name}</option>`; });

        let html = `
            <div class="form-section" style="border-color:${color};">
                <h3 style="color:${color};">👥 ${title}</h3>
                ${makeHelpBox('staff', 'Staff members appear in the Directory page on the site. Each person has a name, role, photo, email, Teams link, and can be assigned to one or more subjects. Use the left panel to filter by subject. Students can filter by subject or role on the site.')}
                <p style="color:#888; font-size:0.85rem; margin-bottom:15px;">${filtered.length} staff member${filtered.length !== 1 ? 's' : ''}${staffAdminSubject ? ' in this subject' : ' total'}.</p>
                <div id="staff-list-admin"></div>
                <button class="btn btn-add" style="background:${color}; color:${color==='#ffcc00'?'black':'white'}; border-radius:4px; margin-top:15px;" onclick="addStaffMember()">+ Add Staff Member</button>
            </div>
        `;
        container.innerHTML = html;

        const list = document.getElementById('staff-list-admin');
        filtered.forEach(person => {
            const i = person._idx;
            const el = document.createElement('div');
            el.className = 'res-item';
            el.style.flexDirection = 'column';
            const roleColor = person.role === 'doctor' ? '#007aff' : '#34c759';
            el.style.borderLeft = `4px solid ${roleColor}`;

            // Build subject checkboxes
            let subCheckboxes = '';
            window.COURSE_DATA.forEach(sub => {
                const checked = (person.subjects || []).includes(sub.code) ? 'checked' : '';
                subCheckboxes += `<label class="checkbox-label"><input type="checkbox" ${checked} onchange="toggleStaffSubject(${i}, '${sub.code}', this.checked)"> ${sub.code}</label>`;
            });

            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom:10px; gap:10px; flex-wrap:wrap;">
                    <strong style="color:white;">${person.name || 'New Staff'}</strong>
                    <button class="btn btn-del" onclick="delStaffMember(${i})">✕ Remove</button>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; width:100%;">
                    <div>
                        <label>Name</label>
                        <input type="text" value="${person.name || ''}" oninput="window.STAFF_DATA[${i}].name=this.value; markDirty();">
                    </div>
                    <div>
                        <label>Role</label>
                        <select onchange="window.STAFF_DATA[${i}].role=this.value; markDirty(); renderStaffManager();">
                            <option value="doctor" ${person.role === 'doctor' ? 'selected' : ''}>🎓 Doctor</option>
                            <option value="ta" ${person.role === 'ta' ? 'selected' : ''}>👨‍🏫 TA</option>
                        </select>
                    </div>
                </div>
                <div style="width:100%;">
                    <label>Subjects</label>
                    <div class="checkbox-row" style="background:#150a25; padding:8px; border-radius:6px;">${subCheckboxes}</div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; width:100%;">
                    <div>
                        <label>Teams Link (Optional)</label>
                        <input type="text" placeholder="https://teams.microsoft.com/..." value="${person.teamsLink || ''}" oninput="window.STAFF_DATA[${i}].teamsLink=this.value; markDirty();">
                    </div>
                    <div>
                        <label>Note (Optional)</label>
                        <input type="text" placeholder="e.g. Office hours: Mon 2-4 PM" value="${person.note || ''}" oninput="window.STAFF_DATA[${i}].note=this.value; markDirty();">
                    </div>
                </div>
            `;
            list.appendChild(el);
        });

        if(filtered.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:#666; margin-top:20px; font-style:italic;">No staff members' + (staffAdminSubject ? ' for this subject' : '') + ' yet.</div>';
        }
    }

    function addStaffMember() {
        const subs = staffAdminSubject ? [staffAdminSubject] : [];
        window.STAFF_DATA.push({ name: "New Staff", role: "ta", subjects: subs, teamsLink: "", note: "" });
        markDirty();
        renderStaffManager();
    }

    function delStaffMember(i) {
        if(confirm("Remove this staff member?")) {
            window.STAFF_DATA.splice(i, 1);
            markDirty();
            renderStaffManager();
        }
    }

    function toggleStaffSubject(staffIdx, subCode, checked) {
        const person = window.STAFF_DATA[staffIdx];
        if(!person.subjects) person.subjects = [];
        if(checked && !person.subjects.includes(subCode)) {
            person.subjects.push(subCode);
        } else if(!checked) {
            person.subjects = person.subjects.filter(s => s !== subCode);
        }
        markDirty();
    }

    // --- TIMETABLE MANAGER ---
    let ttAdminSection = '3-4';
    let ttAdminView = 'subject'; // 'subject' or 'day'
    let ttAdminSubject = null;
    let ttAdminDay = 0;

    const TT_ADMIN_COLORS = {
        'Operating Systems':'#00e5ff','Computer Networks':'#4a90e2','Data Structures':'#34c759','Database Systems':'#ff9500',
        'Machine Learning':'#e91e8c','Artificial Intelligence':'#b519d6','Computer Architecture':'#ff375f',
        'Quantum Computing':'#5e5ce6','Robotics Engineering':'#ffcc00','Software Testing':'#64d2ff'
    };

    function toggleTimetableManager() { setView('timetable'); renderTimetableManager(); closeSidebar(); }

    function renderTimetableManager() {
        const mid = document.getElementById('middle-col');
        mid.style.display = 'flex';
        const TD = window.TIMETABLE_DATA;
        const entries = TD.sections[ttAdminSection] || [];
        const days = TD.days;
        const timeSlots = TD.timeSlots.normal;
        const subjects = TD.subjects;

        // Middle column: section + view mode + list of subjects or days
        let midHtml = `<div class="panel-header" style="background:#ff375f; color:white; flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span>🗓️ TIMETABLE</span>
                <div style="display:flex; gap:4px;">
                    ${Object.keys(TD.sections).map(s => `<button class="btn" style="background:${ttAdminSection===s?'white':'rgba(255,255,255,0.2)'}; color:${ttAdminSection===s?'#ff375f':'white'}; padding:3px 12px; font-size:0.75rem;" onclick="ttAdminSection='${s}'; ttAdminDay=0; renderTimetableManager();">${s}</button>`).join('')}
                </div>
            </div>
            <div style="display:flex; gap:4px;">
                <button class="btn" style="flex:1; background:${ttAdminView==='subject'?'white':'rgba(255,255,255,0.2)'}; color:${ttAdminView==='subject'?'#ff375f':'white'}; padding:5px; font-size:0.75rem;" onclick="ttAdminView='subject'; renderTimetableManager();">By Subject</button>
                <button class="btn" style="flex:1; background:${ttAdminView==='day'?'white':'rgba(255,255,255,0.2)'}; color:${ttAdminView==='day'?'#ff375f':'white'}; padding:5px; font-size:0.75rem;" onclick="ttAdminView='day'; ttAdminDay=0; renderTimetableManager();">By Day</button>
            </div>
        </div>`;
        midHtml += `<div class="list-container">`;

        if (ttAdminView === 'subject') {
            subjects.forEach(sub => {
                const count = entries.filter(e => e.subject === sub).length;
                const color = TT_ADMIN_COLORS[sub] || '#aaa';
                const active = ttAdminSubject === sub;
                midHtml += `<div class="list-item ${active?'active':''}" style="${active ? 'border-left:5px solid '+color+';' : ''}" onclick="ttAdminSubject='${sub}'; renderTimetableManager(); renderTtEditor();">
                    <div style="width:8px; height:8px; border-radius:50%; background:${color}; flex-shrink:0;"></div>
                    <div style="flex:1; ${active?'':'color:'+color}">${sub}</div>
                    <span style="font-size:0.7rem; background:#333; padding:2px 6px; border-radius:4px;">${count}</span>
                </div>`;
            });
        } else {
            days.forEach((day, di) => {
                const count = entries.filter(e => e.day === di).length;
                const active = ttAdminDay === di;
                midHtml += `<div class="list-item ${active?'active':''}" onclick="ttAdminDay=${di}; renderTimetableManager(); renderTtEditor();">
                    <div style="flex:1">${day}</div>
                    <span style="font-size:0.7rem; background:#333; padding:2px 6px; border-radius:4px;">${count}</span>
                </div>`;
            });
        }
        midHtml += `</div>`;
        mid.innerHTML = midHtml;

        renderTtEditor();
    }

    function renderTtEditor() {
        const TD = window.TIMETABLE_DATA;
        const allEntries = TD.sections[ttAdminSection] || [];
        const days = TD.days;
        const timeSlots = TD.timeSlots.normal;
        const subjects = TD.subjects;
        const container = document.getElementById('editor-area');
        container.scrollTo({top:0, behavior:'smooth'});

        let filtered;
        let title, color;
        if (ttAdminView === 'subject') {
            if (!ttAdminSubject) { container.innerHTML = '<div style="text-align:center; color:#666; margin-top:50px;">Select a subject from the list.</div>'; return; }
            filtered = allEntries.map((e,i) => ({...e, _idx:i})).filter(e => e.subject === ttAdminSubject);
            color = TT_ADMIN_COLORS[ttAdminSubject] || '#ff375f';
            title = ttAdminSubject;
        } else {
            filtered = allEntries.map((e,i) => ({...e, _idx:i})).filter(e => e.day === ttAdminDay);
            color = '#ff375f';
            title = days[ttAdminDay];
        }
        // Sort by time slot so earliest periods appear first
        filtered.sort((a, b) => a.slot - b.slot);

        let html = `<div class="form-section" style="border-color:${color};">
            <h3 style="color:${color};">🗓️ ${title} <span style="font-size:0.8rem; color:#888; font-weight:normal;">— Section ${ttAdminSection}</span></h3>
            ${makeHelpBox('timetable', 'The timetable appears on the Timetable page and powers the Screenshot Studio. Each entry is one class slot: choose subject, type (lecture/tutorial/lab), day, and time slot. Sections (e.g. A, B) let different student groups see different schedules. The Screenshot Studio lets students export a custom timetable image.')}`;

        if (filtered.length === 0) {
            html += '<div style="text-align:center; color:#666; margin:20px 0; font-style:italic;">No entries yet.</div>';
        }

        filtered.forEach(entry => {
            const i = entry._idx;
            const typeLabel = {lec:'Lecture', tut:'Tutorial', lab:'Lab'}[entry.type] || entry.type;
            const typeColor = {lec:'#6ab4ff', tut:'#ffb347', lab:'#5cdb7f'}[entry.type] || '#aaa';
            let subOpts = subjects.map(s => `<option value="${s}" ${entry.subject===s?'selected':''}>${s}</option>`).join('');
            let dayOpts = days.map((d,di) => `<option value="${di}" ${entry.day===di?'selected':''}>${d}</option>`).join('');
            let slotOpts = timeSlots.map((t,si) => `<option value="${si}" ${entry.slot===si?'selected':''}>${t}</option>`).join('');
            html += `<div style="background:#150a25; padding:15px; margin-bottom:10px; border-radius:8px; border:1px solid #333; border-left:4px solid ${typeColor};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:bold; color:${typeColor};">${typeLabel}${entry.room ? ' · '+entry.room : ''}</span>
                    <button class="btn btn-del" onclick="delTtEntry(${i})">✕</button>
                </div>
                <div style="display:grid; grid-template-columns:${ttAdminView==='subject'?'1fr 1fr 1fr':'2fr 1fr 1fr'}; gap:10px;">
                    ${ttAdminView==='subject' ?
                        `<div><label>Type</label><select onchange="updateTtEntry(${i},'type',this.value); renderTtEditor();"><option value="lec" ${entry.type==='lec'?'selected':''}>Lecture</option><option value="tut" ${entry.type==='tut'?'selected':''}>Tutorial</option><option value="lab" ${entry.type==='lab'?'selected':''}>Lab</option></select></div>
                         <div><label>Day</label><select onchange="updateTtEntry(${i},'day',parseInt(this.value)); renderTtEditor();">${dayOpts}</select></div>
                         <div><label>Time Slot</label><select onchange="updateTtEntry(${i},'slot',parseInt(this.value)); renderTtEditor();">${slotOpts}</select></div>` :
                        `<div><label>Subject</label><select onchange="updateTtEntry(${i},'subject',this.value); renderTtEditor();">${subOpts}</select></div>
                         <div><label>Type</label><select onchange="updateTtEntry(${i},'type',this.value); renderTtEditor();"><option value="lec" ${entry.type==='lec'?'selected':''}>Lecture</option><option value="tut" ${entry.type==='tut'?'selected':''}>Tutorial</option><option value="lab" ${entry.type==='lab'?'selected':''}>Lab</option></select></div>
                         <div><label>Time Slot</label><select onchange="updateTtEntry(${i},'slot',parseInt(this.value)); renderTtEditor();">${slotOpts}</select></div>`
                    }
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                    <div><label>Room</label><input type="text" value="${entry.room||''}" oninput="updateTtEntry(${i},'room',this.value)"></div>
                    <div><label>Note</label><input type="text" placeholder="e.g. Dr. Name" value="${entry.note||''}" oninput="updateTtEntry(${i},'note',this.value)"></div>
                </div>
                <div class="checkbox-row" style="margin-top:8px;">
                    <label class="checkbox-label"><input type="checkbox" ${entry.alternating?'checked':''} onchange="updateTtEntry(${i},'alternating',this.checked)"> Alternating</label>
                    <label class="checkbox-label"><input type="checkbox" ${entry.backup?'checked':''} onchange="updateTtEntry(${i},'backup',this.checked)"> Backup</label>
                </div>
            </div>`;
        });

        html += `<button class="btn btn-add" style="background:${color}; color:${color==='#ffcc00'?'black':'white'}; border-radius:4px; margin-top:10px;" onclick="addTtEntry()">+ Add Entry</button>`;
        html += '</div>';
        container.innerHTML = html;
    }

    function addTtEntry() {
        const TD = window.TIMETABLE_DATA;
        if(!TD.sections[ttAdminSection]) TD.sections[ttAdminSection] = [];
        const newEntry = { subject: ttAdminSubject || TD.subjects[0], type:'lec', day: ttAdminView==='day' ? ttAdminDay : 0, slot:0, room:'', alternating:false, backup:false, note:'' };
        TD.sections[ttAdminSection].push(newEntry);
        markDirty(); renderTimetableManager();
    }
    function delTtEntry(i) {
        if(confirm('Remove this entry?')) { window.TIMETABLE_DATA.sections[ttAdminSection].splice(i,1); markDirty(); renderTimetableManager(); }
    }
    function updateTtEntry(i, key, val) {
        window.TIMETABLE_DATA.sections[ttAdminSection][i][key] = val; markDirty();
    }

    // --- UPDATES/CHANGELOG MANAGER ---
    function normalizeDateInputValue(raw) {
        if (!raw) return '';
        const text = String(raw).trim();
        const m = text.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
        const d = new Date(text);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        return '';
    }

    function toggleUpdatesManager() { setView('updates'); renderAnnouncementsManager(); closeSidebar(); }

    function renderAnnouncementsManager() {
        const mid = document.getElementById('middle-col');
        mid.style.display = 'none';
        if(typeof window.UPDATES_DATA === 'undefined') window.UPDATES_DATA = [];
        if(typeof window.NEWS_DATA === 'undefined') window.NEWS_DATA = [];

        const container = document.getElementById('editor-area');
        adminAnnounceTab = 'news'; const isNews = true;
        const newsCount = (window.NEWS_DATA || []).length;
        const updatesCount = (window.UPDATES_DATA || []).length;

        const tabHtml = '';

        container.innerHTML = `
            <div class="form-section" style="border-color:${isNews ? '#e91e8c' : '#af52de'};">
                <h3 style="color:${isNews ? '#e91e8c' : '#af52de'};">📣 Manage Announcements</h3>
                ${makeHelpBox('announcements', 'Announcements appear in the 🔔 news panel on the site with an unread badge counter. Students see the title, body, and optional link.')}
                ${tabHtml}
                <div id="announce-content"></div>
            </div>`;

        const content = document.getElementById('announce-content');

        if (isNews) {
            const actionRow = document.createElement('div');
            actionRow.style.cssText = 'display:flex; gap:8px; margin-bottom:15px; flex-wrap:wrap;';
            actionRow.innerHTML = `
                <button class="btn btn-add" style="background:#e91e8c; color:white; border-radius:4px;" onclick="addNewsEntry()">＋ Add Announcement</button>
                <button class="btn" style="background:rgba(255,59,48,0.15); border:1px solid rgba(255,59,48,0.4); color:#ff3b30; padding:6px 14px; border-radius:6px; font-size:0.8rem; cursor:pointer;" onclick="cleanUpOldNews()" title="Remove all announcements published more than 7 days ago">🗑 Clean Up Old (&gt;7 days)</button>`;
            content.appendChild(actionRow);

            if(window.NEWS_DATA.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'text-align:center; color:#666; margin:20px 0; font-style:italic;';
                empty.textContent = 'No announcements yet.';
                content.appendChild(empty);
            }
            const NEWS_EMOJIS = ['📢','📣','✅','❌','⚠️','🎓','📝','🚫','🔔','⏰','📅','🗒️','💯','🎉','🔴','🟡','🟢','📊','🏫','💬','📌','❗','🛑','✏️','📋','🔖'];
            window.NEWS_DATA.forEach((item, i) => {
                const el = document.createElement('div');
                el.className = 'res-item';
                el.style.cssText = 'flex-direction:column; border-left:4px solid #e91e8c; margin-bottom:18px;';
                const subOptions = (window.COURSE_DATA || []).map(s => `<option value="${s.code}" ${item.sub === s.code ? 'selected' : ''}>${s.code}</option>`).join('');
                const emojiOpts = NEWS_EMOJIS.map(em => `<button title="${em}" onclick="window.NEWS_DATA[${i}].emoji='${em}';markDirty();renderAnnouncementsManager();" style="background:none;border:none;cursor:pointer;font-size:1.2rem;padding:3px 5px;border-radius:5px;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='none'">${em}</button>`).join('');
                const publishedHint = getNewsPcDeltaLabel(item.publishedAt);
                el.innerHTML = `
                    <div style="display:flex;justify-content:space-between;width:100%;align-items:center;margin-bottom:12px;">
                        <strong style="color:#e91e8c;">${item.emoji||'📢'} ${item.title||'Announcement'}</strong>
                        <button class="btn btn-del" onclick="window.NEWS_DATA.splice(${i},1);markDirty();renderAnnouncementsManager();">✕ Remove</button>
                    </div>
                    <div style="background:#0a0012;border-radius:6px;padding:6px;margin-bottom:10px;display:flex;flex-wrap:wrap;">${emojiOpts}</div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                        <div style="flex:1;min-width:180px;"><label>Title</label><input type="text" value="${escAttr(item.title||'')}" oninput="window.NEWS_DATA[${i}].title=this.value;markDirty();"></div>
                        <div style="flex:0 0 160px;"><label>Subject (opt.)</label><select onchange="window.NEWS_DATA[${i}].sub=this.value;markDirty();"><option value="">— All —</option>${subOptions}</select></div>
                    </div>
                    <div style="margin-bottom:8px;"><label>Body / Note</label><textarea rows="2" oninput="window.NEWS_DATA[${i}].body=this.value;markDirty();">${escHtml(item.body||'')}</textarea></div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                        <div style="flex:1;min-width:160px;"><label>Link URL (opt.)</label><input type="text" placeholder="https://..." value="${escAttr(item.link||'')}" oninput="window.NEWS_DATA[${i}].link=this.value;markDirty();"></div>
                        <div style="flex:1;min-width:140px;"><label>Link Note (opt.)</label><input type="text" placeholder="Open Form / Join Meeting" value="${escAttr(item.linkNote||'')}" oninput="window.NEWS_DATA[${i}].linkNote=this.value;markDirty();"></div>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:5px;background:#2a1b3d;padding:4px 8px;border-radius:4px;border:1px solid #444;">
                            <label style="margin:0;font-size:0.8rem;color:#aaa;">Published At</label>
                            <input type="datetime-local" value="${getPublishedAtInputValue(item.publishedAt)}" style="background:transparent;border:none;color:white;font-size:0.8rem;cursor:pointer;" oninput="setNewsPublishedAtFromInput(${i},this.value);markDirty();">
                            <button class="btn-time" onclick="setNewsNowPublished(${i});renderAnnouncementsManager();">🕒</button>
                        </div>
                        <span style="font-size:0.72rem;color:#666;">${publishedHint}</span>
                    </div>`;
                content.appendChild(el);
            });
        } else {
            // Updates tab
            const addBtn = document.createElement('div');
            addBtn.style.marginBottom = '15px';
            addBtn.innerHTML = `<button class="btn btn-add" style="background:#af52de; color:white; border-radius:4px;" onclick="addUpdateEntry()">＋ Add Update</button>`;
            content.appendChild(addBtn);

            if(window.UPDATES_DATA.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'text-align:center; color:#666; margin:20px 0; font-style:italic;';
                empty.textContent = 'No updates added yet.';
                content.appendChild(empty);
            }
            window.UPDATES_DATA.forEach((item, i) => {
                const el = document.createElement('div');
                el.className = 'res-item';
                el.style.cssText = 'flex-direction:column; border-left:4px solid #af52de;';
                el.innerHTML = `
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom:10px;">
                        <strong style="color:white;">${item.icon||'🚀'} ${item.title||'Update'}</strong>
                        <button class="btn btn-del" onclick="if(confirm('Remove this update?')){window.UPDATES_DATA.splice(${i},1);markDirty();renderAnnouncementsManager();}">✕ Remove</button>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
                        <div style="position:relative; flex:0 0 60px;"><label>Icon</label><input type="text" value="${item.icon||''}" style="width:100%;text-align:center;cursor:pointer;padding:8px 4px;" onfocus="showEmojiPicker(this)" oninput="window.UPDATES_DATA[${i}].icon=this.value;markDirty();"><div class="emoji-picker-dropdown" style="display:none;"></div></div>
                        <div style="flex:1;min-width:160px;"><label>Title</label><input type="text" value="${escAttr(item.title||'')}" oninput="window.UPDATES_DATA[${i}].title=this.value;markDirty();"></div>
                        <div style="flex:0 0 190px;"><label>Date</label><input type="date" value="${normalizeDateInputValue(item.date)}" style="padding:8px 10px;color-scheme:dark;" oninput="window.UPDATES_DATA[${i}].date=this.value||'';markDirty();"></div>
                    </div>
                    <div><label>Description</label><textarea rows="2" oninput="window.UPDATES_DATA[${i}].desc=this.value;markDirty();">${escHtml(item.desc||'')}</textarea></div>`;
                content.appendChild(el);
            });
        }
    }

    function addUpdateEntry() {
        window.UPDATES_DATA.push({ icon: '🚀', title: 'New Update', desc: '', date: new Date().toISOString().slice(0,10) });
        markDirty();
        renderAnnouncementsManager();
    }

    function cleanUpOldNews() {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const before = window.NEWS_DATA.length;
        window.NEWS_DATA = window.NEWS_DATA.filter(item => {
            if (!item.publishedAt) return true; // no date = keep
            const ts = new Date(item.publishedAt).getTime();
            return isNaN(ts) || ts >= cutoff;
        });
        const removed = before - window.NEWS_DATA.length;
        markDirty();
        renderAnnouncementsManager();
        if (removed > 0) alert(`Removed ${removed} old announcement${removed > 1 ? 's' : ''} (published more than 7 days ago).`);
        else alert('Nothing to remove — all announcements are within the last 7 days.');
    }


    function addNewsEntry() {
        if(typeof window.NEWS_DATA === 'undefined') window.NEWS_DATA = [];
        window.NEWS_DATA.unshift({ emoji:'📢', title:'New Announcement', body:'', publishedAt: getNowLocalDateTimeString(), sub:'', link:'', linkNote:'', hasDeadline:false, deadlineDate:'', deadlineTime:'' });
        markDirty();
        renderAnnouncementsManager();
    }

    function delNewsEntry(i) {
        if(confirm('Remove this announcement?')) { window.NEWS_DATA.splice(i,1); markDirty(); renderAnnouncementsManager(); }
    }

    function autoDetectDateTime(idx, type) {
        if(typeof window.NEWS_DATA === 'undefined') window.NEWS_DATA = [];
        const item = window.NEWS_DATA[idx];
        if (!item || !item.body) {
            alert('Please enter some text in the Body / Note first.');
            return;
        }
        
        const txt = item.body.toLowerCase();
        let foundDate = null;
        let foundTime = null;
        // Robust time extraction: 9:30 am, 9 am, 21:00, 9pm, 9:00PM, etc.
        const timeRegexes = [
            /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
            /(\d{1,2}):(\d{2})/,
            /(\d{1,2})\s*(am|pm)/i
        ];
        for (const re of timeRegexes) {
            const m = txt.match(re);
            if (m) {
                let hr = parseInt(m[1], 10);
                let min = m[2] ? parseInt(m[2], 10) : 0;
                let ampm = m[3] || m[2] || '';
                if (typeof ampm === 'string') ampm = ampm.toLowerCase();
                if (ampm === 'pm' && hr < 12) hr += 12;
                if (ampm === 'am' && hr === 12) hr = 0;
                if (ampm === 'am' || ampm === 'pm') {
                    foundTime = `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                } else if (re === timeRegexes[1]) {
                    foundTime = `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                }
                break;
            }
        }
        // Date extraction: YYYY-MM-DD, DD/MM, Month Day
        const today = new Date();
        if (txt.includes('tomorrow')) {
            const tmr = new Date();
            tmr.setDate(today.getDate() + 1);
            foundDate = tmr.toISOString().split('T')[0];
        } else if (txt.includes('today')) {
            foundDate = today.toISOString().split('T')[0];
        } else {
            // YYYY-MM-DD
            const ymd = txt.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (ymd) {
                foundDate = `${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`;
            } else {
                // DD/MM or D/M
                const dmMatch = txt.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
                if (dmMatch) {
                    let d = parseInt(dmMatch[1], 10);
                    let m = parseInt(dmMatch[2], 10);
                    let y = dmMatch[3] ? parseInt(dmMatch[3], 10) : today.getFullYear();
                    if (y < 100) y += 2000;
                    if (m > 12) { const temp = d; d = m; m = temp; }
                    foundDate = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                } else {
                    // Month name + day
                    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
                    const monthMatch = txt.match(new RegExp(`(${months.join('|')})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i'));
                    if (monthMatch) {
                        const mName = monthMatch[1].toLowerCase().substring(0,3);
                        const shortMonths = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
                        let mStr = (shortMonths.indexOf(mName) + 1).toString().padStart(2, '0');
                        let dStr = parseInt(monthMatch[2], 10).toString().padStart(2, '0');
                        foundDate = `${today.getFullYear()}-${mStr}-${dStr}`;
                    }
                }
            }
        }
        if (!foundDate && !foundTime) {
            alert('No date/time found in text.');
            return;
        }
        if (type === 'event') {
            if (foundDate) item.eventDate = foundDate;
            if (foundTime) item.eventTime = foundTime;
            item.hasEvent = true;
        } else {
            if (foundDate) item.deadlineDate = foundDate;
            if (foundTime) item.deadlineTime = foundTime;
            item.hasDeadline = true;
        }
        markDirty();
        renderAnnouncementsManager();
    }

    // --- EMOJI PICKER ---
    const SUGGESTED_EMOJIS = [
        '📚','📖','📗','📘','📙','📝','📌','📎','🗂️','🗃️',
        '🔗','🌐','💻','📱','🎬','🎧','🎵','📹','📷','🎨',
        '🧠','💡','⭐','🔥','🚀','🎯','🛠️','⚙️','🔍','📧',
        '📁','📅','📊','📈','✅','❌','⚠️','ℹ️','🏆','🎓',
        '💬','💭','📢','📰','🧪','🤖','💾','💿',
        '⏳','⌨️','▶️','☝️','✔️','❓','🌟','🎙️','👥','📂',
        '📄','📋','📜','📤','📬','📸','📽️','🔁','🔧','🔬','🗓️'
    ];

    function showEmojiPicker(inputEl) {
        // Close any other open picker
        document.querySelectorAll('.emoji-picker-dropdown').forEach(d => d.style.display = 'none');
        const dropdown = inputEl.parentElement.querySelector('.emoji-picker-dropdown');
        if(!dropdown) return;
        dropdown.innerHTML = SUGGESTED_EMOJIS.map(e =>
            `<button class="emoji-opt" type="button" onmousedown="event.preventDefault(); pickEmoji(this, '${e}')">${e}</button>`
        ).join('');
        dropdown.style.display = 'grid';
        // Close on outside click
        setTimeout(() => {
            const handler = (ev) => {
                if(!dropdown.contains(ev.target) && ev.target !== inputEl) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('click', handler);
                }
            };
            document.addEventListener('click', handler);
        }, 0);
    }

    function pickEmoji(btn, emoji) {
        const dropdown = btn.closest('.emoji-picker-dropdown');
        const input = dropdown.parentElement.querySelector('input');
        input.value = emoji;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        dropdown.style.display = 'none';
    }

    function buildPreviewPayload() {
        const snapshot = {
            CONFIG: window.CONFIG || {},
            COURSE_DATA: window.COURSE_DATA || [],
            SUBJECT_DETAILS_DATA: window.SUBJECT_DETAILS_DATA || {},
            SCHEDULE_DATA: window.SCHEDULE_DATA || [],
            MIDTERM_DATA: window.MIDTERM_DATA || [],
            FINAL_DATA: window.FINAL_DATA || [],
            STAFF_DATA: window.STAFF_DATA || [],
            TIMETABLE_DATA: window.TIMETABLE_DATA || {},
            UPDATES_DATA: window.UPDATES_DATA || [],
            NEWS_DATA: window.NEWS_DATA || []
        };
        try {
            return JSON.parse(JSON.stringify(snapshot));
        } catch (e) {
            return snapshot;
        }
    }

    // --- UNSAVED CHANGES WARNING ---
    let isDirty = false;
    let dataSnapshot = '';

    function takeSnapshot() {
        dataSnapshot = JSON.stringify({ c: window.COURSE_DATA, sd: window.SUBJECT_DETAILS_DATA, s: window.SCHEDULE_DATA, m: window.MIDTERM_DATA, f: window.FINAL_DATA, st: window.STAFF_DATA, tt: window.TIMETABLE_DATA, cfg: window.CONFIG, u: window.UPDATES_DATA, n: window.NEWS_DATA });
    }

    function markDirty() {
        const current = JSON.stringify({ c: window.COURSE_DATA, sd: window.SUBJECT_DETAILS_DATA, s: window.SCHEDULE_DATA, m: window.MIDTERM_DATA, f: window.FINAL_DATA, st: window.STAFF_DATA, tt: window.TIMETABLE_DATA, cfg: window.CONFIG, u: window.UPDATES_DATA, n: window.NEWS_DATA });
        isDirty = current !== dataSnapshot;
    }

    // Listen for changes on all inputs
    document.addEventListener('input', function() { markDirty(); });
    document.addEventListener('change', function() { markDirty(); });

    window.addEventListener('beforeunload', function(e) {
        if(isDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        }
    });

    // --- Auto timestamps + auto-announcements (feature 7.2) ---
    // On save we stamp a createdAt on any new week / new visible resource.
    // The student site uses createdAt for the "NEW" badge (14 days) and the
    // "Updated X ago" line — no manual History dates needed. If a resource is
    // added 2+ days after its week first appeared, we auto-post an announcement
    // instead of re-flagging the whole week as new.
    function ahLocalDateTime() {
        const d = new Date(), p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
               'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }
    function ahStampAndAnnounce() {
        const nowISO = new Date().toISOString();
        const nowTs = Date.now();
        const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
        if (typeof window.NEWS_DATA === 'undefined') window.NEWS_DATA = [];
        (window.COURSE_DATA || []).forEach(sub => {
            ['weeks', 'events'].forEach(section => {
                (sub[section] || []).forEach(wk => {
                    if (!wk.createdAt) wk.createdAt = nowISO;
                    const wkTs = new Date(wk.createdAt).getTime();
                    const res = wk.resources || {};
                    Object.keys(res).forEach(key => {
                        const r = res[key];
                        if (!r) return;
                        const isReal = r.vis && r.link && r.link !== '#';
                        if (!isReal) return;
                        if (!r.createdAt) {
                            r.createdAt = nowISO;
                            // late-added resource -> announcement instead of a week badge
                            if (!isNaN(wkTs) && (nowTs - wkTs) >= TWO_DAYS && !r.announced) {
                                r.announced = true;
                                window.NEWS_DATA.unshift({
                                    title: 'New ' + key + ' added — ' + (sub.code || sub.name || '') + ', ' + (wk.title || ''),
                                    sub: '',
                                    body: '',
                                    emoji: '🆕',
                                    link: r.link,
                                    linkNote: 'Open ' + key,
                                    publishedAt: ahLocalDateTime(),
                                    _auto: true
                                });
                            }
                        }
                    });
                });
            });
        });
    }

    const _origSave = window.saveData;
    window.exportBackupFile = _origSave;   // optional "download a backup file" button
    window.saveData = async function() {
        // History was removed, so the old history-date warnings no longer apply.
        const warnings = [];
        ahStampAndAnnounce();   // auto createdAt + auto announcements for late resources
        if (warnings.length > 0) {
            const msg = `⚠️ Save Warning (${warnings.length} issue${warnings.length > 1 ? 's' : ''}):\n\n` +
                warnings.slice(0, 8).join('\n') +
                (warnings.length > 8 ? `\n…and ${warnings.length - 8} more.` : '') +
                '\n\nSave anyway? (You can fix these after.)';
            if (!confirm(msg)) return; // user chose to go back and fix
        }
        const st = document.getElementById('save-status');
        // Phase 4: save straight to the live database
        if (typeof window.__ahSaveToDatabase === 'function') {
            if (st) { st.textContent = 'Saving…'; st.style.color = '#aaa'; }
            const ok = await window.__ahSaveToDatabase();
            if (!ok) { if (st) { st.textContent = '✕ Save failed'; st.style.color = '#ff3b30'; } return; }
        } else {
            _origSave(); // fallback to file download if the database layer isn't loaded
        }
        takeSnapshot();
        isDirty = false;
        if (st) {
            st.textContent = '✓ Saved';
            st.style.color = '#00c853';
            setTimeout(() => { st.textContent = ''; }, 2500);
        }
    };

    // Ctrl+S to save
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            window.saveData();
        }
    });

    // Phase 4: do not auto-start. The login layer (admin-auth.js) calls this
    // after a successful login + loading the live data from the database.
    window.__ahAdminBoot = function () { init(); takeSnapshot(); };
