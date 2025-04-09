// src/contexts/AuthContext.js
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';

// Create auth context
const AuthContext = createContext();

// Auth context provider component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sign up with email and password
  async function signup(email, password, name) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Create a user document in Firestore
      await setDoc(doc(firestore, 'users', user.uid), {
        uid: user.uid,
        email,
        name,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      });
      
      return user;
    } catch (error) {
      throw error;
    }
  }

  // Sign in with email and password
  async function login(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Update last login time
      await setDoc(doc(firestore, 'users', userCredential.user.uid), {
        lastLogin: serverTimestamp()
      }, { merge: true });
      
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  }

  // Sign in with Google
  async function loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      
      try {
        // Check if user exists in Firestore, if not create a new document
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        
        if (!userDoc.exists()) {
          await setDoc(doc(firestore, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            name: user.displayName,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
          });
        } else {
          // Update last login time
          await setDoc(doc(firestore, 'users', user.uid), {
            lastLogin: serverTimestamp()
          }, { merge: true });
        }
      } catch (firestoreError) {
        // If Firestore operations fail due to offline status, we'll still continue
        // The user is still authenticated, just the Firestore update failed
        console.warn('Firestore update failed, but authentication successful:', firestoreError);
        // We don't rethrow this error since auth was successful
      }
      
      return user;
    } catch (error) {
      throw error;
    }
  }

  // Logout
  async function logout() {
    return signOut(auth);
  }

  // Reset password
  async function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Context value
  const value = {
    user,
    loading,
    signup,
    login,
    loginWithGoogle,
    logout,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  return useContext(AuthContext);
}