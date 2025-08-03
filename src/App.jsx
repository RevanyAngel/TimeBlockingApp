import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

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

// --- Sound Notification Function ---
const playSound = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
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
            ...(!activity.isRunning && { duration: newDuration })
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-white">Edit Activity</h2>
                <input
                    className="w-full mb-4 p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition"
                    placeholder="What are you working on?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" />
                    <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" max="59" />
                    <input type="number" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="Seconds" className="p-3 bg-gray-700 border-2 border-gray-600 rounded-md focus:outline-none focus:border-cyan-500 transition" min="0" max="59" />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition">Cancel</button>
                    <button onClick={handleSave} className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

// --- Fullscreen Timer Modal Component ---
const FullscreenTimer = ({ activity, nextActivity, remainingTime, estimatedFinishTime, isRunning, onToggle, onReset, onClose }) => {
    const progress = (activity.initialDuration - remainingTime) / activity.initialDuration;
    const circumference = 2 * Math.PI * 140; // 140 is the radius
    const strokeDashoffset = circumference * (1 - progress);
    const canReset = !isRunning && remainingTime < activity.initialDuration;

    return (
        <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50 p-4">
            <button onClick={onClose} className="absolute top-6 right-6 text-gray-500 hover:text-white transition">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            
            <h2 className="text-3xl sm:text-4xl font-bold text-cyan-300 mb-4 text-center">{activity.title}</h2>
            
            <div className="relative w-80 h-80 sm:w-96 sm:h-96 flex items-center justify-center">
                <svg className="absolute w-full h-full" viewBox="0 0 300 300">
                    <circle cx="150" cy="150" r="140" stroke="#374151" strokeWidth="12" fill="none" />
                    <circle
                        cx="150"
                        cy="150"
                        r="140"
                        stroke="#22d3ee"
                        strokeWidth="12"
                        fill="none"
                        strokeLinecap="round"
                        transform="rotate(-90 150 150)"
                        style={{
                            strokeDasharray: circumference,
                            strokeDashoffset: strokeDashoffset,
                            transition: 'stroke-dashoffset 0.5s linear'
                        }}
                    />
                </svg>
                <div className="z-10 text-center">
                    <p className="text-6xl sm:text-7xl font-mono font-bold text-white">{formatTime(remainingTime)}</p>
                    {estimatedFinishTime && (
                        <p className="text-lg text-gray-400 mt-2 flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="m12 6-0.01 6L16 14"></path></svg>
                            {estimatedFinishTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-6 mt-8">
                <button onClick={onToggle} className={`w-20 h-20 flex items-center justify-center rounded-full transition-transform transform hover:scale-110 ${isRunning ? 'bg-yellow-500' : 'bg-blue-500'}`}>
                    {isRunning ? 
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="text-white"><path d="M8 7h3v10H8zm5 0h3v10h-3z"></path></svg> :
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="text-white ml-1"><path d="M7 6v12l10-6z"></path></svg>
                    }
                </button>
                {canReset && (
                    <button onClick={onReset} className="w-16 h-16 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 transition-transform transform hover:scale-110">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M21 21v-5h-5"></path></svg>
                    </button>
                )}
            </div>
            <div className="absolute bottom-8 text-center">
                {nextActivity ? (
                    <>
                        <p className="text-gray-500 text-sm uppercase tracking-wider">Up Next</p>
                        <p className="text-gray-300 text-lg">{nextActivity.title} ({formatTime(nextActivity.initialDuration)})</p>
                    </>
                ) : (
                    <p className="text-gray-500 text-sm">This is the last task</p>
                )}
            </div>
        </div>
    );
};

// --- Congrats Modal Component ---
const CongratsModal = ({ onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md text-center">
                <h2 className="text-3xl font-bold mb-4 text-yellow-400">Yay! Congrats!</h2>
                <p className="text-lg text-gray-300 mb-6">You did it. I know you could nail it, huh?</p>
                <button 
                    onClick={onClose} 
                    className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-gray-900 font-semibold rounded-lg transition-transform transform hover:scale-105"
                >
                    Close
                </button>
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
    const [fullscreenActivityId, setFullscreenActivityId] = useState(null);
    const [showCongratsModal, setShowCongratsModal] = useState(false);
    const [tick, setTick] = useState(0);
    const [isGlobalTimerRunning, setGlobalTimerRunning] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState('default');
    const completionInProgress = useRef(null);

    const activitiesRef = useRef(activities);
    useEffect(() => {
        activitiesRef.current = activities;
    }, [activities]);

    const isGlobalTimerRunningRef = useRef(isGlobalTimerRunning);
    useEffect(() => {
        isGlobalTimerRunningRef.current = isGlobalTimerRunning;
    }, [isGlobalTimerRunning]);

    // --- Firebase & Notification Permission Initialization Effect ---
    useEffect(() => {
        setNotificationPermission(Notification.permission);

        const firebaseConfig = {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
            measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
        };
        const envConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
        const configToUse = envConfig || firebaseConfig;
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
            const runningTask = activitiesData.find(a => a.isRunning);
            setGlobalTimerRunning(!!runningTask);
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
        if (!activity || activity.isCompleted) return 0;
        if (!activity.isRunning || !activity.endTime) return activity.duration;
        const endTimeMs = activity.endTime.toMillis();
        const nowMs = Date.now();
        return Math.max(0, Math.round((endTimeMs - nowMs) / 1000));
    }, []);

    const updateActivityStatus = useCallback(async (activity, updates) => {
        if (!userId) return;
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
            const activityDoc = doc(db, 'artifacts', appId, 'users', userId, 'activities', activity.id);
            await updateDoc(activityDoc, updates);
        } catch (err) {
            console.error("Error updating activity status:", err);
            setError("Could not update the activity state.");
        }
    }, [userId]);

    const handleTaskCompletion = useCallback(async (completedActivity, wasSessionRunning) => {
        if (!userId || !completedActivity || completionInProgress.current === completedActivity.id) {
            return;
        }
        completionInProgress.current = completedActivity.id;
        
        if (Notification.permission === 'granted') {
            new Notification('Task Complete!', {
                body: `You've completed: "${completedActivity.title}"`,
            });
            playSound();
        }

        const remainingTimeOnCompletion = getRemainingTime(completedActivity);
        const timeSpentOnThisRun = completedActivity.initialDuration - remainingTimeOnCompletion;
        const newTotalTimeSpent = (completedActivity.timeSpent || 0) + timeSpentOnThisRun;

        const sortedActivities = [...activitiesRef.current]
            .filter(a => !a.isCompleted)
            .sort((a, b) => a.order - b.order);
        const completedIndex = sortedActivities.findIndex(a => a.id === completedActivity.id);
        const nextTask = sortedActivities[completedIndex + 1];

        await updateActivityStatus(completedActivity, {
            isRunning: false,
            isCompleted: true,
            endTime: null,
            duration: 0,
            timeSpent: newTotalTimeSpent,
        });

        if (nextTask && wasSessionRunning) {
            await updateActivityStatus(nextTask, {
                isRunning: true,
                endTime: new Date(Date.now() + getRemainingTime(nextTask) * 1000),
            });
        } else {
            setGlobalTimerRunning(false);
            if (!nextTask) {
                setShowCongratsModal(true);
            }
        }
        completionInProgress.current = null;
    }, [userId, getRemainingTime, updateActivityStatus]);
    
    // --- Timer Completion Check Effect (THE FIX) ---
    useEffect(() => {
        // Hanya periksa jika timer global seharusnya berjalan
        if (!isGlobalTimerRunningRef.current) {
            return;
        }

        const runningActivity = activitiesRef.current.find(a => a.isRunning && !a.isCompleted);

        if (runningActivity) {
            const remainingTime = getRemainingTime(runningActivity);
            
            // Jika waktu habis, selesaikan tugas
            if (remainingTime <= 0) {
                // Gunakan ref 'completionInProgress' untuk mencegah pemanggilan ganda
                if (completionInProgress.current !== runningActivity.id) {
                    console.log(`Timer for "${runningActivity.title}" expired. Completing task.`);
                    // Argumen 'true' menandakan sesi sedang berjalan, sehingga tugas berikutnya akan dimulai secara otomatis
                    handleTaskCompletion(runningActivity, true);
                }
            }
        }
    }, [tick, getRemainingTime, handleTaskCompletion]); // Dijalankan setiap detik karena state 'tick'

    // --- Global Timer Tick ---
    useEffect(() => {
        const interval = setInterval(() => {
            setTick(prevTick => prevTick + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // --- Visibility Change Handler (Fix for Mobile Bug) ---
    const handleVisibilityChange = useCallback(() => {
        if (document.visibilityState === 'visible') {
            const runningActivity = activitiesRef.current.find(a => a.isRunning && !a.isCompleted);
            if (runningActivity) {
                const endTimeMs = runningActivity.endTime?.toMillis();
                if (endTimeMs && Date.now() >= endTimeMs) {
                    console.log("Catching up on missed completion...");
                    handleTaskCompletion(runningActivity, true); // Assume session was running
                }
            }
        }
    }, [handleTaskCompletion]);

    useEffect(() => {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [handleVisibilityChange]);

    // --- Global Play/Pause Handler ---
    const handleGlobalToggle = () => {
        setGlobalTimerRunning(prev => !prev);
    };

    useEffect(() => {
        const activeTasks = activities.filter(a => !a.isCompleted).sort((a, b) => a.order - b.order);
        const currentlyRunning = activeTasks.find(a => a.isRunning);
        const topTask = activeTasks[0];

        if (isGlobalTimerRunning) {
            if (topTask && !topTask.isRunning) {
                if (currentlyRunning) {
                    updateActivityStatus(currentlyRunning, { isRunning: false, duration: getRemainingTime(currentlyRunning), endTime: null });
                }
                updateActivityStatus(topTask, { isRunning: true, endTime: new Date(Date.now() + getRemainingTime(topTask) * 1000) });
            } else if (!topTask) {
                setGlobalTimerRunning(false);
            }
        } else {
            if (currentlyRunning) {
                updateActivityStatus(currentlyRunning, { isRunning: false, duration: getRemainingTime(currentlyRunning), endTime: null });
            }
        }
    }, [isGlobalTimerRunning, activities, getRemainingTime, updateActivityStatus]);

    // --- Fullscreen Transition Effect ---
    useEffect(() => {
        if (!fullscreenActivityId) return;

        const currentFullscreenTask = activities.find(a => a.id === fullscreenActivityId);
        const nextRunningTask = activities.find(a => a.isRunning && !a.isCompleted);

        if (currentFullscreenTask && currentFullscreenTask.isCompleted) {
            if (nextRunningTask) {
                setFullscreenActivityId(nextRunningTask.id);
            } else {
                setFullscreenActivityId(null);
            }
        } else if (!currentFullscreenTask) {
            setFullscreenActivityId(null);
        }
    }, [activities, fullscreenActivityId]);

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
            setEditingActivity(null);
        } catch (err) {
            console.error("Error updating activity: ", err);
            setError("Could not update the activity.");
        }
    };

    const handleReset = async (activity) => {
        if (!userId || activity.isCompleted) return;
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
            const activityDoc = doc(db, 'artifacts', appId, 'users', userId, 'activities', activity.id);
            await updateDoc(activityDoc, {
                duration: activity.initialDuration,
                isRunning: false,
                endTime: null,
            });
            setGlobalTimerRunning(false);
        } catch (err) {
            console.error("Error resetting activity: ", err);
            setError("Could not reset the activity.");
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
            initialDuration: durationInSeconds,
            duration: durationInSeconds,
            endTime: null,
            createdAt: serverTimestamp(),
            isRunning: false,
            isCompleted: false,
            order: activities.length,
            timeSpent: 0,
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
        if (!destination) return;

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-time-blocker';
        const activeTasks = activities.filter(a => !a.isCompleted).sort((a, b) => a.order - b.order);
        const completedTasks = activities.filter(a => a.isCompleted).sort((a, b) => a.order - b.order);

        if (source.droppableId === destination.droppableId) {
            const list = source.droppableId === 'active' ? activeTasks : completedTasks;
            const [reorderedItem] = list.splice(source.index, 1);
            list.splice(destination.index, 0, reorderedItem);
            
            const updates = list.map((task, index) => {
                const taskRef = doc(db, 'artifacts', appId, 'users', userId, 'activities', task.id);
                return updateDoc(taskRef, { order: index });
            });
            Promise.all(updates).catch(err => setError("Failed to reorder tasks."));

        } else {
            const [movedItem] = completedTasks.splice(source.index, 1);
            movedItem.isCompleted = false;
            movedItem.duration = movedItem.initialDuration;
            activeTasks.splice(destination.index, 0, movedItem);

            const updates = [];
            const movedItemRef = doc(db, 'artifacts', appId, 'users', userId, 'activities', movedItem.id);
            updates.push(updateDoc(movedItemRef, { isCompleted: false, duration: movedItem.initialDuration}));

            activeTasks.forEach((task, index) => {
                const taskRef = doc(db, 'artifacts', appId, 'users', userId, 'activities', task.id);
                updates.push(updateDoc(taskRef, { order: index }));
            });

            Promise.all(updates).catch(err => setError("Failed to reactivate task."));
        }
    };
    
    // --- Calculate Estimated Completion Times ---
    const estimatedTimes = useMemo(() => {
        const estimates = new Map();
        let cumulativeTime = Date.now();
        const sortedActivities = [...activities]
            .filter(a => !a.isCompleted)
            .sort((a, b) => {
                if (a.isRunning && !b.isRunning) return -1;
                if (!a.isRunning && b.isRunning) return 1;
                return a.order - b.order;
            });

        for (const activity of sortedActivities) {
            const remainingSeconds = getRemainingTime(activity);
            cumulativeTime += remainingSeconds * 1000;
            estimates.set(activity.id, new Date(cumulativeTime));
        }
        return estimates;
    }, [activities, getRemainingTime, tick]);

    const totalTimeSpent = useMemo(() => {
        return activities.reduce((total, activity) => total + (activity.timeSpent || 0), 0);
    }, [activities]);

    const requestNotificationPermission = async () => {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
    };

    // --- Render UI ---
    if (!isFirebaseReady && isLoading) {
        return <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center"><p>Loading Firebase...</p></div>;
    }

    const activeTasksForRender = activities.filter(a => !a.isCompleted).sort((a, b) => a.order - b.order);
    const completedTasksForRender = activities.filter(a => a.isCompleted).sort((a, b) => a.order - b.order);
    const runningActivity = activeTasksForRender.find(a => a.isRunning);
    const fullscreenTaskObject = fullscreenActivityId ? activities.find(a => a.id === fullscreenActivityId) : null;
    
    let nextActivityForFullscreen = null;
    if (fullscreenTaskObject) {
        const currentIndex = activeTasksForRender.findIndex(a => a.id === fullscreenTaskObject.id);
        if (currentIndex > -1 && currentIndex < activeTasksForRender.length - 1) {
            nextActivityForFullscreen = activeTasksForRender[currentIndex + 1];
        }
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
            {fullscreenTaskObject && (
                <FullscreenTimer
                    activity={fullscreenTaskObject}
                    nextActivity={nextActivityForFullscreen}
                    remainingTime={getRemainingTime(fullscreenTaskObject)}
                    estimatedFinishTime={estimatedTimes.get(fullscreenTaskObject.id)}
                    isRunning={isGlobalTimerRunning}
                    onToggle={handleGlobalToggle}
                    onReset={() => handleReset(fullscreenTaskObject)}
                    onClose={() => setFullscreenActivityId(null)}
                />
            )}
            {showCongratsModal && (
                <CongratsModal onClose={() => setShowCongratsModal(false)} />
            )}
            <div className="max-w-2xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-cyan-400">TimeBlock</h1>
                    <p className="text-gray-400 mt-2">Focus on what matters, one block at a time.</p>
                     {userId && (<div className="mt-4 text-xs text-gray-500 bg-gray-800 rounded-full px-3 py-1 inline-block">User ID: {userId}</div>)}
                </header>

                {error && (<div className="bg-red-500/20 text-red-300 p-3 rounded-lg mb-4 text-center cursor-pointer" onClick={() => setError(null)}>{error} (click to dismiss)</div>)}

                {notificationPermission === 'default' && (
                    <div className="mb-4 p-3 bg-blue-500/20 text-blue-300 rounded-lg text-center">
                        <p>Enable notifications to get alerts when a task is finished.</p>
                        <button onClick={requestNotificationPermission} className="mt-2 font-bold underline">Allow Notifications</button>
                    </div>
                )}

                <div className="mb-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => setShowForm(!showForm)} 
                            disabled={!isFirebaseReady} 
                            className={`w-full flex items-center justify-center gap-2 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-lg disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed disabled:transform-none ${
                                showForm 
                                ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' 
                                : 'bg-green-600 hover:bg-green-700 shadow-green-500/20'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            {showForm ? 'Close' : 'Add'}
                        </button>
                        <button 
                            onClick={() => runningActivity && setFullscreenActivityId(runningActivity.id)}
                            disabled={!runningActivity}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-lg shadow-indigo-500/20 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                            Focus
                        </button>
                    </div>
                    <button 
                        onClick={handleGlobalToggle} 
                        disabled={!isFirebaseReady || activeTasksForRender.length === 0}
                        className={`w-full font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-lg ${isGlobalTimerRunning ? 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'} disabled:bg-gray-600 disabled:cursor-not-allowed disabled:transform-none`}
                    >
                        {isGlobalTimerRunning ? 'Pause Session' : 'Start Session'}
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

                {isLoading ? (<div className="text-center py-10 text-gray-400">Loading activities...</div>) : (
                    <DragDropContext onDragEnd={onDragEnd}>
                        <div>
                            <Droppable droppableId="active">
                                {(provided) => (
                                    <div className="space-y-4" {...provided.droppableProps} ref={provided.innerRef}>
                                        {activeTasksForRender.map((act, index) => (
                                            <Draggable key={act.id} draggableId={act.id} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        onClick={() => !act.isRunning && setEditingActivity(act)}
                                                        className={`p-5 border rounded-lg shadow-lg flex items-center gap-4 transition-all duration-300 bg-gray-800 ${act.isRunning ? 'border-yellow-500' : 'border-gray-700'} ${!act.isRunning ? 'hover:border-cyan-500 cursor-pointer' : ''} ${snapshot.isDragging ? 'border-cyan-400 shadow-lg' : ''}`}
                                                    >
                                                        <div className="flex-grow">
                                                            <h2 className="text-xl font-semibold text-cyan-300">{act.title}</h2>
                                                            <p className="text-gray-400 text-sm">Initial Duration: {formatTime(act.initialDuration)}</p>
                                                            {estimatedTimes.get(act.id) && <p className="text-sm text-cyan-400/80">Est. Finish: {estimatedTimes.get(act.id).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>}
                                                            <p className="text-2xl sm:text-3xl font-mono font-bold text-white my-2">{formatTime(getRemainingTime(act))}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {!act.isRunning && act.duration < act.initialDuration && <button onClick={(e) => { e.stopPropagation(); handleReset(act); }} className="p-2 bg-gray-600 hover:bg-gray-500 text-white rounded-full transition transform hover:scale-110" aria-label="Reset timer"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M21 21v-5h-5"></path></svg></button>}
                                                            <button onClick={(e) => { e.stopPropagation(); handleTaskCompletion(act, isGlobalTimerRunning); }} className="px-3 py-1 text-xs font-bold bg-green-600 hover:bg-green-500 text-white rounded-lg transition transform hover:scale-105" aria-label="Mark as Done">Finish</button>
                                                            <button onClick={(e) => { e.stopPropagation(); deleteActivity(act.id); }} className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition transform hover:scale-110" aria-label="Delete activity"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                                                            <div {...provided.dragHandleProps} className="p-2 cursor-grab touch-none" onClick={(e) => e.stopPropagation()}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></div>
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>

                            {completedTasksForRender.length > 0 && (
                                <div className="mt-8 pt-4 border-t-2 border-gray-700">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold text-gray-400">Completed Activities</h3>
                                        {totalTimeSpent > 0 && (
                                            <span className="text-sm font-mono text-gray-500 bg-gray-800 px-2 py-1 rounded">
                                                Total: {formatTime(totalTimeSpent)}
                                            </span>
                                        )}
                                    </div>
                                    <Droppable droppableId="completed">
                                        {(provided) => (
                                            <div className="space-y-4" {...provided.droppableProps} ref={provided.innerRef}>
                                                {completedTasksForRender.map((act, index) => (
                                                    <Draggable key={act.id} draggableId={act.id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                className={`p-5 border border-gray-700 rounded-lg shadow-lg flex items-center gap-4 transition-all duration-300 bg-gray-800/50 opacity-60 ${snapshot.isDragging ? 'border-cyan-400 shadow-lg' : ''}`}
                                                            >
                                                                <div className="flex-grow">
                                                                    <h2 className="text-xl font-semibold text-cyan-300">{act.title}</h2>
                                                                    <p className="text-gray-400 text-sm">Initial Duration: {formatTime(act.initialDuration)}</p>
                                                                    <p className="text-gray-400 text-sm">Time Spent: {formatTime(act.timeSpent)}</p>
                                                                    <p className="text-2xl sm:text-3xl font-mono font-bold text-white my-2">{formatTime(act.initialDuration)}</p>
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                    <button onClick={(e) => { e.stopPropagation(); deleteActivity(act.id); }} className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition transform hover:scale-110" aria-label="Delete activity"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                                                                    <div {...provided.dragHandleProps} className="p-2 cursor-grab touch-none" onClick={(e) => e.stopPropagation()}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </div>
                            )}

                            {activeTasksForRender.length === 0 && completedTasksForRender.length === 0 && (
                                <div className="text-center py-10 px-4 bg-gray-800/50 rounded-lg">
                                   <p className="text-gray-400">No activities yet. Add one to get started!</p>
                               </div>
                            )}
                        </div>
                    </DragDropContext>
                )}
            </div>
        </div>
    );
}

export default App;
