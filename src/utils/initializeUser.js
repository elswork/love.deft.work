import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const MAESTRO_EMAIL = 'elswork@gmail.com';

export const initializeUser = async (user) => {
    if (!user) return null;

    const userRef = doc(db, 'users', user.uid);

    try {
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            return userDoc.data();
        }

        // Determine initial rank
        const initialRank = user.email === MAESTRO_EMAIL ? 'maestro' : 'ciudadano';

        // Create new user document
        const userData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            photoURL: user.photoURL || null,
            rank: initialRank,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        await setDoc(userRef, userData);
        return userData;
    } catch (error) {
        console.error('Error initializing user:', error);
        return null;
    }
};
