let editingSheetId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await authService.init();
  if (!authService.requireAdmin('../login.html')) return;
  loadSheets();
});

async function loadSheets() {
  const tbody = document.getElementById('sheetsTableBody');
  try {
    const snapshot = await db.collection('resultSheets').get();
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No result sheets found. Create one to get started.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snapshot.forEach(doc => {
      const s = doc.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${s.name}</strong></td>
        <td style="font-size:0.85rem;font-family:monospace;">${s.googleSheetId || '-'}</td>
        <td>
          <span class="badge badge-${s.active ? 'active' : 'inactive'}">
            ${s.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>
          <span class="badge badge-${s.published ? 'published' : 'unpublished'}">
            ${s.published ? 'Published' : 'Unpublished'}
          </span>
        </td>
        <td class="actions-cell">
          <button class="btn btn-sm ${s.active ? 'btn-warning' : 'btn-success'}" onclick="toggleActive('${doc.id}', ${!s.active})">
            ${s.active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn btn-sm ${s.published ? 'btn-warning' : 'btn-success'}" onclick="togglePublish('${doc.id}', ${!s.published})">
            ${s.published ? 'Unpublish' : 'Publish'}
          </button>
          <button class="btn btn-sm btn-outline" onclick="editSheet('${doc.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSheet('${doc.id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-danger-fg);">Error loading sheets.</td></tr>';
  }
}

function openAddSheetModal() {
  editingSheetId = null;
  document.getElementById('sheetModalTitle').textContent = 'Add Result Sheet';
  document.getElementById('sheetForm').reset();
  openModal('sheetModal');
}

async function editSheet(sheetId) {
  try {
    const doc = await db.collection('resultSheets').doc(sheetId).get();
    if (!doc.exists) return;
    const s = doc.data();

    editingSheetId = sheetId;
    document.getElementById('sheetModalTitle').textContent = 'Edit Result Sheet';
    document.getElementById('sheetName').value = s.name || '';
    document.getElementById('sheetGoogleId').value = s.googleSheetId || '';
    openModal('sheetModal');
  } catch (err) {
    showToast('Error loading sheet', 'error');
  }
}

document.getElementById('sheetForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('sheetName').value.trim();
  const googleSheetId = document.getElementById('sheetGoogleId').value.trim();

  if (!name) {
    showToast('Sheet name is required', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    if (editingSheetId) {
      await db.collection('resultSheets').doc(editingSheetId).update({
        name,
        googleSheetId
      });
      showToast('Sheet updated successfully');
    } else {
      await db.collection('resultSheets').add({
        name,
        googleSheetId,
        active: false,
        published: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('Sheet created successfully');
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

async function toggleActive(sheetId, active) {
  try {
    await db.collection('resultSheets').doc(sheetId).update({ active });
    showToast(active ? 'Sheet activated' : 'Sheet deactivated');
    loadSheets();
  } catch (err) {
    showToast('Error updating status', 'error');
  }
}

async function togglePublish(sheetId, published) {
  try {
    await db.collection('resultSheets').doc(sheetId).update({ published });
    showToast(published ? 'Result published' : 'Result unpublished');
    loadSheets();
  } catch (err) {
    showToast('Error updating status', 'error');
  }
}

async function deleteSheet(sheetId) {
  if (!confirm('Are you sure you want to delete this result sheet?')) return;
  try {
    await db.collection('resultSheets').doc(sheetId).delete();
    showToast('Sheet deleted successfully');
    loadSheets();
  } catch (err) {
    showToast('Error deleting sheet', 'error');
  }
}

function showConnectHelp() {
  alert(
    'To connect a Google Spreadsheet:\n\n' +
    '1. Open your spreadsheet in Google Sheets\n' +
    '2. The Sheet ID is in the URL between /d/ and /edit\n' +
    '   Example URL: docs.google.com/spreadsheets/d/ABC123/edit\n' +
    '   Sheet ID: ABC123\n\n' +
    '3. Copy the Sheet ID and paste it in the sheet edit form.\n\n' +
    'Note: Google Sheets API integration will be fully functional in the next phase.'
  );
}


