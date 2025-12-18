import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// NOTICE: Using the ID you provided.
// IMPORTANT: To test the "Robot" (Cloud Function) running on your computer,
// we MUST connect to the Emulator. If we connect to the live project,
// the local robot won't see the files!
// Your Backend Project ID
const firebaseConfig = {
    apiKey: "AIzaSyAsXhkps5o176LyZWvwytBEBQM04s3dV10",
    authDomain: "cedar-carving-377410.firebaseapp.com",
    projectId: "cedar-carving-377410",
    storageBucket: "cedar-carving-377410.firebasestorage.app",
    messagingSenderId: "982581640190",
    appId: "1:982581640190:web:0b40861e30cfa89fe79eaf"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Connect to Emulators
// This is critical for testing safely without CORS errors
if (location.hostname === "localhost") {
    console.log("Using Firebase Emulators");
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export default app;