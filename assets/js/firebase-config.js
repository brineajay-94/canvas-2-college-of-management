const firebaseConfig = {
  apiKey: "AIzaSyDC-_dYj0A-Kul3pXiiX9wtPXCTF6NE8Rk",
  authDomain: "canvas-3538a.firebaseapp.com",
  projectId: "canvas-3538a",
  storageBucket: "canvas-3538a.firebasestorage.app",
  messagingSenderId: "380620350978",
  appId: "1:380620350978:web:3de3c5ea17f7cf4127291b",
  measurementId: "G-8X8X0YRNTF"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

if (typeof firebase.analytics !== 'undefined') {
  firebase.analytics();
}
