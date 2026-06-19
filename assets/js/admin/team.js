let editingMemberId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await authService.init();
  if (!authService.requireAdmin('../login.html')) return;
  loadTeamMembers();
  renderPositionCheckboxes();
});

function renderPositionCheckboxes(selectedPositions = []) {
  const container = document.getElementById('positionsCheckboxes');
  container.innerHTML = POSITIONS.map(pos => `
    <label class="checkbox-label">
      <input type="checkbox" value="${pos}" ${selectedPositions.includes(pos) ? 'checked' : ''}>
      ${pos}
    </label>
  `).join('');
}

function getSelectedPositions() {
  const checkboxes = document.querySelectorAll('#positionsCheckboxes input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

async function loadTeamMembers() {
  const tbody = document.getElementById('teamTableBody');
  try {
    const snapshot = await db.collection('staff').orderBy('order').get();
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>No team members found</h3></div></td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snapshot.forEach(doc => {
      const m = doc.data();
      const tr = document.createElement('tr');
        tr.innerHTML = `
        <td>
          <img src="${m.imageUrl || 'https://via.placeholder.com/40'}" 
               alt="${m.fullName}" 
               style="width:40px;height:40px;border-radius:50%;object-fit:cover;"
               loading="lazy"
               onerror="this.src='https://via.placeholder.com/40'">
        </td>
        <td>${m.fullName}</td>
        <td>${(m.positions || []).join(', ')}</td>
        <td>${m.subject || '-'}</td>
        <td>${m.contact || '-'}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-secondary" onclick="editMember('${doc.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteMember('${doc.id}')">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>Error loading team members</h3></div></td></tr>';
  }
}

function openAddMemberModal() {
  editingMemberId = null;
  document.getElementById('teamModalTitle').textContent = 'Add Team Member';
  document.getElementById('teamForm').reset();
  renderPositionCheckboxes();
  openModal('teamModal');
}

async function editMember(memberId) {
  try {
    const doc = await db.collection('staff').doc(memberId).get();
    if (!doc.exists) return;
    const m = doc.data();

    editingMemberId = memberId;
    document.getElementById('teamModalTitle').textContent = 'Edit Team Member';
    document.getElementById('memberName').value = m.fullName || '';
    document.getElementById('memberImage').value = m.imageUrl || '';
    document.getElementById('memberContact').value = m.contact || '';
    document.getElementById('memberSubject').value = m.subject || '';
    renderPositionCheckboxes(m.positions || []);
    openModal('teamModal');
  } catch (err) {
    showToast('Error loading member', 'error');
  }
}

document.getElementById('teamForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    fullName: document.getElementById('memberName').value.trim(),
    imageUrl: document.getElementById('memberImage').value.trim(),
    contact: document.getElementById('memberContact').value.trim(),
    subject: document.getElementById('memberSubject').value.trim(),
    positions: getSelectedPositions(),
    order: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!data.fullName) {
    showToast('Full name is required', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    if (editingMemberId) {
      delete data.order;
      await db.collection('staff').doc(editingMemberId).update(data);
      showToast('Member updated successfully');
    } else {
      await db.collection('staff').add(data);
      showToast('Member added successfully');
    }
    closeModal('teamModal');
    loadTeamMembers();
  } catch (err) {
    showToast(err.message || 'Error saving member', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Member';
  }
});

async function deleteMember(memberId) {
  if (!confirm('Are you sure you want to delete this team member?')) return;
  try {
    await db.collection('staff').doc(memberId).delete();
    showToast('Member deleted successfully');
    loadTeamMembers();
  } catch (err) {
    showToast('Error deleting member', 'error');
  }
}


