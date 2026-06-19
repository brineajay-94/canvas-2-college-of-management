document.addEventListener('DOMContentLoaded', async () => {
  await authService.init();
  if (!authService.requireAdmin('../login.html')) return;
  setupAvatar();
  loadStats();
});

async function loadStats() {
  try {
    const [usersSnap, staffSnap, sheetsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('staff').get(),
      db.collection('resultSheets').get()
    ]);

    let teachers = 0;
    usersSnap.forEach(doc => {
      if (doc.data().role === 'teacher') teachers++;
    });

    document.getElementById('statTeachers').textContent = teachers;
    document.getElementById('statStaff').textContent = staffSnap.size;
    document.getElementById('statPrograms').textContent = 4;
    document.getElementById('statUsers').textContent = usersSnap.size;
    document.getElementById('statSheets').textContent = sheetsSnap.size;
  } catch (err) {
    showToast('Error loading dashboard stats', 'error');
  }
}
