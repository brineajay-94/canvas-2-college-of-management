window.authApi = {
  async createUser(email, password, displayName) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, returnSecureToken: true })
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error.message);
    }
    return res.json();
  }
};
