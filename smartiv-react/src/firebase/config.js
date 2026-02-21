// ============================================================
//  SmartIV ICU — Firebase Configuration
//  Replace the values below with your actual Firebase project.
// ============================================================
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyDEMO_REPLACE_WITH_YOUR_KEY",
    authDomain: "smart-iv-monitor.firebaseapp.com",
    databaseURL: "https://smart-iv-monitor-default-rtdb.firebaseio.com",
    projectId: "smart-iv-monitor",
    storageBucket: "smart-iv-monitor.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456",
};

const app = initializeApp(firebaseConfig);

// Firestore — for persistent documents (patients, nurses, alert_history)
export const db = getFirestore(app);

// Realtime Database — for live hardware sensor pushes
export const rtdb = getDatabase(app);

export default app;
