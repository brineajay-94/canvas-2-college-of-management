document.addEventListener('DOMContentLoaded', async function () {
  if (window.location.pathname.includes('login.html')) return;
  await authService.init();
  if (!authService.requireAdmin('login.html')) return;
  loadAdminTheme();
  setupSidebar();
  setupAvatar();
});

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
    links[i].addEventListener('click', function () {
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('show');
      }
    });
  }
}

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  var isOpen = sidebar.classList.toggle('open');
  var overlay = document.getElementById('sidebarOverlay');
  if (overlay) overlay.classList.toggle('show', isOpen);
}

function toggleAdminTheme() {
  var isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('adminTheme', isDark ? 'dark' : 'light');
  var btn = document.querySelector('.header-btn[onclick*="toggleAdminTheme"] i');
  if (btn) btn.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

function loadAdminTheme() {
  var saved = localStorage.getItem('adminTheme') || 'light';
  if (saved === 'dark') {
    document.documentElement.classList.add('dark');
  }
}

function setupAvatar() {
  var avatar = document.getElementById('adminAvatar');
  if (!avatar) return;
  var name = (authService.userData && authService.userData.fullName) || (authService.userData && authService.userData.email) || 'Admin';
  avatar.textContent = name.charAt(0).toUpperCase();
  avatar.title = name;
}

function handleLogout() {
  authService.logout();
}
