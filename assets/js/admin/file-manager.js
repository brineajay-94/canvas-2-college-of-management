var _filesCache = [];
var _storageRef;
var _selectedFolder = '';
var _deleteTarget = null;

document.addEventListener('DOMContentLoaded', function () {
  if (typeof firebase !== 'undefined' && firebase.storage) {
    _storageRef = firebase.storage().ref();
  }
  loadFiles();
});

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(ts) {
  if (!ts) return '-';
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function getExt(name) {
  return name.split('.').pop().toLowerCase();
}

function getIcon(ext) {
  var map = {
    pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word',
    xls: 'fa-file-excel', xlsx: 'fa-file-excel',
    png: 'fa-file-image', jpg: 'fa-file-image', jpeg: 'fa-file-image', gif: 'fa-file-image', svg: 'fa-file-image', webp: 'fa-file-image',
    mp4: 'fa-file-video', mov: 'fa-file-video', avi: 'fa-file-video',
    mp3: 'fa-file-audio', wav: 'fa-file-audio',
    zip: 'fa-file-archive', rar: 'fa-file-archive', '7z': 'fa-file-archive',
    js: 'fa-file-code', css: 'fa-file-code', html: 'fa-file-code', json: 'fa-file-code'
  };
  return map[ext] || 'fa-file';
}

function isImage(ext) {
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].indexOf(ext) >= 0;
}

async function loadFiles() {
  var grid = document.getElementById('fileGrid');
  var empty = document.getElementById('fileEmpty');
  try {
    var snap = await _storageRef.child(_selectedFolder).listAll();
    var items = snap.items;
    var all = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var meta = await item.getMetadata();
      all.push({ ref: item, meta: meta, name: meta.name, size: meta.size, time: meta.updated, type: meta.contentType });
    }
    all.sort(function (a, b) { return new Date(b.time) - new Date(a.time); });
    _filesCache = all;
    renderFiles();
  } catch (err) {
    grid.innerHTML = '<div class="empty-state"><h3>Error loading files</h3><p>' + err.message + '</p></div>';
  }
}

function renderFiles() {
  var grid = document.getElementById('fileGrid');
  var empty = document.getElementById('fileEmpty');
  var count = document.getElementById('fileCount');
  if (!_filesCache.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    if (count) count.textContent = '0 files';
    return;
  }
  empty.style.display = 'none';
  if (count) count.textContent = _filesCache.length + ' file' + (_filesCache.length > 1 ? 's' : '');
  grid.innerHTML = _filesCache.map(function (f) {
    var ext = getExt(f.name);
    var icon = getIcon(ext);
    var img = isImage(ext) ? '<img src="' + f.ref.toString() + '" alt="" class="file-preview" loading="lazy">' : '<i class="fas ' + icon + ' file-icon"></i>';
    return '<div class="file-card" data-name="' + f.name.replace(/"/g, '&quot;') + '">' +
      '<div class="file-thumb">' + img + '</div>' +
      '<div class="file-info">' +
        '<div class="file-name" title="' + f.name.replace(/"/g, '&quot;') + '">' + f.name + '</div>' +
        '<div class="file-meta">' + formatSize(f.size) + ' &middot; ' + formatDate(f.time) + '</div>' +
      '</div>' +
      '<div class="file-actions">' +
        '<button class="btn btn-sm btn-secondary" onclick="copyFileURL(this)" title="Copy URL"><i class="fas fa-link"></i></button>' +
        '<button class="btn btn-sm btn-danger" onclick="confirmDelete(this)" title="Delete"><i class="fas fa-trash"></i></button>' +
      '</div>' +
      '</div>';
  }).join('');
}

async function copyFileURL(btn) {
  var card = btn.closest('.file-card');
  var name = card.dataset.name;
  var item = _filesCache.find(function (f) { return f.name === name; });
  if (!item) return;
  try {
    var url = await item.ref.getDownloadURL();
    await navigator.clipboard.writeText(url);
    showToast('URL copied to clipboard');
  } catch (err) {
    showToast('Failed to copy URL', 'error');
  }
}

function confirmDelete(btn) {
  var card = btn.closest('.file-card');
  _deleteTarget = card.dataset.name;
  document.getElementById('deleteFileName').textContent = _deleteTarget;
  document.getElementById('deleteModal').classList.add('open');
}

async function deleteFile() {
  if (!_deleteTarget) return;
  var btn = document.querySelector('.modal-danger-btn');
  var orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
  try {
    var item = _filesCache.find(function (f) { return f.name === _deleteTarget; });
    if (item) await item.ref.delete();
    closeModal('deleteModal');
    _deleteTarget = null;
    showToast('File deleted');
    await loadFiles();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
  btn.disabled = false;
  btn.innerHTML = orig;
}

function triggerUpload() {
  document.getElementById('fileInput').click();
}

async function uploadFiles(e) {
  var files = e.target.files;
  if (!files.length) return;
  var btn = document.getElementById('uploadBtn');
  var orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  var success = 0, failed = 0;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var path = _selectedFolder ? _selectedFolder + '/' + file.name : file.name;
    try {
      var snap = await _storageRef.child(path).put(file);
      showToast('Uploaded: ' + file.name);
      success++;
    } catch (err) {
      showToast('Failed: ' + file.name + ' - ' + err.message, 'error');
      failed++;
    }
  }
  btn.disabled = false;
  btn.innerHTML = orig;
  e.target.value = '';
  await loadFiles();
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

var _uploadTimeout;
function onUploadAreaDrag(e) {
  e.preventDefault();
  var area = document.getElementById('uploadArea');
  area.classList.toggle('drag-over', e.type === 'dragover' || e.type === 'dragenter');
}
function onUploadAreaDrop(e) {
  e.preventDefault();
  document.getElementById('uploadArea').classList.remove('drag-over');
  document.getElementById('fileInput').files = e.dataTransfer.files;
  uploadFiles({ target: { files: e.dataTransfer.files } });
}
