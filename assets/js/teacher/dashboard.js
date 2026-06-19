var _currentSubject = '';
var _currentSheetId = '';
var _currentSubjectCol = -1;
var _marksData = [];
var _sheetConfig = {};
var _changeCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await authService.init();
  if (!authService.requireTeacher('../login.html')) return;
  var name = authService.userData?.fullName || 'Teacher';
  var tn = document.getElementById('teacherName');
  if (tn) tn.textContent = name;
  var av = document.getElementById('teacherAvatar');
  if (av) av.textContent = name.charAt(0).toUpperCase();
  loadAssignments();
});

async function loadAssignments() {
  var container = document.getElementById('assignedSubjects');
  var user = authService.userData;
  var uid = user.uid || user.localId;
  if (!uid) { container.innerHTML = '<p style="grid-column:1/-1;color:var(--color-danger-fg);">User ID not found.</p>'; return; }

  try {
    var sheetsSnap = await db.collection('resultSheets').get();
    var sheetMap = {};
    sheetsSnap.forEach(function (doc) {
      var s = doc.data();
      var sheetName = typeof s.name === 'string' ? s.name : (typeof s.tabName === 'string' ? s.tabName : 'Unknown');
      var subjects = (s.subjects || []).filter(function (subj) { return typeof subj === 'string' && subj.trim() !== ''; });
      sheetMap[doc.id] = { name: sheetName, active: s.active !== false, subjects: subjects, webUrl: s.webUrl, tabName: s.tabName || s.name, sheetId: s.sheetId };
    });

    var assignments = [];
    var seen = {};

    var autoSnap = await db.collection('autoAssignments').where('teacherId', '==', uid).get();
    autoSnap.forEach(function (doc) {
      var a = doc.data();
      var autoSubject = typeof a.teacherSubject === 'string' ? a.teacherSubject : String(a.teacherSubject || '');
      var autoSheetSubject = typeof a.sheetSubject === 'string' ? a.sheetSubject : String(a.sheetSubject || '');
      var autoSheetId = typeof a.sheetId === 'string' ? a.sheetId : String(a.sheetId || '');
      if (!autoSubject || autoSubject === '[object Object]') return;
      var key = autoSubject + '|' + autoSheetId;
      if (!seen[key]) {
        seen[key] = true;
        assignments.push({
          subject: autoSubject, sheetSubject: autoSheetSubject,
          sheetId: autoSheetId, sheetName: sheetMap[autoSheetId] ? sheetMap[autoSheetId].name : 'Unknown', source: 'auto'
        });
      }
    });

    var globalSubjects = user.assignedSubjects || [];
    globalSubjects.forEach(function (subjName) {
      if (typeof subjName !== 'string') subjName = String(subjName);
      var matchedSheets = [];
      for (var sid in sheetMap) {
        if (!sheetMap[sid].active || !sheetMap[sid].subjects) continue;
        var isMatch = sheetMap[sid].subjects.some(function (subj) {
          if (typeof subj !== 'string') subj = String(subj);
          var m1 = SubjectUtils.match(subj);
          var m2 = SubjectUtils.match(subjName);
          return (m1 && m2 && m1 === m2) || subj.toLowerCase() === subjName.toLowerCase();
        });
        if (isMatch) matchedSheets.push(sid);
      }
      if (matchedSheets.length) {
        matchedSheets.forEach(function (sid) {
          var key = subjName + '|' + sid;
          if (!seen[key]) { seen[key] = true; assignments.push({ subject: subjName, sheetId: sid, sheetName: sheetMap[sid].name, source: 'global' }); }
        });
      } else {
        var key = subjName + '|__unassigned__';
        if (!seen[key]) { seen[key] = true; assignments.push({ subject: subjName, sheetId: '', sheetName: 'No active sheet', source: 'global' }); }
      }
    });

    assignments = assignments.filter(function (a) {
      var s = typeof a.subject === 'string' ? a.subject : String(a.subject || '');
      if (s.trim() === '' || s === '[object Object]') return false;
      if (!a.sheetId) return false;
      var sheet = sheetMap[a.sheetId];
      return sheet && sheet.active;
    });

    if (assignments.length === 0) {
      container.innerHTML = '<p style="grid-column:1/-1;color:var(--color-fg-muted);">No subjects assigned. Contact admin.</p>';
      return;
    }

    container.innerHTML = assignments.map(function (a) {
      var isActive = a.sheetId ? (sheetMap[a.sheetId] ? sheetMap[a.sheetId].active : false) : false;
      var sheetName = typeof a.sheetName === 'string' ? a.sheetName : String(a.sheetName || '');
      var subject = typeof a.subject === 'string' ? a.subject : String(a.subject || '');
      var sheetSubject = typeof a.sheetSubject === 'string' ? a.sheetSubject : String(a.sheetSubject || '');
      var sheetId = typeof a.sheetId === 'string' ? a.sheetId : String(a.sheetId || '');
      var subjectLabel = sheetSubject ? subject + ' (as ' + sheetSubject + ')' : subject;
      return '<div class="subject-card" data-subject="' + subject.replace(/'/g, "\\'") + '" data-sheet="' + sheetId + '">' +
        '<div class="card-top">' +
          '<div class="card-icon"><i class="fas fa-book"></i></div>' +
          '<div class="card-body">' +
            '<h3>' + sheetName + '</h3>' +
            '<div class="meta">' + subjectLabel + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-actions">' +
          '<span class="status-badge" style="background:' + (isActive ? '#dcfce7' : '#fef2f2') + ';color:' + (isActive ? '#16a34a' : '#dc2626') + '"><i class="fas fa-circle" style="font-size:0.4rem;"></i> ' + (isActive ? 'Active' : 'Inactive') + '</span>' +
          (isActive && sheetId ? '<button class="enter-btn" data-subject="' + subject.replace(/'/g, "\\'") + '" data-sheet="' + sheetId + '"><i class="fas fa-pen"></i> Enter Marks</button>' : '') +
        '</div>' +
        '</div>';
    }).join('');

    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.enter-btn');
      if (btn) openMarksEntry(btn.dataset.subject, btn.dataset.sheet);
    });

  } catch (err) {
    container.innerHTML = '<p style="grid-column:1/-1;color:var(--color-danger-fg);">Error: ' + err.message + '</p>';
  }
}

async function loadSheetConfig(sheetId) {
  if (_sheetConfig[sheetId]) return _sheetConfig[sheetId];
  var doc = await db.collection('resultSheets').doc(sheetId).get();
  if (!doc.exists) return null;
  var s = doc.data();
  var cfg = { webUrl: s.webUrl, tabName: s.tabName || s.name, sheetId: s.sheetId };
  _sheetConfig[sheetId] = cfg;
  return cfg;
}

async function openMarksEntry(subject, sheetId) {
  _currentSubject = subject;
  _currentSheetId = sheetId;
  _marksData = [];
  _changeCount = 0;

  var overlay = document.getElementById('marksOverlay');
  overlay.classList.add('open');
  var skeleton = document.getElementById('marksSkeleton');
  if (skeleton) skeleton.style.display = '';

  try {
    var cfg = await loadSheetConfig(sheetId);
    if (!cfg) { if (skeleton) skeleton.style.display = 'none'; showToast('Sheet not found', 'error'); overlay.classList.remove('open'); return; }
    if (!cfg.webUrl) { if (skeleton) skeleton.style.display = 'none'; showToast('No web URL configured', 'error'); overlay.classList.remove('open'); return; }

    sheetsService.setWebAppUrl(cfg.webUrl);
    var data = await sheetsService.getAllData(cfg.tabName, cfg.sheetId);

    var subjectCol = -1;
    for (var i = 0; i < data.headers.length; i++) {
      var h = data.headers[i].trim();
      if (SubjectUtils.match(h) === SubjectUtils.match(subject) || h.toLowerCase() === subject.toLowerCase()) {
        subjectCol = i; break;
      }
    }
    if (subjectCol === -1) { if (skeleton) skeleton.style.display = 'none'; showToast('Subject column not found', 'error'); overlay.classList.remove('open'); return; }

    _currentSubjectCol = subjectCol;
    _marksData = data;

    var filtered = [];
    data.data.forEach(function (row, origIdx) {
      var sym = row[data.headers[0]];
      if (sym !== undefined && sym !== null && String(sym).trim() !== '') {
        filtered.push({ origIdx: origIdx, row: row });
      }
    });

    document.getElementById('marksOverlayTitle').textContent = subject;
    var list = document.getElementById('marksList');
    if (skeleton && skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);

    var html = [];
    for (var idx = 0; idx < filtered.length; idx++) {
      var item = filtered[idx];
      var row = item.row;
      var origIdx = item.origIdx;
      var symbol = row[data.headers[0]];
      var name = data.headers.length > 1 ? (row[data.headers[1]] || '') : '';
      var marksVal = row[data.headers[subjectCol]] !== undefined && row[data.headers[subjectCol]] !== null ? row[data.headers[subjectCol]] : '';
      html.push('<div class="marks-row" data-idx="' + origIdx + '">' +
        '<span class="sn">' + (idx + 1) + '</span>' +
        '<span class="symbol">' + symbol + '</span>' +
        '<span class="name">' + name + '</span>' +
        '<div class="marks-input-wrap">' +
          '<input type="number" step="0.5" min="0" max="100" class="marks-input" data-row="' + origIdx + '" value="' + marksVal + '" placeholder="-">' +
        '</div>' +
        '<span class="save-indicator"></span>' +
        '</div>');
    }
    list.innerHTML = html.join('');

    if (skeleton && skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
    document.getElementById('marksStudentCount').textContent = filtered.length + ' students';
    updateChangeCount();

    list.addEventListener('focusin', onMarksFocus);
    list.addEventListener('input', onMarksInput);
    list.addEventListener('focusout', onMarksBlur);
    list.addEventListener('keydown', onMarksKeydown);

  } catch (err) {
    if (skeleton && skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
    showToast('Error: ' + err.message, 'error');
    overlay.classList.remove('open');
  }
}

function getRowIdx(el) {
  return parseInt(el.getAttribute('data-row'));
}

function onMarksFocus(e) {
  var inp = e.target;
  if (!inp.classList.contains('marks-input')) return;
  inp.dataset.orig = inp.value;
}

function onMarksInput(e) {
  var inp = e.target;
  if (!inp.classList.contains('marks-input')) return;
  inp.classList.toggle('changed', inp.value !== inp.dataset.orig);
  updateChangeCount();
}

function onMarksBlur(e) {
  var inp = e.target;
  if (!inp.classList.contains('marks-input')) return;
  if (inp.value !== inp.dataset.orig) {
    saveSingleRow(getRowIdx(inp), inp);
  }
}

function onMarksKeydown(e) {
  var inp = e.target;
  if (!inp.classList.contains('marks-input') || e.key !== 'Enter') return;
  e.preventDefault();
  var all = document.querySelectorAll('.marks-input');
  var nextIdx = -1;
  for (var i = 0; i < all.length; i++) {
    if (all[i] === inp) { nextIdx = i + 1; break; }
  }
  if (inp.value !== inp.dataset.orig) {
    saveSingleRow(getRowIdx(inp), inp);
    inp.classList.remove('changed');
  }
  if (nextIdx < all.length) {
    all[nextIdx].focus();
    all[nextIdx].select();
  } else {
    inp.blur();
  }
}

function getSaveIndicator(inp) {
  var row = inp.closest('.marks-row');
  return row ? row.querySelector('.save-indicator') : null;
}

async function saveSingleRow(rowIdx, inputEl) {
  if (inputEl.dataset.saving === '1') return;
  inputEl.dataset.saving = '1';

  var si = getSaveIndicator(inputEl);
  if (si) { si.className = 'save-indicator saving'; si.textContent = '⏳'; }

  var rowData = _marksData.data[rowIdx];
  var headers = _marksData.headers;
  var dataArr = [];
  for (var h = 0; h < headers.length; h++) {
    dataArr.push(h === _currentSubjectCol ? (inputEl.value !== '' ? parseFloat(inputEl.value) : '') : (rowData[headers[h]] !== undefined && rowData[headers[h]] !== null ? rowData[headers[h]] : ''));
  }

  try {
    var cfg = _sheetConfig[_currentSheetId];
    sheetsService.setWebAppUrl(cfg.webUrl);
    await sheetsService.addOrUpdateRow(cfg.tabName, dataArr, 0, cfg.sheetId);
    _marksData.data[rowIdx][headers[_currentSubjectCol]] = inputEl.value !== '' ? parseFloat(inputEl.value) : '';
    inputEl.dataset.orig = inputEl.value;
    inputEl.classList.remove('changed');
    if (si) { si.className = 'save-indicator saved'; si.textContent = '✓'; }
    updateChangeCount();
  } catch (err) {
    if (si) { si.className = 'save-indicator failed'; si.textContent = '✗'; }
  }
  delete inputEl.dataset.saving;
}

function updateChangeCount() {
  var count = document.querySelectorAll('.marks-input.changed').length;
  var el = document.getElementById('marksChangeCount');
  if (el) el.textContent = count + ' changed';
  var badge = document.getElementById('saveBadgeCount');
  if (badge) { badge.textContent = count; badge.style.display = count ? 'inline' : 'none'; }
}

async function saveAllMarks() {
  var changed = document.querySelectorAll('.marks-input.changed');
  if (!changed.length) { showToast('No changes to save', 'info'); return; }

  var btn = document.getElementById('saveAllBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

  var success = 0, failed = 0;
  var headers = _marksData.headers;
  var cfg = _sheetConfig[_currentSheetId];
  sheetsService.setWebAppUrl(cfg.webUrl);

  for (var i = 0; i < changed.length; i++) {
    var inp = changed[i];
    var rowIdx = parseInt(inp.getAttribute('data-row'));
    var rowData = _marksData.data[rowIdx];

    var dataArr = [];
    for (var h = 0; h < headers.length; h++) {
      dataArr.push(h === _currentSubjectCol ? (inp.value !== '' ? parseFloat(inp.value) : '') : (rowData[headers[h]] !== undefined && rowData[headers[h]] !== null ? rowData[headers[h]] : ''));
    }

    try {
      await sheetsService.addOrUpdateRow(cfg.tabName, dataArr, 0, cfg.sheetId);
      _marksData.data[rowIdx][headers[_currentSubjectCol]] = inp.value !== '' ? parseFloat(inp.value) : '';
      inp.dataset.orig = inp.value;
      inp.classList.remove('changed');
      var si = getSaveIndicator(inp);
      if (si) { si.className = 'save-indicator saved'; si.textContent = '✓'; }
      success++;
    } catch (err) {
      var si = getSaveIndicator(inp);
      if (si) { si.className = 'save-indicator failed'; si.textContent = '✗'; }
      failed++;
    }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-save"></i> Save All <span class="badge-count" id="saveBadgeCount">0</span>';

  if (failed === 0) showToast('All ' + success + ' saved');
  else showToast(success + ' saved, ' + failed + ' failed', 'error');

  updateChangeCount();
}

function closeMarksEntry() {
  document.getElementById('marksOverlay').classList.remove('open');
  _currentSubject = '';
  _currentSheetId = '';
  _marksData = [];
  _changeCount = 0;
}

async function refreshMarksEntry() {
  if (!_currentSubject || !_currentSheetId) return;
  showToast('Refreshing...', 'info');
  await openMarksEntry(_currentSubject, _currentSheetId);
  showToast('Data refreshed', 'success');
}
