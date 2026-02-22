import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAnalytics, isSupported } from "firebase/analytics";

/**
 * Firebase Configuration — IR Monitoring System
 * Production-ready configuration with safety fallbacks.
 */
const firebaseConfig = {
    apiKey: "AIzaSyAJNIwyPoVkPwtohLZS9PTj4GSZupbFtRg",
    authDomain: "ir-monitoring-system.firebaseapp.com",
    databaseURL: "https://ir-monitoring-system-default-rtdb.firebaseio.com",
    projectId: "ir-monitoring-system",
    storageBucket: "ir-monitoring-system.firebasestorage.app",
    messagingSenderId: "317166104017",
    appId: "1:317166104017:web:30e1aefc6ba689031b04f0",
    measurementId: "G-KGQM6B8762"
};

// Initialize Firebase only once
let app;
try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
    console.error("Firebase app initialization failed:", error);
}

// Export Database Instances with safety checks
export const db = app ? getFirestore(app) : null;
export const rtdb = (app && firebaseConfig.databaseURL) ? getDatabase(app) : null;

// Analytics (Safe for Browser)
export const analytics = (typeof window !== "undefined" && app)
    ? isSupported().then(yes => yes ? getAnalytics(app) : null)
    : Promise.resolve(null);

// Path helpers for consistency
export const getBedPath = (ward, bedId) => `hospital/${ward}/${bedId}`;
export const getControlPath = (ward, bedId) => `hospital/${ward}/${bedId}/control`;
export const getHistoryPath = (ward, bedId) => `hospital/${ward}/${bedId}/history`;

export default app;
