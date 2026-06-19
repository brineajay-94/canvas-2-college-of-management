var editingUserId = null;
var assignedSubjects = [];

document.addEventListener('DOMContentLoaded', async () => {
  await authService.init();
  if (!authService.requireAdmin('../login.html')) return;
  loadUsers();
});

async function loadUsers() {
  var tbody = document.getElementById('usersTableBody');
  var filter = (document.getElementById('roleFilter') || {}).value || 'all';
  try {
    var snapshot = await db.collection('users').get();
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><h3>No users found</h3></div></td></tr>';
      return;
    }
    var users = [];
    snapshot.forEach(function (doc) {
      var u = doc.data();
      u._id = doc.id;
      if (filter !== 'all' && u.role !== filter) return;
      users.push(u);
    });
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><h3>No ' + filter + ' users found</h3></div></td></tr>';
      return;
    }
    users.sort(function (a, b) {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return (a.fullName || '').localeCompare(b.fullName || '');
    });
    tbody.innerHTML = '';
    users.forEach(function (u) {
      var tr = document.createElement('tr');
      var subjects = u.assignedSubjects || [];
      var subjectStr = subjects.map(function (s) {
        var label = s.subject || '';
        return label;
      }).join(', ') || '-';

      tr.innerHTML =
        '<td>' + (u.fullName || '-') + '</td>' +
        '<td>' + u.email + '</td>' +
        '<td><span class="badge ' + (u.role === 'admin' ? 'badge-blue' : 'badge-green') + '">' + u.role + '</span></td>' +
        '<td style="font-size:0.85rem;">' + subjectStr + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn btn-sm btn-secondary" onclick="editUser(\'' + u._id + '\')">Edit</button>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteUser(\'' + u._id + '\')">Delete</button>' +
        '</div></td>';
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><h3>Error loading users</h3></div></td></tr>';
  }
}

function openAddUserModal() {
  editingUserId = null;
  assignedSubjects = [];
  document.getElementById('userModalTitle').textContent = 'Add User';
  document.getElementById('userForm').reset();
  document.getElementById('passwordGroup').style.display = '';
  document.getElementById('userPassword').required = true;
  document.getElementById('subjectAssignment').style.display = 'none';
  document.getElementById('subjectCheckboxes').innerHTML = '';
  document.getElementById('subjectAddControls').innerHTML = '';
  document.getElementById('autoAssignInfo').innerHTML = '';
  openModal('userModal');
}

function closeUserModal() {
  closeModal('userModal');
}

async function editUser(userId) {
  try {
    var doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return;
    var u = doc.data();

    editingUserId = userId;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userName').value = u.fullName || '';
    document.getElementById('userEmail').value = u.email || '';
    document.getElementById('passwordGroup').style.display = 'none';
    document.getElementById('userPassword').required = false;
    document.getElementById('userRole').value = u.role || 'teacher';

    assignedSubjects = (u.assignedSubjects || []).map(function (s) {
      return { subject: s.subject || s };
    });

    // Show auto-assignment info
    var autoInfo = document.getElementById('autoAssignInfo');
    try {
      var autoSnap = await db.collection('autoAssignments').where('teacherId', '==', userId).get();
      if (!autoSnap.empty) {
        var list = [];
        autoSnap.forEach(function (adoc) {
          var a = adoc.data();
          list.push(a.sheetName + ' → ' + a.teacherSubject + ' (as ' + a.sheetSubject + ')');
        });
        autoInfo.innerHTML = '<div style="padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:0.85rem;margin-bottom:12px;">' +
          '<strong style="color:#2e7d32;"><i class="fas fa-magic"></i> Auto-assigned:</strong> ' + list.join('; ') + '</div>';
      } else {
        autoInfo.innerHTML = '';
      }
    } catch (e) {
      autoInfo.innerHTML = '';
    }

    renderAssignments();
    toggleSubjectAssignment();
    openModal('userModal');
  } catch (err) {
    showToast('Error loading user', 'error');
  }
}

function toggleSubjectAssignment() {
  var role = document.getElementById('userRole').value;
  var container = document.getElementById('subjectAssignment');
  container.style.display = role === 'teacher' ? 'block' : 'none';
  if (role === 'teacher') {
    buildSubjectPicker();
  }
}

function buildSubjectPicker() {
  var controls = document.getElementById('subjectAddControls');
  var allSubjects = SubjectUtils.getAll();
  var html =
    '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
    '<select id="subjectSelect" class="form-control" style="flex:1;min-width:160px;">' +
    '<option value="">-- Add subject --</option>';
  allSubjects.forEach(function (s) {
    html += '<option value="' + s + '">' + s + '</option>';
  });
  html += '</select>' +
    '<input type="text" id="subjectCustomInput" class="form-control" style="flex:1;min-width:120px;" placeholder="Or type custom name">' +
    '<button type="button" class="btn btn-sm btn-primary" onclick="addSubject()">+ Add</button>' +
    '</div>' +
    '<p style="font-size:12px;color:var(--color-fg-muted);margin-bottom:8px;">The system will auto-match these to sheet columns using fuzzy matching (e.g. "English" matches "Eng", "Com. English", etc.)</p>';
  controls.innerHTML = html;
}

function addSubject() {
  try {
    var select = document.getElementById('subjectSelect');
    if (!select) { showToast('Subject select element not found', 'error'); return; }
    var custom = document.getElementById('subjectCustomInput');
    var subject = select.value;
    if (!subject && custom) subject = custom.value.trim();
    if (!subject) { showToast('Select a subject or type a custom name', 'error'); return; }
    if (custom) custom.value = '';
    select.value = '';
    for (var i = 0; i < assignedSubjects.length; i++) {
      if (assignedSubjects[i].subject.toLowerCase() === subject.toLowerCase()) {
        showToast('"' + subject + '" is already added', 'info');
        return;
      }
    }
    assignedSubjects.push({ subject: subject });
    renderAssignments();
    showToast('"' + subject + '" added', 'success');
  } catch (err) {
    showToast('Error adding subject: ' + err.message, 'error');
  }
}

function renderAssignments() {
  var container = document.getElementById('subjectCheckboxes');
  if (!assignedSubjects.length) {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--color-fg-muted);">No subjects assigned yet.</p>';
    return;
  }
  var html = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
  assignedSubjects.forEach(function (a, i) {
    html += '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:var(--color-canvas-subtle);border-radius:20px;font-size:0.85rem;border:1px solid var(--color-border-default);">' +
      a.subject +
      '<button type="button" class="btn btn-sm btn-danger" style="padding:0 4px;font-size:0.7rem;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;" onclick="removeSubject(' + i + ')"><i class="fas fa-times"></i></button>' +
      '</span>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function removeSubject(index) {
  assignedSubjects.splice(index, 1);
  renderAssignments();
}

document.getElementById('userForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  var name = document.getElementById('userName').value.trim();
  var email = document.getElementById('userEmail').value.trim();
  var password = document.getElementById('userPassword').value;
  var role = document.getElementById('userRole').value;

  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    if (editingUserId) {
      await db.collection('users').doc(editingUserId).update({
        fullName: name,
        email: email,
        role: role,
        assignedSubjects: assignedSubjects
      });
      showToast('User updated successfully');
    } else {
      var userData = await authApi.createUser(email, password, name);
      await db.collection('users').doc(userData.localId).set({
        uid: userData.localId,
        fullName: name,
        email: email,
        role: role,
        assignedSubjects: assignedSubjects,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('User created successfully');
    }

    closeModal('userModal');
    loadUsers();
  } catch (err) {
    showToast(err.message || 'Error saving user', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save User';
  }
});

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  try {
    await db.collection('users').doc(userId).delete();
    showToast('User deleted successfully. Note: Firebase Auth account remains (manual cleanup via Firebase Console).');
    loadUsers();
  } catch (err) {
    showToast(err.message || 'Error deleting user', 'error');
  }
}
