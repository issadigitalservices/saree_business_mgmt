
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBZrsr_nffGtK2McSK1WKzk1TlGBglu4Zc",
  authDomain: "salemgmt-6af50.firebaseapp.com",
  projectId: "salemgmt-6af50",
  storageBucket: "salemgmt-6af50.firebasestorage.app",
  messagingSenderId: "336444448250",
  appId: "1:336444448250:web:bc9baa518ef53b0b62d843",
  measurementId: "G-CLB754WEZW"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
