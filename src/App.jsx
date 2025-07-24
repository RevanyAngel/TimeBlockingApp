import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    deleteDoc, 
    updateDoc, 
    onSnapshot,
    query,
    serverTimestamp,
    setLogLevel
} from 'firebase/firestore';

// --- Firebase Instances (will be initialized later) ---
let app;
let auth;
let db;

// --- Helper function to format time ---
const formatTime = (totalSeconds) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return '00:00:00';
    }
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// --- Main App Component ---
function App() {
    // --- State Management ---
    const [activities, setActivities] = useState([]);
    const [title, setTitle] = useState('');
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');
    const [seconds, setSeconds] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [userId, setUserId] = useState(null);
    const [isFirebaseReady, setIsFirebaseReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- Firebase Initialization Effect ---
    useEffect(() => {
        // IMPORTANT: For local development, replace this with your own Firebase project config.
        const localFirebaseConfig = {
          apiKey: "AIzaSyAQu_EiQsIvTgAMpZcYEOg1XJlx5ek0Ar8",
          authDomain: "my-projects-1eecb.firebaseapp.com",
          projectId: "my-projects-1eecb",
          storageBucket: "my-projects-1eecb.firebasestorage.app",
          messagingSenderId: "406566970928",
          appId: "1:406566970928:web:fb82aa1bf6dbc0f0db2ff5",
          measurementId: "G-74NH9R60XG"
        };

        const envConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
        const configToUse = envConfig || localFirebaseConfig;

        if (configToUse && configToUse.apiKey && !configToUse.apiKey.startsWith("PASTE_")) {
            try {
                app = initializeApp(configToUse);
                auth = getAuth(app);
                db = getFirestore(app);
                setLogLevel('debug');
                setIsFirebaseReady(true);
            } catch (e) {
                console.error("Firebase initialization failed:", e);
                setError("Firebase configuration is invalid.");
                setIsLoading(false);
            }
        } else {
            setError("Firebase is not configured. Please add your project keys to App.jsx.");
            setIsLoading(false);
        }
    }, []); // This effect runs only once on component mount.

    // --- Authentication Effect ---
    useEffect(() => {
        if (!isFirebaseReady) return; // Wait for Firebase to be ready

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                    if (token) {
                        await signInWithCustomToken(auth, token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (err) {
                    console.error("Authentication Error:", err);
                    setError("Could not connect to the service. Please refresh.");
                }
            }
        });
        return () => unsubscribe();
    }, [isFirebaseReady]);

    // --- Firestore Real-time Data Listener ---
    useEffect(() => {
        if (!isFirebaseReady || !userId) return;

        setIsLoading(true);
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
        const activitiesRef = collection(db, 'artifacts', appId, 'users', userId, 'activities');
        const q = query(activitiesRef);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const now = Date.now();
            const activitiesData = querySnapshot.docs.map(doc => {
                const data = doc.data();
                const endTime = data.endTime?.toMillis() || 0;
                const remainingTime = Math.max(Math.round((endTime - now) / 1000), 0);
                
                return {
                    id: doc.id,
                    ...data,
                    remainingTime: remainingTime,
                    isRunning: data.isRunning && remainingTime > 0,
                };
            });
            setActivities(activitiesData);
            setIsLoading(false);
        }, (err) => {
            console.error("Firestore Snapshot Error:", err);
            setError("Failed to load activities. Please check your connection.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isFirebaseReady, userId]);

    // --- Local Timer Countdown Effect ---
    useEffect(() => {
        if (!isFirebaseReady) return;

        const interval = setInterval(() => {
            setActivities(prevActivities =>
                prevActivities.map(act => {
                    if (act.isRunning && act.remainingTime > 0) {
                        const newRemainingTime = act.remainingTime - 1;
                        if (newRemainingTime <= 0) {
                            if (userId) {
                                const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
                                const activityDoc = doc(db, 'artifacts', appId, 'users', userId, 'activities', act.id);
                                updateDoc(activityDoc, { isRunning: false });
                            }
                            return { ...act, remainingTime: 0, isRunning: false };
                        }
                        return { ...act, remainingTime: newRemainingTime };
                    }
                    return act;
                })
            );
        }, 1000);

        return () => clearInterval(interval);
    }, [isFirebaseReady, userId]);

    // --- Form State Persistence (localStorage) ---
    useEffect(() => {
        const storedShowForm = localStorage.getItem("timeblocker_showForm");
        if (storedShowForm) setShowForm(JSON.parse(storedShowForm));
        
        const storedInputs = localStorage.getItem("timeblocker_formInputs");
        if (storedInputs) {
            const { title, hours, minutes, seconds } = JSON.parse(storedInputs);
            setTitle(title || '');
            setHours(hours || '');
            setMinutes(minutes || '');
            setSeconds(seconds || '');
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("timeblocker_showForm", JSON.stringify(showForm));
    }, [showForm]);

    useEffect(() => {
        const inputs = { title, hours, minutes, seconds };
        localStorage.setItem("timeblocker_formInputs", JSON.stringify(inputs));
    }, [title, hours, minutes, seconds]);

    // --- Firestore Actions ---
    const addActivity = async () => {
        if (!title.trim() || !userId) return;
        setError(null);

        const h = parseInt(hours, 10) || 0;
        const m = parseInt(minutes, 10) || 0;
        const s = parseInt(seconds, 10) || 0;
        const durationInSeconds = h * 3600 + m * 60 + s;

        if (durationInSeconds <= 0) {
            setError("Please set a duration greater than zero.");
            return;
        }

        const newActivity = {
            title: title.trim(),
            duration: durationInSeconds,
            endTime: new Date(Date.now() + durationInSeconds * 1000),
            createdAt: serverTimestamp(),
            isRunning: false,
        };

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
            const activitiesRef = collection(db, 'artifacts', appId, 'users', userId, 'activities');
            await addDoc(activitiesRef, newActivity);
            setTitle(''); setHours(''); setMinutes(''); setSeconds(''); setShowForm(false);
        } catch (err) {
            console.error("Error adding activity: ", err);
            setError("Could not save the new activity.");
        }
    };

    const deleteActivity = async (id) => {
        if (!userId) return;
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
            const activityDoc = doc(db, 'artifacts', appId, 'users', userId, 'activities', id);
            await deleteDoc(activityDoc);
        } catch (err) {
            console.error("Error deleting activity: ", err);
            setError("Could not delete the activity.");
        }
    };

    const togglePlay = async (activity) => {
        if (!userId || activity.remainingTime <= 0) return;
        
        const newIsRunning = !activity.isRunning;
        const newEndTime = newIsRunning 
            ? new Date(Date.now() + activity.remainingTime * 1000)
            : activity.endTime;

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
            const activityDoc = doc(db, 'artifacts', appId, 'users', userId, 'activities', activity.id);
            await updateDoc(activityDoc, { isRunning: newIsRunning, endTime: newEndTime });
        } catch (err) {
            console.error("Error toggling play: ", err);
            setError("Could not update the activity state.");
        }
    };

    // --- Render UI ---
    if (!isFirebaseReady && isLoading) {
        return <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center"><p>Loading Firebase...</p></div>;
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-cyan-400">TimeBlock</h1>
                    <p className="text-gray-400 mt-2">Focus on what matters, one block at a time.</p>
                     {userId && (
                        <div className="mt-4 text-xs text-gray-500 bg-gray-800 rounded-full px-3 py-1 inline-block">
                           User ID: {userId}
                        </div>
                    )}
                </header>

                {error && (
                    <div className="bg-red-500/20 text-red-300 p-3 rounded-lg mb-4 text-center cursor-pointer" onClick={() => setError(null)}>
                        {error} (click to dismiss)
                    </div>
                )}

                <div className="mb-6">
                    <button
                        onClick={() => setShowForm(!showForm)}
                        disabled={!isFirebaseReady}
                        className="w-full flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-gray-900 font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-lg shadow-cyan-500/20 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        {showForm ? 'Close Form' : 'Add New Activity'}
                    </button>
                </div>

                {showForm && (
                    <div className="mb-6 p-5 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl">
                        <input className="w-full mb-4 p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" placeholder="What are you working on?" value={title} onChange={(e) => setTitle(e.target.value)} />
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" />
                            <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" max="59" />
                            <input type="number" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="Seconds" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" max="59" />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowForm(false)} className="px-5 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition">Cancel</button>
                            <button onClick={addActivity} className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition">Save Activity</button>
                        </div>
                    </div>
                )}

                {isLoading ? (
                     <div className="text-center py-10 text-gray-400">Loading activities...</div>
                ) : (
                    <div className="space-y-4">
                        {activities.length > 0 ? activities.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)).map((act) => (
                            <div key={act.id} className="p-5 bg-gray-800 border border-gray-700 rounded-lg shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="flex-grow">
                                    <h2 className="text-xl font-semibold text-cyan-300">{act.title}</h2>
                                    <p className="text-gray-400 text-sm">Total Duration: {formatTime(act.duration)}</p>
                                    <p className="text-2xl sm:text-3xl font-mono font-bold text-white my-2">{formatTime(act.remainingTime)}</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <button onClick={() => togglePlay(act)} disabled={act.remainingTime <= 0} className={`w-24 text-center px-4 py-2 font-bold rounded-lg transition ${act.remainingTime <= 0 ? 'bg-gray-600 cursor-not-allowed' : (act.isRunning ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-500 hover:bg-blue-600')}`}>
                                        {act.isRunning ? 'Pause' : 'Play'}
                                    </button>
                                    <button onClick={() => deleteActivity(act.id)} className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition transform hover:scale-110" aria-label="Delete activity">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                    </button>
                                </div>
                            </div>
                        )) : (
                           <div className="text-center py-10 px-4 bg-gray-800/50 rounded-lg">
                               <p className="text-gray-400">No activities yet. Add one to get started!</p>
                           </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
