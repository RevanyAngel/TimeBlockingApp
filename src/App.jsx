import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
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

// --- Edit Modal Component ---
const EditModal = ({ activity, onSave, onClose }) => {
    const [title, setTitle] = useState(activity.title);
    const initialHours = Math.floor(activity.initialDuration / 3600);
    const initialMinutes = Math.floor((activity.initialDuration % 3600) / 60);
    const initialSeconds = activity.initialDuration % 60;

    const [hours, setHours] = useState(initialHours);
    const [minutes, setMinutes] = useState(initialMinutes);
    const [seconds, setSeconds] = useState(initialSeconds);

    const handleSave = () => {
        const newDuration = (parseInt(hours, 10) * 3600) + (parseInt(minutes, 10) * 60) + parseInt(seconds, 10);
        onSave(activity.id, {
            title: title,
            initialDuration: newDuration,
            // Hanya update durasi jika task belum berjalan
            ...(!activity.isRunning && { duration: newDuration })
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-white">Edit Aktivitas</h2>
                <input
                    className="w-full mb-4 p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition"
                    placeholder="Apa yang sedang Anda kerjakan?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Jam" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" />
                    <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Menit" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" max="59" />
                    <input type="number" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="Detik" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" max="59" />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition">Batal</button>
                    <button onClick={handleSave} className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition">Simpan Perubahan</button>
                </div>
            </div>
        </div>
    );
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
    const [editingActivity, setEditingActivity] = useState(null);
    const [tick, setTick] = useState(0);
    const completionInProgress = useRef(null); // Ref to prevent race conditions

    // Create a ref to hold the latest activities state for use in setInterval
    const activitiesRef = useRef(activities);
    useEffect(() => {
        activitiesRef.current = activities;
    }, [activities]);

    // --- Firebase Initialization Effect ---
    useEffect(() => {
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
                if (!app) {
                    app = initializeApp(configToUse);
                    auth = getAuth(app);
                    db = getFirestore(app);
                    setLogLevel('debug');
                }
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
    }, []);

    // --- Authentication Effect ---
    useEffect(() => {
        if (!isFirebaseReady) return;
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                    if (token) await signInWithCustomToken(auth, token);
                    else await signInAnonymously(auth);
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
        const activitiesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'activities');
        const q = query(activitiesCollectionRef);
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const activitiesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setActivities(activitiesData);
            setIsLoading(false);
        }, (err) => {
            console.error("Firestore Snapshot Error:", err);
            setError("Failed to load activities. Please check your connection.");
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [isFirebaseReady, userId]);

    // --- Helper to calculate remaining time on-the-fly ---
    const getRemainingTime = useCallback((activity) => {
        if (activity.isCompleted) return 0;
        if (!activity.isRunning || !activity.endTime) {
            return activity.duration;
        }
        const endTimeMs = activity.endTime.toMillis();
        const nowMs = Date.now();
        return Math.max(0, Math.round((endTimeMs - nowMs) / 1000));
    }, []);

    const togglePlay = useCallback(async (activity) => {
        if (!userId || activity.isCompleted) return;
        const newIsRunning = !activity.isRunning;
        let updates = { isRunning: newIsRunning };
        if (newIsRunning) { // Play
            updates.endTime = new Date(Date.now() + getRemainingTime(activity) * 1000);
        } else { // Pause
            updates.endTime = null;
            updates.duration = getRemainingTime(activity);
        }
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
            const activityDoc = doc(db, 'artifacts', appId, 'users', userId, 'activities', activity.id);
            await updateDoc(activityDoc, updates);
        } catch (err) {
            console.error("Error toggling play: ", err);
            setError("Could not update the activity state.");
        }
    }, [userId, getRemainingTime]);

    const handleTaskCompletion = useCallback(async (completedActivity) => {
        if (!userId) {
            completionInProgress.current = null; // Ensure lock is cleared
            return;
        }
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
        
        const sortedActivities = [...activitiesRef.current].sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
        const completedIndex = sortedActivities.findIndex(a => a.id === completedActivity.id);
        const nextTask = sortedActivities.find((task, index) => index > completedIndex && !task.isCompleted);

        const activityDoc = doc(db, 'artifacts', appId, 'users', userId, 'activities', completedActivity.id);
        await updateDoc(activityDoc, {
            isRunning: false,
            isCompleted: true,
            endTime: null,
            duration: 0,
        });

        if (nextTask) {
            await togglePlay(nextTask);
        }
        
        completionInProgress.current = null; // Unlock after all operations
    }, [userId, togglePlay]);

    // --- Global Timer Tick & Auto-Play Logic ---
    useEffect(() => {
        const interval = setInterval(() => {
            const runningActivity = activitiesRef.current.find(a => a.isRunning && !a.isCompleted);
            if (runningActivity) {
                const endTimeMs = runningActivity.endTime?.toMillis();
                if (endTimeMs && Date.now() >= endTimeMs && completionInProgress.current !== runningActivity.id) {
                    completionInProgress.current = runningActivity.id; // Lock the task
                    handleTaskCompletion(runningActivity);
                }
            }
            setTick(prevTick => prevTick + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [handleTaskCompletion]); // Dependency added here

    // --- Form State Persistence (localStorage) ---
    useEffect(() => {
        const storedShowForm = localStorage.getItem("timeblocker_showForm");
        if (storedShowForm) setShowForm(JSON.parse(storedShowForm));
        const storedInputs = localStorage.getItem("timeblocker_formInputs");
        if (storedInputs) {
            const { title, hours, minutes, seconds } = JSON.parse(storedInputs);
            setTitle(title || ''); setHours(hours || ''); setMinutes(minutes || ''); setSeconds(seconds || '');
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("timeblocker_showForm", JSON.stringify(showForm));
    }, [showForm]);

    useEffect(() => {
        localStorage.setItem("timeblocker_formInputs", JSON.stringify({ title, hours, minutes, seconds }));
    }, [title, hours, minutes, seconds]);

    // --- Firestore Actions ---
    const handleUpdateActivity = async (id, updatedData) => {
        if (!userId) return;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
        const activityDoc = doc(db, 'artifacts', appId, 'users', userId, 'activities', id);
        try {
            await updateDoc(activityDoc, updatedData);
            setEditingActivity(null); // Tutup modal setelah berhasil
        } catch (err) {
            console.error("Error updating activity: ", err);
            setError("Could not update the activity.");
        }
    };
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
            initialDuration: durationInSeconds, // Store the original duration
            duration: durationInSeconds,
            endTime: null,
            createdAt: serverTimestamp(),
            isRunning: false,
            isCompleted: false,
            order: activities.filter(a => !a.isCompleted).length,
        };
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
            const activitiesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'activities');
            await addDoc(activitiesCollectionRef, newActivity);
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
    
    const onDragEnd = (result) => {
        const { destination, source } = result;

        // Keluar jika pengguna menggeser ke luar area yang valid
        if (!destination) {
            return;
        }

        // Keluar jika posisi tidak berubah
        if (destination.droppableId === source.droppableId && destination.index === source.index) {
            return;
        }

        // Dapatkan hanya task yang aktif dan urutkan berdasarkan 'order'
        const activeTasks = [...activities].filter(a => !a.isCompleted).sort((a, b) => a.order - b.order);
        
        // Pindahkan item yang digeser ke posisi baru
        const [reorderedItem] = activeTasks.splice(source.index, 1);
        activeTasks.splice(destination.index, 0, reorderedItem);

        // Update 'order' field untuk setiap task dan siapkan untuk update batch
        const updates = activeTasks.map((task, index) => {
            const taskRef = doc(db, 'artifacts', appId, 'users', userId, 'activities', task.id);
            return updateDoc(taskRef, { order: index });
        });

        // Jalankan semua update sekaligus untuk efisiensi
        Promise.all(updates).catch(err => {
            console.error("Failed to reorder tasks", err);
            setError("Gagal memperbarui urutan tugas.");
        });
    };

    // --- Calculate Estimated Completion Times ---
    const estimatedTimes = useMemo(() => {
        const estimates = new Map();
        let cumulativeTime = Date.now(); // Mulai dari waktu sekarang

        // Urutkan aktivitas: yang berjalan, lalu yang belum selesai, berdasarkan waktu dibuat
        const sortedActivities = [...activities]
            .filter(a => !a.isCompleted)
            .sort((a, b) => {
                if (a.isRunning && !b.isRunning) return -1;
                if (!a.isRunning && b.isRunning) return 1;
                return a.order - b.order;
            });

        for (const activity of sortedActivities) {
            const remainingSeconds = getRemainingTime(activity);
            cumulativeTime += remainingSeconds * 1000; // Tambahkan durasi dalam milidetik
            estimates.set(activity.id, new Date(cumulativeTime));
        }

        return estimates;
    }, [activities, getRemainingTime, tick]); // <-- `tick` ditambahkan sebagai dependency


    // --- Render UI ---
    if (!isFirebaseReady && isLoading) {
        return <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center"><p>Loading Firebase...</p></div>;
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans p-4 sm:p-6 lg:p-8">
          {editingActivity && (
                <EditModal 
                    activity={editingActivity}
                    onSave={handleUpdateActivity}
                    onClose={() => setEditingActivity(null)}
                />
            )}
            <div className="max-w-2xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-cyan-400">TimeBlock</h1>
                    <p className="text-gray-400 mt-2">Focus on what matters, one block at a time.</p>
                     {userId && (<div className="mt-4 text-xs text-gray-500 bg-gray-800 rounded-full px-3 py-1 inline-block">User ID: {userId}</div>)}
                </header>

                {error && (<div className="bg-red-500/20 text-red-300 p-3 rounded-lg mb-4 text-center cursor-pointer" onClick={() => setError(null)}>{error} (click to dismiss)</div>)}

                <div className="mb-6">
                    <button onClick={() => setShowForm(!showForm)} disabled={!isFirebaseReady} className="w-full flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-gray-900 font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-lg shadow-cyan-500/20 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        {showForm ? 'Tutup Form' : 'Tambah Aktivitas Baru'}
                    </button>
                </div>

                {showForm && (
                    <div className="mb-6 p-5 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl">
                        <input className="w-full mb-4 p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" placeholder="Apa yang sedang Anda kerjakan?" value={title} onChange={(e) => setTitle(e.target.value)} />
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Jam" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" />
                            <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Menit" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" max="59" />
                            <input type="number" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="Detik" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" max="59" />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowForm(false)} className="px-5 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition">Batal</button>
                            <button onClick={addActivity} className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition">Simpan Aktivitas</button>
                        </div>
                    </div>
                )}

                {isLoading ? (<div className="text-center py-10 text-gray-400">Memuat aktivitas...</div>) : (
                    <div className="space-y-4">
                        {activities.length > 0 ? [...activities]
                            .sort((a, b) => {
                                if (a.isCompleted !== b.isCompleted) {
                                    return a.isCompleted ? 1 : -1; // false (unfinished) comes first
                                }
                                return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
                            })
                            .map((act) => {
                                const remainingTime = getRemainingTime(act);
                                const estimatedFinishTime = estimatedTimes.get(act.id); // <-- AMBIL ESTIMASI
                                return (
                                    <div key={act.id} 
                                        onClick={() => !act.isCompleted && !act.isRunning && setEditingActivity(act)}
                                        className={`p-5 border border-gray-700 rounded-lg shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-300 ${act.isCompleted ? 'bg-gray-800/50 opacity-60' : 'bg-gray-800'} ${!act.isCompleted && !act.isRunning && 'cursor-pointer hover:border-cyan-500'}`}>
                                        <div className="flex-grow">
                                            <h2 className="text-xl font-semibold text-cyan-300">{act.title}</h2>
                                            <p className="text-gray-400 text-sm">Durasi Awal: {formatTime(act.initialDuration)}</p>
                                            {estimatedFinishTime && (
                                                <p className="text-sm text-cyan-400/80">
                                                    Estimasi Selesai: {estimatedFinishTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            )}
                                            <p className="text-2xl sm:text-3xl font-mono font-bold text-white my-2">{formatTime(remainingTime)}</p>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            <button onClick={(e) => {
                                                      e.stopPropagation(); // Hentikan perambatan klik
                                                      togglePlay(act);
                                                  }} disabled={act.isCompleted} className={`w-24 text-center px-4 py-2 font-bold rounded-lg transition ${act.isCompleted ? 'bg-gray-600 cursor-not-allowed' : (act.isRunning ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-500 hover:bg-blue-600')}`}>
                                                {act.isRunning ? 'Jeda' : 'Mulai'}
                                            </button>
                                            <button onClick={(e) => {
                                                      e.stopPropagation(); // Hentikan perambatan klik
                                                      deleteActivity(act.id);
                                                  }} className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition transform hover:scale-110" aria-label="Delete activity">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : (
                           <div className="text-center py-10 px-4 bg-gray-800/50 rounded-lg">
                               <p className="text-gray-400">Belum ada aktivitas. Tambahkan satu untuk memulai!</p>
                           </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
