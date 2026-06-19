let editingRoleId = null;
let tempAssignments = [];
let roleSheetSubjectMap = {};

document.addEventListener('DOMContentLoaded', async () => {
  await authService.init();
  if (!authService.requireAdmin('../login.html')) return;
  await loadRoleSheetSubjects();
  loadRoles();
  updateSubjectOptions();
  document.getElementById('assignProgram')?.addEventListener('change', updateSubjectOptions);
});

async function loadRoleSheetSubjects() {
  roleSheetSubjectMap = {};
  try {
    var snap = await db.collection('resultSheets').get();
    snap.forEach(function (doc) {
      var s = doc.data();
      if (s.subjects && s.subjects.length) {
        roleSheetSubjectMap[doc.id] = { name: s.name || s.tabName || 'Unnamed', subjects: s.subjects };
      }
    });
    // Populate program/class dropdown
    var programSelect = document.getElementById('assignProgram');
    if (programSelect) {
      var ids = Object.keys(roleSheetSubjectMap);
      programSelect.innerHTML = '<option value="">-- Select Class --</option>';
      ids.forEach(function (id) {
        programSelect.innerHTML += '<option value="' + id + '">' + roleSheetSubjectMap[id].name + '</option>';
      });
    }
  } catch (e) {}
}

function updateSubjectOptions() {
  var sheetId = document.getElementById('assignProgram')?.value;
  var subjectSelect = document.getElementById('assignSubject');
  if (!subjectSelect) return;
  subjectSelect.innerHTML = '';
  if (!sheetId || !roleSheetSubjectMap[sheetId]) {
    subjectSelect.innerHTML = '<option value="">-- Select class first --</option>';
    return;
  }
  roleSheetSubjectMap[sheetId].subjects.forEach(function (s) {
    subjectSelect.innerHTML += '<option value="' + s + '">' + s + '</option>';
  });
}

async function loadRoles() {
  const tbody = document.getElementById('rolesTableBody');
  try {
    const snapshot = await db.collection('users').get();
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No users found.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snapshot.forEach(doc => {
      const u = doc.data();
      const tr = document.createElement('tr');
      const subjects = u.assignedSubjects || [];
      const subjectStr = subjects.map(s =>
        (s.subject || '') + ' <span style="color:var(--color-fg-muted);font-size:0.8rem;">(' + (s.sheetName || s.program || '') + ')</span>'
      ).join('<br>') || '-';

      tr.innerHTML = `
        <td>${u.fullName || '-'}</td>
        <td>${u.email}</td>
        <td><span class="badge badge-${u.role}">${u.role}</span></td>
        <td style="font-size:0.85rem;">${subjectStr}</td>
        <td class="actions-cell">
          <button class="btn btn-sm btn-outline" onclick="editRole('${doc.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteRole('${doc.id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-danger-fg);">Error loading users.</td></tr>';
  }
}

function openAddRoleModal() {
  editingRoleId = null;
  tempAssignments = [];
  document.getElementById('roleModalTitle').textContent = 'Add Teacher';
  document.getElementById('roleForm').reset();
  document.getElementById('assignmentList').innerHTML = '';
  openModal('roleModal');
}

async function editRole(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return;
    const u = doc.data();

    editingRoleId = userId;
    document.getElementById('roleModalTitle').textContent = 'Edit User';
    document.getElementById('roleName').value = u.fullName || '';
    document.getElementById('roleEmail').value = u.email || '';
    document.getElementById('rolePassword').required = false;
    document.getElementById('roleRole').value = u.role || 'teacher';

    tempAssignments = (u.assignedSubjects || []).map(a => ({ subject: a.subject, sheetId: a.sheetId, sheetName: a.sheetName }));
    renderAssignmentList();
    openModal('roleModal');
  } catch (err) {
    showToast('Error loading user', 'error');
  }
}

function addAssignment() {
  var sheetId = document.getElementById('assignProgram').value;
  var subject = document.getElementById('assignSubject').value;
  if (!sheetId || !subject) return;

  var exists = tempAssignments.some(function (a) { return a.sheetId === sheetId && a.subject === subject; });
  if (exists) { showToast('This subject is already assigned', 'warning'); return; }

  var sheetName = roleSheetSubjectMap[sheetId] ? roleSheetSubjectMap[sheetId].name : 'Unknown';
  tempAssignments.push({ subject: subject, sheetId: sheetId, sheetName: sheetName });
  renderAssignmentList();
}

function renderAssignmentList() {
  const container = document.getElementById('assignmentList');
  if (tempAssignments.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--color-fg-muted);">No subjects assigned yet.</p>';
    return;
  }

  container.innerHTML = tempAssignments.map(function (a, i) {
    return '<div class="assignment-tag">' +
      '<span>' + a.subject + ' (' + (a.sheetName || 'Unknown') + ')</span>' +
      '<button type="button" onclick="removeAssignment(' + i + ')" style="background:none;border:none;color:var(--color-danger-fg);cursor:pointer;font-size:1.2rem;">&times;</button>' +
      '</div>';
  }).join('');
}

function removeAssignment(index) {
  tempAssignments.splice(index, 1);
  renderAssignmentList();
}

document.getElementById('roleForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('roleName').value.trim();
  const email = document.getElementById('roleEmail').value.trim();
  const password = document.getElementById('rolePassword').value;
  const role = document.getElementById('roleRole').value;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    if (editingRoleId) {
      await db.collection('users').doc(editingRoleId).update({
        fullName: name,
        email,
        role,
        assignedSubjects: tempAssignments
      });
      showToast('User updated successfully');
    } else {
      const userData = await authApi.createUser(email, password, name);

      await db.collection('users').doc(userData.localId).set({
        uid: userData.localId,
        fullName: name,
        email,
        role,
        assignedSubjects: tempAssignments,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showToast('User created successfully');
    }

    closeModal('roleModal');
    loadRoles();
  } catch (err) {
    showToast(err.message || 'Error saving user', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
});

async function deleteRole(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;

  try {
    await db.collection('users').doc(userId).delete();
    showToast('User deleted successfully. Note: Firebase Auth account remains (manual cleanup via Firebase Console).');
    loadRoles();
  } catch (err) {
    showToast(err.message || 'Error deleting user', 'error');
  }
}
