var editingSheetId = null;
var sheetsData = [];

document.addEventListener('DOMContentLoaded', async function () {
  await authService.init();
  if (!authService.requireAdmin('login.html')) return;
  var saved = localStorage.getItem('sheetsWebAppUrl') || '';
  if (saved) sheetsService.setWebAppUrl(saved);
  loadSheets();
});

async function testConnection() {
  var status = document.getElementById('connectionStatus');
  var url = document.getElementById('sheetWebUrl').value.trim();
  if (!url) { status.innerHTML = '<span style="color:var(--color-danger-fg);">Enter a URL first</span>'; return; }
  sheetsService.setWebAppUrl(url);
  status.innerHTML = '<span style="color:var(--color-fg-muted);"><i class="fas fa-spinner fa-spin"></i> Testing connection...</span>';
  try {
    var sheetId = document.getElementById('sheetId').value.trim() || undefined;
    var res = await sheetsService.listSheets(sheetId);
    status.innerHTML = '<span style="color:var(--success);"><i class="fas fa-check-circle"></i> Connected! Found tabs: <strong>' + (res.join(', ') || '(none)') + '</strong></span>';
    localStorage.setItem('sheetsWebAppUrl', url);
  } catch (err) {
    status.innerHTML = '<span style="color:var(--color-danger-fg);"><i class="fas fa-times-circle"></i> Connection failed: ' + err.message + '</span>';
  }
}

async function loadSheets() {
  var tbody = document.getElementById('sheetsTableBody');
  try {
    var snapshot = await db.collection('resultSheets').orderBy('createdAt', 'desc').get();
    sheetsData = [];
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>No sheets added yet</h3></div></td></tr>';
      return;
    }
    tbody.innerHTML = '';
    snapshot.forEach(function (doc) {
      var s = doc.data();
      s.id = doc.id;
      sheetsData.push(s);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td style="font-weight:600;">' + (s.name || '-') + '</td>' +
        '<td style="font-family:monospace;font-size:12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (s.sheetId || '') + '">' + (s.sheetId || '-') + '</td>' +
        '<td>' + (s.tabName || s.name || '-') + '</td>' +
        '<td><span class="badge ' + (s.active !== false ? 'badge-green' : 'badge-red') + '">' + (s.active !== false ? 'Active' : 'Inactive') + '</span></td>' +
        '<td><span class="badge ' + (s.published ? 'badge-blue' : 'badge-gray') + '">' + (s.published ? 'Published' : 'Unpublished') + '</span></td>' +
        '<td><div class="table-actions">' +
          '<button class="btn btn-sm btn-secondary" onclick="toggleActive(\'' + doc.id + '\')">' + (s.active !== false ? 'Deactivate' : 'Activate') + '</button>' +
          '<button class="btn btn-sm btn-secondary" onclick="togglePublish(\'' + doc.id + '\')">' + (s.published ? 'Unpublish' : 'Publish') + '</button>' +
          '<button class="btn btn-sm btn-secondary" onclick="editSheet(\'' + doc.id + '\')">Edit</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteSheet(\'' + doc.id + '\')">Delete</button>' +
        '</div></td>';
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>Error loading sheets</h3></div></td></tr>';
  }
}

async function fetchSubjects(id) {
  var s = findSheet(id);
  if (!s) return;
  var webUrl = s.webUrl || localStorage.getItem('sheetsWebAppUrl');
  if (!webUrl) { showToast('No web app URL configured for this sheet', 'error'); return; }
  sheetsService.setWebAppUrl(webUrl);
  try {
    var data = await sheetsService.getAllData(s.tabName || s.name, s.sheetId);
    var exclude = ['symbol number', 'student name', 'symbol no', 'symbol', 'student', 'name', 'total', 'gpa', 'result', 's.no', 'sn', 's.n', 'grade', 'remarks', 'percentage'];
    var seen = {};
    var subjects = [];
    data.headers.forEach(function (h) {
      var clean = String(h).trim();
      var lower = clean.toLowerCase();
      if (exclude.indexOf(lower) !== -1) return;
      // Strip TH/PR suffix to deduplicate subject columns
      var base = lower.replace(/\s*(th|pr)\s*$/, '').trim();
      if (!seen[base]) {
        seen[base] = true;
        subjects.push(clean.replace(/\s*(TH|PR|th|pr)\s*$/, '').trim());
      }
    });
    await db.collection('resultSheets').doc(id).update({ subjects: subjects });
    showToast('Subjects fetched: ' + subjects.join(', '));
    loadSheets();
    // Run auto-assign in background
    autoAssignTeachers(id, subjects);
  } catch (err) {
    showToast('Error fetching subjects: ' + err.message, 'error');
  }
}

async function autoAssignTeachers(sheetId, sheetSubjects) {
  try {
    var teachersSnap = await db.collection('users').where('role', '==', 'teacher').get();
    var teachers = [];
    teachersSnap.forEach(function (doc) {
      var t = doc.data();
      t.id = doc.id;
      if (t.assignedSubjects && t.assignedSubjects.length) teachers.push(t);
    });
    if (!teachers.length) return;

    var matches = SubjectUtils.autoAssign(sheetSubjects, teachers);
    if (!matches.length) return;

    // Save auto-assignments to autoAssignments subcollection
    var batch = db.batch();
    matches.forEach(function (m) {
      var docId = m.teacherId + '_' + sheetId + '_' + m.teacherSubject.replace(/[^a-zA-Z0-9]/g, '_');
      var ref = db.collection('autoAssignments').doc(docId);
      batch.set(ref, {
        teacherId: m.teacherId,
        teacherName: m.teacherName,
        teacherSubject: m.teacherSubject,
        sheetSubject: m.sheetSubject,
        sheetSubjectCanon: m.sheetSubjectCanon,
        sheetId: sheetId,
        matchedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();

    showToast('Auto-assigned ' + matches.length + ' teacher(s) to ' + sheetId);
    loadSheets();
  } catch (err) {
    console.error('Auto-assign error:', err);
  }
}

async function runAutoAssign(id) {
  var s = findSheet(id);
  if (!s) return;
  if (!s.subjects || !s.subjects.length) {
    showToast('Fetching subjects first...');
    await fetchSubjects(id);
    s = findSheet(id);
  }
  if (s.subjects && s.subjects.length) {
    showToast('Auto-assigning teachers...');
    await autoAssignTeachers(id, s.subjects);
  } else {
    showToast('No subjects found to assign', 'error');
  }
}

function findSheet(id) {
  for (var i = 0; i < sheetsData.length; i++) {
    if (sheetsData[i].id === id) return sheetsData[i];
  }
  return null;
}

function openAddSheetModal() {
  editingSheetId = null;
  document.getElementById('sheetModalTitle').textContent = 'Add Sheet';
  document.getElementById('sheetForm').reset();
  document.getElementById('connectionStatus').innerHTML = '';
  var savedUrl = localStorage.getItem('sheetsWebAppUrl') || '';
  document.getElementById('sheetWebUrl').value = savedUrl;
  openModal('sheetModal');
}

function editSheet(id) {
  var s = findSheet(id);
  if (!s) return;
  editingSheetId = id;
  document.getElementById('sheetModalTitle').textContent = 'Edit Sheet';
  document.getElementById('sheetName').value = s.name || '';
  document.getElementById('sheetId').value = s.sheetId || '';
  document.getElementById('sheetTabName').value = s.tabName || '';
  document.getElementById('sheetWebUrl').value = s.webUrl || localStorage.getItem('sheetsWebAppUrl') || '';
  document.getElementById('connectionStatus').innerHTML = '';
  openModal('sheetModal');
}

document.getElementById('sheetForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var name = document.getElementById('sheetName').value.trim();
  var sheetId = document.getElementById('sheetId').value.trim();
  var tabName = document.getElementById('sheetTabName').value.trim();
  var webUrl = document.getElementById('sheetWebUrl').value.trim();

  if (!name) { showToast('Sheet name is required', 'error'); return; }
  if (!sheetId) { showToast('Google Sheet ID is required', 'error'); return; }
  if (!tabName) { showToast('Tab name is required', 'error'); return; }
  if (!webUrl) { showToast('Web App URL is required', 'error'); return; }

  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    localStorage.setItem('sheetsWebAppUrl', webUrl);
    sheetsService.setWebAppUrl(webUrl);
    if (editingSheetId) {
      await db.collection('resultSheets').doc(editingSheetId).update({
        name: name,
        sheetId: sheetId,
        tabName: tabName,
        webUrl: webUrl
      });
      showToast('Sheet updated');
    } else {
      var ref = await db.collection('resultSheets').add({
        name: name,
        sheetId: sheetId,
        tabName: tabName,
        webUrl: webUrl,
        active: true,
        published: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('Sheet added');
      // Auto-fetch subjects & auto-assign
      setTimeout(function () { fetchSubjects(ref.id); }, 500);
    }
    closeModal('sheetModal');
    loadSheets();
  } catch (err) {
    showToast(err.message || 'Error saving sheet', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Sheet';
  }
});

async function toggleActive(id) {
  var s = findSheet(id);
  if (!s) return;
  var newVal = s.active === false ? true : false;
  try {
    await db.collection('resultSheets').doc(id).update({ active: newVal });
    showToast(newVal ? 'Sheet activated' : 'Sheet deactivated');
    loadSheets();
    // Run auto-assign if activating and subjects exist
    if (newVal && s.subjects && s.subjects.length) {
      autoAssignTeachers(id, s.subjects);
    }
  } catch (err) {
    showToast('Error updating status', 'error');
  }
}

async function togglePublish(id) {
  var s = findSheet(id);
  if (!s) return;
  var newVal = s.published ? false : true;
  try {
    await db.collection('resultSheets').doc(id).update({ published: newVal });
    showToast(newVal ? 'Sheet published' : 'Sheet unpublished');
    loadSheets();
  } catch (err) {
    showToast('Error updating publish status', 'error');
  }
}

async function deleteSheet(id) {
  if (!confirm('Delete this sheet record?')) return;
  try {
    await db.collection('resultSheets').doc(id).delete();
    showToast('Sheet deleted');
    loadSheets();
  } catch (err) {
    showToast('Error deleting sheet', 'error');
  }
}

async function previewSheet(id) {
  var s = findSheet(id);
  if (!s) return;
  var tabName = s.tabName || s.name;
  var webUrl = s.webUrl || localStorage.getItem('sheetsWebAppUrl');
  if (!webUrl) { showToast('No web app URL configured for this sheet', 'error'); return; }
  sheetsService.setWebAppUrl(webUrl);
  try {
    var data = await sheetsService.getAllData(tabName, s.sheetId);
    var html = '<div style="max-height:400px;overflow:auto;font-size:12px;">';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<thead><tr>' + data.headers.map(function (h) { return '<th style="padding:6px 10px;border:1px solid var(--color-border-default);font-weight:600;position:sticky;top:0;background:var(--color-canvas-default);">' + h + '</th>'; }).join('') + '</tr></thead>';
    html += '<tbody>';
    data.data.forEach(function (row) {
      html += '<tr>' + data.headers.map(function (h) { return '<td style="padding:6px 10px;border:1px solid var(--color-border-muted);">' + (row[h] !== undefined && row[h] !== null ? row[h] : '') + '</td>'; }).join('') + '</tr>';
    });
    html += '</tbody></table></div>';

    var modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.innerHTML = '<div class="modal" style="max-width:800px;"><div class="modal-header"><span class="modal-title">' + s.name + ' (' + (data.total || 0) + ' students)</span><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()"><i class="fas fa-times"></i></button></div><div class="modal-body" id="previewBody">' + html + '</div></div>';
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch (err) {
    showToast('Error loading preview: ' + err.message, 'error');
  }
}

function openTHEditor(id) {
  var s = findSheet(id);
  if (!s) return;
  var tabName = s.tabName || s.name;
  var webUrl = s.webUrl || localStorage.getItem('sheetsWebAppUrl');
  if (!webUrl) { showToast('No web app URL configured', 'error'); return; }
  sheetsService.setWebAppUrl(webUrl);

  function _short(s) {
    return _getShortName(s) || s;
  }

  // Use same overlay style as main sheet editor
  var overlay = document.getElementById('spreadsheetOverlay');
  overlay.classList.add('open');
  document.getElementById('spreadsheetTitle').innerHTML = '<i class="fas fa-pencil-alt" style="margin-right:6px;"></i>' + s.name + ' <span style="font-weight:400;font-size:0.85rem;color:var(--color-fg-muted);">— TH Editor</span>';
  document.getElementById('spreadsheetContainer').innerHTML = '<div class="sheet-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  _clearSpreadsheetTH();
  document.getElementById('spreadsheetSaveAll').onclick = function () { saveAllTH(id); };
  var badgeEl = document.getElementById('spreadsheetSaveAll').querySelector('.sheet-badge, .spreadsheet-badge');
  if (badgeEl) badgeEl.id = 'thBadge';

  sheetsService.getAllData(tabName, s.sheetId).then(function (data) {
    _spreadsheetData = data;
    _spreadsheetSheetId = s.id;
    _spreadsheetChangeCount = 0;
    // Collect ALL column indices that should be editable inputs
    var allCols = []; // { idx, label }
    var skipRe = /^(total|percentage|gpa|grade|result|gread|remark|status)$/i;
    data.headers.forEach(function (h, ci) {
      var t = String(h).trim();
      if (!t || skipRe.test(t)) return;
      // Skip PR columns (only show TH in TH editor)
      if (/ PR$/i.test(t) || /^PR$/i.test(t)) return;
      // Detect TH columns
      if (/ TH$/i.test(t) || /^TH$/i.test(t)) {
        var base = t.replace(/\s*TH\s*$/i, '').trim();
        allCols.push({ idx: ci, label: _short(base) || base, cls: 'th-cell' });
        return;
      }
      // ID / subject columns
      var label = t;
      if (/^symbol|^s\.n|^sno|^sn\.|^roll/i.test(t)) label = 'S.N.';
      else if (/^name$/i.test(t)) label = 'NAME';
      else {
        var base = t.replace(/\s*(TH|PR)\s*$/i, '').trim();
        var sht = _short(base);
        if (sht) label = sht;
      }
      allCols.push({ idx: ci, label: label, cls: 'sheet-cell' });
    });
    // Fallback: if no TH columns detected, include all non-skip columns as editable
    if (!allCols.some(function (c) { return c.cls === 'th-cell'; })) {
      allCols = [];
      data.headers.forEach(function (h, ci) {
        var t = String(h).trim();
        if (!t || skipRe.test(t)) return;
        allCols.push({ idx: ci, label: t, cls: 'sheet-cell' });
      });
    }

    var totalCols = allCols.length;
    document.getElementById('spreadsheetRowCount').innerHTML = '<i class="fas fa-table"></i> ' + data.data.length + ' rows';

    var html = '<table class="sheet-table">';
    html += '<thead><tr>';
    allCols.forEach(function (col) {
      var st = ' style="min-width:70px;text-align:center;"';
      if ('S.N.' === col.label) st = ' style="width:50px;min-width:40px;text-align:center;"';
      else if ('NAME' === col.label) st = ' style="min-width:120px;"';
      html += '<th' + st + '>' + col.label + '</th>';
    });
    html += '</tr></thead><tbody>';

      data.data.forEach(function (row, ri) {
      html += '<tr>';
      allCols.forEach(function (col, ci) {
        var key = data.headers[col.idx];
        var v = row[key] !== undefined && row[key] !== null ? row[key] : '';
        var st = ' style="text-align:center;"';
        if ('S.N.' === col.label) st = ' style="width:50px;min-width:40px;text-align:center;"';
        else if ('NAME' === col.label) st = ' style="min-width:120px;"';
        html += '<td' + st + '>';
        var inpSt = '';
        if ('S.N.' === col.label) inpSt = ' style="width:40px;max-width:40px;"';
        html += '<input type="text" class="' + col.cls + '" data-row="' + ri + '" data-col="' + col.idx + '" data-orig="' + String(v).replace(/"/g,'&quot;') + '" value="' + String(v).replace(/"/g,'&quot;') + '"' + inpSt + '>';
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    document.getElementById('spreadsheetContainer').innerHTML = html;

    // Attach events to all cells — set orig from HTML attribute
    document.getElementById('spreadsheetContainer').querySelectorAll('.sheet-cell, .th-cell').forEach(function (inp) {
      var ri = parseInt(inp.getAttribute('data-row'));
      var ci = parseInt(inp.getAttribute('data-col'));
      inp._orig = inp.getAttribute('data-orig');
      inp.addEventListener('focus', function () { this._orig = this.value; });
      inp.addEventListener('blur', function () {
        if (this.value !== this._orig) {
          var statusEl = document.getElementById('spreadsheetRowCount');
          if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Saving...';
          _saveSpreadsheetCell(ri, ci, this).then(function () {
            if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color:#22c55e;margin-right:6px;"></i> Saved';
            setTimeout(function () { if (statusEl) statusEl.innerHTML = '<i class="fas fa-table"></i> ' + data.data.length + ' rows'; }, 1500);
          }).catch(function (err) {
            showToast('Save failed: ' + err.message, 'error');
            if (statusEl) statusEl.innerHTML = '<i class="fas fa-table"></i> ' + data.data.length + ' rows';
          });
        } else {
          this.classList.remove('changed');
        }
      });
      inp.addEventListener('input', function () {
        var changed = this.value !== this._orig;
        this.classList.toggle('changed', changed);
        _updateSpreadsheetChangeCount();
      });
      inp.addEventListener('keydown', function (e) {
        var cells = document.getElementById('spreadsheetContainer').querySelectorAll('.sheet-cell, .th-cell');
        var idx = -1;
        for (var i = 0; i < cells.length; i++) { if (cells[i] === this) { idx = i; break; } }
        if (idx < 0) return;
        var target = -1;
        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); target = idx + totalCols; }
        else if (e.key === 'ArrowUp') { e.preventDefault(); target = idx - totalCols; }
        else if (e.key === 'ArrowRight') { e.preventDefault(); target = idx + 1; }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); target = idx - 1; }
        if (target >= 0 && target < cells.length) { cells[target].focus(); cells[target].select(); }
        else if ((e.key === 'Enter' || e.key === 'ArrowDown') && target >= cells.length) { this.blur(); }
      });
    });
  }).catch(function (err) {
    document.getElementById('spreadsheetContainer').innerHTML = '<div class="sheet-err">Error: ' + err.message + '</div>';
    _spreadsheetData = null;
    _spreadsheetSheetId = null;
    _spreadsheetChangeCount = 0;
    var saveBtn = document.getElementById('spreadsheetSaveAll');
    if (saveBtn) saveBtn.onclick = function () { saveAllSpreadsheet(); };
    var b = saveBtn && saveBtn.querySelector('.sheet-badge, .spreadsheet-badge');
    if (b) b.id = 'spreadsheetBadge';
  });
}

function _clearSpreadsheetTH() {
  // Reset the Save All button back to original handler when closing
  var saveBtn = document.getElementById('spreadsheetSaveAll');
  if (saveBtn) {
    saveBtn.onclick = function () { saveAllSpreadsheet(); };
    var b = saveBtn.querySelector('.sheet-badge, .spreadsheet-badge');
    if (b) b.id = 'spreadsheetBadge';
  }
  _updateSpreadsheetChangeCount();
}

function saveAllTH(id) {
  if (document.activeElement && (document.activeElement.classList.contains('sheet-cell') || document.activeElement.classList.contains('th-cell'))) {
    document.activeElement.blur();
  }

  var cells = document.querySelectorAll('#spreadsheetContainer .sheet-cell, #spreadsheetContainer .th-cell');
  var changed = [];
  cells.forEach(function (c) { if (c.value !== (c._orig ?? '')) changed.push(c); });
  if (!changed.length) { showToast('No changes to save', 'info'); return; }

  var btn = document.getElementById('spreadsheetSaveAll');
  var origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

  var success = 0, failed = 0;
  (async function () {
    for (var i = 0; i < changed.length; i++) {
      try {
        await _saveSpreadsheetCell(parseInt(changed[i].getAttribute('data-row')), parseInt(changed[i].getAttribute('data-col')), changed[i]);
        success++;
      } catch (e) {
        failed++;
        changed[i].style.setProperty('background', '#f8d7da', 'important');
      }
    }
    btn.disabled = false;
    btn.innerHTML = origHtml;
    if (failed === 0) showToast('All ' + success + ' changes saved');
    else showToast(success + ' saved, ' + failed + ' failed', 'error');
    _updateSpreadsheetChangeCount();
  })();
}

var _SUBJECT_SHORTS = {
  'English': 'ENG', 'Nepali': 'NEP', 'Social': 'SOC', 'BasicMath': 'B.MATH',
  'Economics': 'ECO', 'Account': 'ACC', 'BusinessStudies': 'BS', 'ComputerScience': 'CS',
  'HotelManagement': 'HM', 'BusinessMath': 'BM'
};

function _getShortName(s) {
  var canon = SubjectUtils && SubjectUtils.match ? SubjectUtils.match(s) : null;
  return (canon && _SUBJECT_SHORTS[canon]) || null;
}

// ── Full-screen Spreadsheet Editor ──
var _spreadsheetData = null;
var _spreadsheetSheetId = null;
var _spreadsheetChangeCount = 0;

function openSpreadsheet(id) {
  var s = findSheet(id);
  if (!s) return;
  _spreadsheetSheetId = id;
  var tabName = s.tabName || s.name;
  var webUrl = s.webUrl || localStorage.getItem('sheetsWebAppUrl');
  if (!webUrl) { showToast('No web app URL configured', 'error'); return; }
  sheetsService.setWebAppUrl(webUrl);
  document.getElementById('spreadsheetTitle').textContent = s.name;
  document.getElementById('spreadsheetOverlay').classList.add('open');
  document.getElementById('spreadsheetContainer').innerHTML = '<div class="sheet-loading"><i class="fas fa-spinner fa-spin"></i> Loading data...</div>';
  _loadSpreadsheetData(tabName, s.sheetId);
}

function closeSpreadsheet() {
  document.getElementById('spreadsheetOverlay').classList.remove('open');
  var saveBtn = document.getElementById('spreadsheetSaveAll');
  if (saveBtn) {
    saveBtn.onclick = function () { saveAllSpreadsheet(); };
    var badge = saveBtn.querySelector('.spreadsheet-badge');
    if (badge) badge.id = 'spreadsheetBadge';
  }
  _spreadsheetData = null;
  _spreadsheetSheetId = null;
  _spreadsheetChangeCount = 0;
}

function refreshSpreadsheet() {
  var s = findSheet(_spreadsheetSheetId);
  if (!s) return;
  var tabName = s.tabName || s.name;
  var webUrl = s.webUrl || localStorage.getItem('sheetsWebAppUrl');
  if (!webUrl) { showToast('No web app URL configured', 'error'); return; }
  sheetsService.setWebAppUrl(webUrl);
  // Reset Save All to full-spreadsheet mode (in case TH editor was open)
  var saveBtn = document.getElementById('spreadsheetSaveAll');
  if (saveBtn) {
    saveBtn.onclick = function () { saveAllSpreadsheet(); };
    var b = saveBtn.querySelector('.sheet-badge, .spreadsheet-badge');
    if (b) b.id = 'spreadsheetBadge';
  }
  document.getElementById('spreadsheetContainer').innerHTML = '<div class="sheet-loading"><i class="fas fa-spinner fa-spin"></i> Refreshing...</div>';
  _loadSpreadsheetData(tabName, s.sheetId);
}

async function _loadSpreadsheetData(tabName, sheetId) {
  try {
    var data = await sheetsService.getAllData(tabName, sheetId);
    _spreadsheetData = data;
    _spreadsheetChangeCount = 0;
    var countEl = document.getElementById('spreadsheetChangeCount');
    if (countEl) countEl.textContent = '0 changed';

    var container = document.getElementById('spreadsheetContainer');

    // Build grouped header: detect TH/PR subject pairs
    var _colNames = {
      'SYMBOL NO.': 'S.N.',
      'Symbol No.': 'S.N.',
      'symbol no.': 'S.N.',
      'Symbol No': 'S.N.',
      'symbol': 'S.N.'
    };
    function _getColName(s) {
      var raw = String(s).trim();
      if (_colNames[raw]) return _colNames[raw];
      var upper = raw.toUpperCase();
      if (_colNames[upper]) return _colNames[upper];
      return null;
    }

    // Group headers: adjacent TH/PR pairs under same subject
    var groups = [];
    var idx = 0;
    while (idx < data.headers.length) {
      var h = String(data.headers[idx]).trim();
      if (idx + 1 < data.headers.length) {
        var base1 = h.replace(/\s*(TH|PR)$/i, '').trim();
        var base2 = String(data.headers[idx + 1]).trim().replace(/\s*(TH|PR)$/i, '').trim();
        if (base1 && base2 && base1.toLowerCase() === base2.toLowerCase()) {
          var shortName = _getShortName(base1) || base1;
          groups.push({ main: shortName, cols: 2, starts: idx });
          idx += 2;
          continue;
        }
      }
      var renamed = _getColName(h);
      if (renamed) {
        groups.push({ main: renamed, cols: 1, starts: idx });
      } else {
        var baseSub = h.replace(/\s*(TH|PR)\s*$/i, '').trim();
        var short = _getShortName(baseSub);
        var rawLabel = short ? h.replace(baseSub, short) : h;
        groups.push({ main: rawLabel, cols: 1, starts: idx });
      }
      idx++;
    }

    var nameCol = -1;
    data.headers.forEach(function (h, ci) { if (/^name$/i.test(String(h).trim())) nameCol = ci; });

    var html = '<table class="sheet-table">';

    // First header row: subject names (colspan=2 for TH/PR pairs)
    html += '<thead>';
    html += '<tr>';
    var subLabels = [];
    groups.forEach(function (g, gi) {
      var isName = g.cols === 1 && g.starts === nameCol;
      var st = isName ? ' style="min-width:200px;"' : '';
      if (g.cols > 1) {
        html += '<th colspan="2"' + st + '>' + g.main + '</th>';
        subLabels.push({ label: 'TH', empty: false, isName: false });
        subLabels.push({ label: 'PR', empty: false, isName: false });
      } else {
        html += '<th' + st + '>' + g.main + '</th>';
        subLabels.push({ label: '', empty: true, isName: isName });
      }
    });
    html += '</tr>';

    // Second header row: TH/PR sub-headers
    html += '<tr>';
    subLabels.forEach(function (sl) {
      var st = sl.isName ? ' style="min-width:200px;"' : '';
      html += '<th' + st + '>' + (sl.empty ? '&nbsp;' : sl.label) + '</th>';
    });
    html += '</tr>';
    html += '</thead><tbody>';

    data.data.forEach(function (row, ri) {
      html += '<tr>';
      data.headers.forEach(function (h, ci) {
        var val = row[h] !== undefined && row[h] !== null ? row[h] : '';
        var extraStyle = ci === nameCol ? ' style="min-width:200px;"' : '';
        html += '<td' + extraStyle + '>';
        html += '<input type="text" class="sheet-cell" data-row="' + ri + '" data-col="' + ci + '" data-orig="' + String(val).replace(/"/g,'&quot;') + '" value="' + String(val).replace(/"/g,'&quot;') + '">';
        html += '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
    document.getElementById('spreadsheetRowCount').textContent = data.data.length + ' rows';

    container.querySelectorAll('.sheet-cell').forEach(function (inp) {
      inp._orig = inp.getAttribute('data-orig');
      inp.addEventListener('focus', function () { this._orig = this.value; });
      inp.addEventListener('blur', function () {
        if (this.value !== this._orig) {
          var statusEl = document.getElementById('spreadsheetRowCount');
          if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Saving...';
          _saveSpreadsheetCell(parseInt(this.getAttribute('data-row')), parseInt(this.getAttribute('data-col')), this).then(function () {
            if (statusEl) statusEl.innerHTML = '<i class="fas fa-check" style="color:#22c55e;margin-right:6px;"></i> Saved';
            setTimeout(function () { if (statusEl) statusEl.innerHTML = '<i class="fas fa-table"></i> ' + data.data.length + ' rows'; }, 1500);
          }).catch(function (err) {
            showToast('Auto-save failed: ' + err.message, 'error');
            if (statusEl) statusEl.innerHTML = '<i class="fas fa-table"></i> ' + data.data.length + ' rows';
          });
        }
      });
      inp.addEventListener('input', function () {
        var changed = this.value !== this._orig;
        this.classList.toggle('changed', changed);
        _updateSpreadsheetChangeCount();
      });
      inp.addEventListener('keydown', function (e) {
        var cells = container.querySelectorAll('.sheet-cell');
        var totalCols = data.headers.length;
        var idx = -1;
        for (var i = 0; i < cells.length; i++) { if (cells[i] === this) { idx = i; break; } }
        if (idx < 0) return;
        var target = -1;
        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); target = idx + totalCols; }
        else if (e.key === 'ArrowUp') { e.preventDefault(); target = idx - totalCols; }
        else if (e.key === 'ArrowRight') { e.preventDefault(); target = idx + 1; }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); target = idx - 1; }
        if (target >= 0 && target < cells.length) { cells[target].focus(); cells[target].select(); }
        else if ((e.key === 'Enter' || e.key === 'ArrowDown') && target >= cells.length) { this.blur(); }
      });
    });

  } catch (err) {
    document.getElementById('spreadsheetContainer').innerHTML = '<div class="sheet-err">Error: ' + err.message + '</div>';
  }
}

function _updateSpreadsheetChangeCount() {
  var changed = 0;
  document.querySelectorAll('#spreadsheetContainer .sheet-cell, #spreadsheetContainer .th-cell').forEach(function (c) {
    var orig = c._orig !== undefined ? c._orig : (c.dataset.orig || '');
    if (c.value !== orig) changed++;
  });
  _spreadsheetChangeCount = changed;
  var countEl = document.getElementById('spreadsheetChangeCount');
  if (countEl) countEl.textContent = changed + ' changed';
  var badge = document.getElementById('spreadsheetBadge') || document.getElementById('thBadge');
  if (badge) { badge.textContent = changed; badge.classList.toggle('show', changed > 0); }
}

async function _saveSpreadsheetCell(rowIdx, colIdx, inputEl) {
  if (!_spreadsheetData || !_spreadsheetData.headers || !_spreadsheetData.data) throw new Error('Sheet data not loaded');
  var s = findSheet(_spreadsheetSheetId);
  if (!s) throw new Error('Sheet not found');
  var headers = _spreadsheetData.headers;
  var rowData = _spreadsheetData.data[rowIdx];
  if (!rowData) throw new Error('Row ' + rowIdx + ' not found');
  var dataArr = [];
  for (var i = 0; i < headers.length; i++) {
    dataArr.push(i === colIdx ? (inputEl.value !== '' ? inputEl.value : '') : (rowData[headers[i]] !== undefined && rowData[headers[i]] !== null ? rowData[headers[i]] : ''));
  }
  sheetsService.setWebAppUrl(s.webUrl || localStorage.getItem('sheetsWebAppUrl'));
  await sheetsService.addOrUpdateRow(s.tabName || s.name, dataArr, 0, s.sheetId);
  _spreadsheetData.data[rowIdx][headers[colIdx]] = inputEl.value;
  inputEl._orig = inputEl.value;
  inputEl.dataset.orig = inputEl.value;
  inputEl.classList.remove('changed');
  _updateSpreadsheetChangeCount();
}

async function saveAllSpreadsheet() {
  // Blur active element first to trigger pending auto-save
  if (document.activeElement && (document.activeElement.classList.contains('sheet-cell') || document.activeElement.classList.contains('th-cell'))) {
    document.activeElement.blur();
    await new Promise(function (r) { setTimeout(r, 100); });
  }

  var changed = [];
  document.querySelectorAll('#spreadsheetContainer .sheet-cell, #spreadsheetContainer .th-cell').forEach(function (c) { if (c.value !== (c._orig ?? '')) changed.push(c); });
  if (!changed.length) { showToast('No changes to save', 'info'); return; }

  var btn = document.getElementById('spreadsheetSaveAll');
  var origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

  var success = 0, failed = 0;
  for (var i = 0; i < changed.length; i++) {
    try {
      await _saveSpreadsheetCell(parseInt(changed[i].getAttribute('data-row')), parseInt(changed[i].getAttribute('data-col')), changed[i]);
      success++;
    } catch (e) {
      failed++;
      changed[i].style.setProperty('background', '#f8d7da', 'important');
    }
  }

  btn.disabled = false;
  btn.innerHTML = origHtml;
  if (failed === 0) showToast('All ' + success + ' changes saved');
  else showToast(success + ' saved, ' + failed + ' failed', 'error');
  _updateSpreadsheetChangeCount();
}
