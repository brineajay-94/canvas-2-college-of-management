let currentAdminEmail = null;
let currentAdminName = null;
let currentAdminRole = null;

document.addEventListener('DOMContentLoaded', function () {
  const path = window.location.pathname;

  loadAdminTheme();

  if (path.includes('login.html')) {
    checkAuthStateLogin();
    return;
  }

  setupSidebar();
  checkAuthState();

  if (path.includes('dashboard') || path.endsWith('index.html') || path.endsWith('/admin/') || path.endsWith('/admin')) { loadDashboard(); }
  if (path.includes('products')) { loadProductsTable(); }
  if (path.includes('repairs')) { loadRepairsTable(); }
});

function checkAuthStateLogin() {
  sheets_verifyToken().then(function (res) {
    if (res && res.valid && res.role === 'admin') {
      window.location.href = 'dashboard.html';
    }
  });
}

function checkAuthState() {
  sheets_verifyToken().then(function (res) {
    if (!res || !res.valid) {
      window.location.href = 'login.html';
      return;
    }
    if (res.role !== 'admin') {
      window.location.href = 'login.html';
      return;
    }
    currentAdminEmail = res.email || getAdminEmail();
    currentAdminName = res.name || getAdminName();
    currentAdminRole = res.role || getAdminRole();
    const avatar = document.getElementById('adminAvatar');
    if (avatar) {
      var nameChar = currentAdminName ? currentAdminName[0].toUpperCase() : (currentAdminEmail ? currentAdminEmail[0].toUpperCase() : 'A');
      avatar.textContent = nameChar;
      avatar.title = currentAdminName || currentAdminEmail || 'Admin';
    }
  });
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const btn = document.getElementById('loginBtn');
  const error = document.getElementById('loginError');

  btn.disabled = true;
  btn.textContent = 'Signing in...';
  error.classList.remove('show');

  sheets_login(email, password).then(function (res) {
    if (res.success) {
      if (res.role !== 'admin') {
        sheets_logout();
        error.textContent = 'Access denied. Admin only.';
        error.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Sign in';
        return;
      }
      setAdminRole(res.role);
      setAdminName(res.name);
      window.location.href = 'dashboard.html';
    } else {
      error.textContent = res.error || 'Invalid email or password';
      error.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }).catch(function (err) {
    error.textContent = err.message || 'Login failed';
    error.classList.add('show');
    btn.disabled = false;
    btn.textContent = 'Sign in';
  });
}

function handleLogout() {
  sheets_logout();
  window.location.href = 'login.html';
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;
  var isOpen = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show', isOpen);
}

function setupSidebar() {
  if (document.getElementById('sidebarOverlay')) return;
  var overlay = document.createElement('div');
  overlay.id = 'sidebarOverlay';
  overlay.className = 'sidebar-overlay';
  overlay.onclick = function () {
    document.getElementById('sidebar').classList.remove('open');
    overlay.classList.remove('show');
  };
  document.body.appendChild(overlay);

  var links = document.querySelectorAll('.sidebar-link');
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function (e) {
      if (window.innerWidth <= 768) {
        var sidebar = document.getElementById('sidebar');
        sidebar.classList.remove('open');
        var o = document.getElementById('sidebarOverlay');
        if (o) o.classList.remove('show');
      }
    });
  }
}

function toggleAdminTheme() {
  var isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('adminTheme', isLight ? 'light' : 'dark');
  updateAdminThemeIcon(isLight);
}

function loadAdminTheme() {
  var saved = localStorage.getItem('adminTheme') || 'dark';
  if (saved === 'light') {
    document.documentElement.classList.add('light');
  }
  updateAdminThemeIcon(saved === 'light');
}

function updateAdminThemeIcon(isLight) {
  var btns = document.querySelectorAll('.theme-btn-admin');
  btns.forEach(function (btn) {
    btn.innerHTML = isLight
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  });
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function showToast(message, type) {
  if (type === undefined) type = 'info';
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function () { toast.remove(); }, 3500);
}

var confirmModalResolve = null;

function initConfirmModal() {
  if (document.getElementById('confirmModal')) return;
  var div = document.createElement('div');
  div.id = 'confirmModal';
  div.className = 'modal-overlay';
  div.innerHTML = '<div class="modal" style="max-width:420px;padding:28px;text-align:center;"><div class="modal-icon" style="width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg></div><h3 id="confirmTitle" style="margin:0 0 8px;font-size:17px;font-weight:600;color:var(--on-surface);">Are you sure?</h3><p id="confirmMessage" style="margin:0 0 24px;font-size:14px;color:var(--on-surface-variant);line-height:1.5;"></p><div style="display:flex;gap:10px;justify-content:center;"><button id="confirmCancelBtn" class="btn btn-secondary" style="min-width:100px;">Cancel</button><button id="confirmOkBtn" class="btn btn-danger" style="min-width:100px;">Delete</button></div></div>';
  document.body.appendChild(div);
  document.getElementById('confirmCancelBtn').onclick = function () { closeConfirmModal(false); };
  document.getElementById('confirmOkBtn').onclick = function () { closeConfirmModal(true); };
}

function showConfirmModal(message, confirmText) {
  initConfirmModal();
  var modal = document.getElementById('confirmModal');
  document.getElementById('confirmMessage').textContent = message;
  var okBtn = document.getElementById('confirmOkBtn');
  okBtn.textContent = confirmText || 'Delete';
  modal.classList.add('open');
  return new Promise(function (resolve) {
    confirmModalResolve = resolve;
  });
}

function closeConfirmModal(result) {
  var modal = document.getElementById('confirmModal');
  if (modal) modal.classList.remove('open');
  if (confirmModalResolve) { confirmModalResolve(result); confirmModalResolve = null; }
}

function logActivity(action, entity, itemName) {
  var now = new Date();
  var adminEmail = currentAdminEmail || getAdminEmail() || 'Unknown';
  var adminName = currentAdminName || getAdminName() || (adminEmail ? adminEmail.split('@')[0] : 'Unknown');
  var data = {
    action: action,
    entity: entity,
    name: itemName || '',
    admin: adminName,
    time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    timestamp: Date.now()
  };
  sheets_save('activity', null, data).catch(function (err) { console.log('Activity log error:', err); });
}

function loadRecentActivities() {
  var container = document.getElementById('recentActivities');
  if (!container) return;
  sheets_getAll('activity').then(function (data) {
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><h3>No recent activities</h3><p>Activities will appear here</p></div>';
      return;
    }
    var sorted = data.slice().sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
    var recent = sorted.slice(0, 10);
    container.innerHTML = recent.map(function (a) {
      var icon = a.action === 'added' ? 'plus' : a.action === 'updated' ? 'edit' : 'trash-2';
      var color = a.action === 'deleted' ? 'var(--error)' : 'var(--primary)';
      return '<div class="activity-item"><div class="activity-icon" style="background:' + color + '15;color:' + color + ';"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="' + (a.action === 'added' ? 'M12 5v14M5 12h14' : a.action === 'updated' ? 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' : 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2') + '"/></svg></div><div class="activity-text"><strong>' + ucfirst(a.action) + '</strong> ' + a.entity + (a.name ? ' \u2014 ' + a.name : '') + '<span class="activity-admin">' + (a.admin || '') + '</span></div><div class="activity-time">' + a.time + '</div></div>';
    }).join('');
  });
}

function ucfirst(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

async function clearAllActivities() {
  if (!await showConfirmModal('Clear all activity history?', 'Clear')) return;
  sheets_getAll('activity').then(function (data) {
    if (!data || data.length === 0) { showToast('No activities to clear', 'info'); return; }
    var promises = data.map(function (item) { return sheets_delete('activity', item.id); });
    return Promise.all(promises);
  }).then(function () {
    showToast('Activity history cleared', 'success');
  }).catch(function (err) { showToast(err.message || 'Error clearing activities', 'error'); });
}

function loadDashboard() {
  Promise.all([
    sheets_getAll('products'),
    sheets_getAll('repairs')
  ]).then(function (results) {
    var products = results[0] || [];
    var repairs = results[1] || [];

    var totalProducts = products.length;
    var totalRepairs = repairs.length;
    var pendingRepairs = repairs.filter(function (r) { return r.status === 'Pending' || r.status === 'Diagnosing' || r.status === 'Under Repair'; }).length;
    var deliveredRepairs = repairs.filter(function (r) { return r.status === 'Delivered'; }).length;

    var grid = document.getElementById('statsGrid');
    grid.innerHTML = '\
      <div class="stat-card"><div class="stat-card-header"><span class="stat-card-title">Total Products</span><div class="stat-card-icon" style="background:rgba(59,130,246,0.15);color:#3b82f6;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div></div><div class="stat-card-value">' + totalProducts + '</div></div>\
      <div class="stat-card"><div class="stat-card-header"><span class="stat-card-title">Total Repairs</span><div class="stat-card-icon" style="background:rgba(59,130,246,0.15);color:#3b82f6;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div></div><div class="stat-card-value">' + totalRepairs + '</div></div>\
      <div class="stat-card"><div class="stat-card-header"><span class="stat-card-title">Pending Repairs</span><div class="stat-card-icon" style="background:rgba(234,179,8,0.15);color:#eab308;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div></div><div class="stat-card-value">' + pendingRepairs + '</div></div>\
      <div class="stat-card"><div class="stat-card-header"><span class="stat-card-title">Delivered</span><div class="stat-card-icon" style="background:rgba(34,197,94,0.15);color:#22c55e;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div></div><div class="stat-card-value">' + deliveredRepairs + '</div></div>\
    ';

    loadRecentRepairs(repairs.slice(0, 5));
    loadRecentActivities();
  });
}

function loadRecentRepairs(recent) {
  const container = document.getElementById('recentRepairs');
  if (!container) return;
  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No recent repairs</h3></div>';
    return;
  }
  container.innerHTML = recent.map(function (r) {
    const statusClass = r.status ? r.status.toLowerCase().replace(' ', '-') : '';
    return '<div class="repair-card" style="padding: 12px 0; border: none; border-bottom: 1px solid var(--border-light); border-radius: 0;">\
      <div class="repair-info">\
        <h3 style="font-size: 14px;">' + (r.device || '') + '</h3>\
        <p style="font-size: 12px;">' + (r.customer || '') + ' &middot; ' + (r.phone || '') + '</p>\
      </div>\
      <span class="repair-status status-' + statusClass + '" style="font-size: 11px;">' + (r.status || 'Pending') + '</span>\
    </div>';
  }).join('');
}

var productsData = [];
function findProductById(id) {
  for (var i = 0; i < productsData.length; i++) {
    if (productsData[i].id === id) return productsData[i];
  }
  return null;
}

function loadProductsTable() {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;
  sheets_getAll('products').then(function (data) {
    productsData = data || [];
    filterProductsTable();
  });
}

function filterProductsTable() {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;
  const search = (document.getElementById('productSearchInput') ? document.getElementById('productSearchInput').value : '').toLowerCase();
  const catFilter = document.getElementById('productCategoryFilter') ? document.getElementById('productCategoryFilter').value : 'all';
  var filtered = productsData.filter(function (p) {
    if (catFilter !== 'all' && p.category !== catFilter) return false;
    if (search && !(p.name ? p.name.toLowerCase().includes(search) : false) && !(p.brand ? p.brand.toLowerCase().includes(search) : false)) return false;
    return true;
  });
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><h3>No products found</h3></div></td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(function (p) {
    return '<tr>\
      <td><img class="table-img" src="' + (p.image || '') + '" alt="" loading="lazy" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect fill=%22%23f3f4f6%22 width=%2240%22 height=%2240%22/%3E%3C/svg%3E\'"></td>\
      <td style="font-weight: 600;">' + (p.name || '') + '</td>\
      <td>' + (p.brand || '') + '</td>\
      <td><span class="badge badge-orange">' + (p.category || '') + '</span></td>\
      <td>\u20b9' + Number(p.price || 0).toLocaleString() + '</td>\
      <td><span class="badge ' + (p.stock === 'In Stock' ? 'badge-green' : 'badge-red') + '">' + (p.stock || '') + '</span></td>\
      <td>' + (p.featured === 'yes' ? '<span class="badge badge-blue">Featured</span>' : '') + '</td>\
      <td>' + (p.url ? '<a href="' + p.url + '" target="_blank" class="badge badge-blue" style="text-decoration:none;">Link</a>' : '') + '</td>\
      <td>\
        <div class="table-actions">\
          <button class="btn btn-ghost btn-sm" onclick="editProduct(\'' + p.id + '\')">Edit</button>\
          <button class="btn btn-danger btn-sm" onclick="deleteProduct(\'' + p.id + '\')">Delete</button>\
        </div>\
      </td>\
    </tr>';
  }).join('');
}

function openProductModal() {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('productSubmitBtn').textContent = 'Save';
  openModal('productModal');
}

function editProduct(id) {
  var p = findProductById(id);
  if (!p) return;
  document.getElementById('productId').value = id;
  document.getElementById('productName').value = p.name || '';
  document.getElementById('productBrand').value = p.brand || '';
  document.getElementById('productCategory').value = p.category || '';
  document.getElementById('productImage').value = p.image || '';
  document.getElementById('productPrice').value = p.price || '';
  document.getElementById('productOldPrice').value = p.oldPrice || '';
  document.getElementById('productStock').value = p.stock || 'In Stock';
  document.getElementById('productFeatured').value = p.featured || 'no';
  document.getElementById('productDescription').value = p.description || '';
  document.getElementById('productUrl').value = p.url || '';
  document.getElementById('productSpecs').value = p.specs || '';
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('productSubmitBtn').textContent = 'Update';
  openModal('productModal');
}

function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const data = {
    name: document.getElementById('productName').value,
    brand: document.getElementById('productBrand').value,
    category: document.getElementById('productCategory').value,
    image: document.getElementById('productImage').value,
    price: parseFloat(document.getElementById('productPrice').value) || 0,
    oldPrice: parseFloat(document.getElementById('productOldPrice').value) || 0,
    stock: document.getElementById('productStock').value,
    featured: document.getElementById('productFeatured').value,
    description: document.getElementById('productDescription').value,
    url: document.getElementById('productUrl').value || '',
    specs: document.getElementById('productSpecs').value || ''
  };
  if (!id) data.createdAt = Date.now();
  var saveId = id || null;
  sheets_save('products', saveId, data).then(function () {
    closeModal('productModal');
    showToast(id ? 'Product updated!' : 'Product added!', 'success');
    logActivity(id ? 'updated' : 'added', 'Product', data.name);
    loadProductsTable();
  }).catch(function (err) { showToast(err.message || 'Error saving product', 'error'); });
}

async function deleteProduct(id) {
  if (!await showConfirmModal('Delete this product?')) return;
  var p = findProductById(id);
  var name = p ? p.name : '';
  sheets_delete('products', id).then(function () { showToast('Product deleted', 'success'); logActivity('deleted', 'Product', name); loadProductsTable(); }).catch(function (err) { showToast(err.message || 'Error deleting product', 'error'); });
}

var repairsData = [];
function findRepairById(id) {
  for (var i = 0; i < repairsData.length; i++) {
    if (repairsData[i].id === id) return repairsData[i];
  }
  return null;
}

function loadRepairsTable() {
  const tbody = document.getElementById('repairsTableBody');
  if (!tbody) return;
  sheets_getAll('repairs').then(function (data) {
    repairsData = data || [];
    filterRepairs();
  });
}

function filterRepairs() {
  const tbody = document.getElementById('repairsTableBody');
  if (!tbody) return;
  const search = (document.getElementById('repairSearchInput') ? document.getElementById('repairSearchInput').value : '').toLowerCase();
  var filtered = repairsData.filter(function (r) {
    if (search && !(r.phone ? r.phone.includes(search) : false) && !(r.customer ? r.customer.toLowerCase().includes(search) : false)) return false;
    return true;
  });
  filtered = filtered.slice().reverse();
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><h3>No repairs found</h3></div></td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(function (r) {
    var statusClass = r.status ? r.status.toLowerCase().replace(' ', '-') : '';
    return '<tr>\
      <td style="font-weight: 600;">' + (r.phone || '') + '</td>\
      <td>' + (r.customer || '') + '</td>\
      <td>' + (r.device || '') + '</td>\
      <td>' + (r.issue || '') + '</td>\
      <td>\u20b9' + Number(r.cost || 0).toLocaleString() + '</td>\
      <td><span class="badge badge-orange">' + (r.status || 'Pending') + '</span></td>\
      <td style="font-size: 12px; color: var(--text-muted);">' + (r.lastUpdated || '') + '</td>\
      <td>\
        <div class="table-actions">\
          <button class="btn btn-ghost btn-sm" onclick="editRepair(\'' + r.id + '\')">Edit</button>\
          <button class="btn btn-danger btn-sm" onclick="deleteRepair(\'' + r.id + '\')">Delete</button>\
        </div>\
      </td>\
    </tr>';
  }).join('');
}

function openRepairModal() {
  document.getElementById('repairForm').reset();
  document.getElementById('repairId').value = '';
  document.getElementById('repairModalTitle').textContent = 'Add Repair';
  document.getElementById('repairSubmitBtn').textContent = 'Save';
  openModal('repairModal');
}

function editRepair(id) {
  var r = findRepairById(id);
  if (!r) return;
  document.getElementById('repairId').value = id;
  document.getElementById('repairPhone').value = r.phone || '';
  document.getElementById('repairCustomer').value = r.customer || '';
  document.getElementById('repairDevice').value = r.device || '';
  document.getElementById('repairCost').value = r.cost || '';
  document.getElementById('repairIssue').value = r.issue || '';
  document.getElementById('repairStatus').value = r.status || 'Pending';
  document.getElementById('repairModalTitle').textContent = 'Edit Repair';
  document.getElementById('repairSubmitBtn').textContent = 'Update';
  openModal('repairModal');
}

function saveRepair(e) {
  e.preventDefault();
  const id = document.getElementById('repairId').value;
  const now = new Date();
  const data = {
    phone: document.getElementById('repairPhone').value,
    customer: document.getElementById('repairCustomer').value,
    device: document.getElementById('repairDevice').value,
    cost: parseFloat(document.getElementById('repairCost').value) || 0,
    issue: document.getElementById('repairIssue').value,
    status: document.getElementById('repairStatus').value,
    lastUpdated: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  };
  var saveId = id || null;
  sheets_save('repairs', saveId, data).then(function () {
    closeModal('repairModal');
    showToast(id ? 'Repair updated!' : 'Repair added!', 'success');
    logActivity(id ? 'updated' : 'added', 'Repair', data.customer);
    loadRepairsTable();
  }).catch(function (err) { showToast(err.message || 'Error saving repair', 'error'); });
}

async function deleteRepair(id) {
  if (!await showConfirmModal('Delete this repair record?')) return;
  var r = findRepairById(id);
  var name = r ? r.customer : '';
  sheets_delete('repairs', id).then(function () { showToast('Repair deleted', 'success'); logActivity('deleted', 'Repair', name); loadRepairsTable(); }).catch(function (err) { showToast(err.message || 'Error deleting repair', 'error'); });
}
