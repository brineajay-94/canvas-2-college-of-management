const authService = {
  currentUser: null,
  userData: null,

  async init() {
    return new Promise((resolve) => {
      auth.onAuthStateChanged(async (user) => {
        this.currentUser = user;
        if (user) {
          try {
            const doc = await db.collection('users').doc(user.uid).get();
            this.userData = doc.exists ? doc.data() : null;
            if (this.userData) {
              this.userData.uid = user.uid;
            }
            const idToken = await user.getIdToken();
            sessionStorage.setItem('idToken', idToken);
          } catch (err) {
            console.error('Error fetching user data:', err);
            this.userData = null;
          }
        } else {
          this.userData = null;
          sessionStorage.removeItem('idToken');
        }
        resolve(this.userData);
      });
    });
  },

  async login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },

  async logout() {
    await auth.signOut();
    sessionStorage.clear();
    window.location.href = 'login.html';
  },

  isLoggedIn() {
    return !!this.currentUser;
  },

  isAdmin() {
    return this.userData?.role === 'admin';
  },

  isTeacher() {
    return this.userData?.role === 'teacher';
  },

  getRole() {
    return this.userData?.role || null;
  },

  requireAuth(redirectTo = 'login.html') {
    if (!this.isLoggedIn()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  requireAdmin(redirectTo = 'login.html') {
    if (!this.requireAuth(redirectTo)) return false;
    if (!this.isAdmin()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  requireTeacher(redirectTo = 'login.html') {
    if (!this.requireAuth(redirectTo)) return false;
    if (!this.isTeacher()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  async refreshToken() {
    if (this.currentUser) {
      const token = await this.currentUser.getIdToken(true);
      sessionStorage.setItem('idToken', token);
      return token;
    }
    return null;
  },

  async changePassword(newPassword) {
    if (this.currentUser) {
      await this.currentUser.updatePassword(newPassword);
    }
  },

  async updateProfile(data) {
    if (!this.currentUser || !this.userData) throw new Error('Not authenticated');
    await db.collection('users').doc(this.currentUser.uid).update(data);
    Object.assign(this.userData, data);
  }
};
