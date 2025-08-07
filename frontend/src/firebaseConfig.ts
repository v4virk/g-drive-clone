// Import the functions you need from the SDKs you need

import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getAnalytics } from "firebase/analytics";


// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCM10la7lYYRXDzvI0Ykfowe_QWS8mLHco",
  authDomain: "drive-clone-5a77d.firebaseapp.com",
  projectId: "drive-clone-5a77d",
  storageBucket: "drive-clone-5a77d.firebasestorage.app",
  messagingSenderId: "519808567261",
  appId: "1:519808567261:web:fc5cd76fdccc95ce131834",
  measurementId: "G-Z0BE351NCM"
};

// Initialize Firebase


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const analytics = getAnalytics(app);
