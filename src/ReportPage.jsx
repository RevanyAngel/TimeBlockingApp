import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';



// Helper function untuk format waktu (salin dari App.js atau pindahkan ke file utilitas)
const formatTime = (totalSeconds) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const ReportPage = ({ db, userId, onClose, appId, categories}) => {
    const [reportMode, setReportMode] = useState('daily');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedCategory, setSelectedCategory] = useState('Semua'); // <-- TAMBAHKAN STATE INI
    const [dailyTasks, setDailyTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!db || !userId) return;

        const fetchReport = async () => {
            setIsLoading(true);

            let startOfRange, endOfRange;
            const date = new Date(selectedDate); // Salin tanggal agar tidak mengubah state asli

            switch (reportMode) {
                case 'weekly':
                    const firstDayOfWeek = date.getDate() - date.getDay(); // Asumsi Minggu = 0
                    startOfRange = new Date(date.setDate(firstDayOfWeek));
                    startOfRange.setHours(0, 0, 0, 0);

                    endOfRange = new Date(startOfRange);
                    endOfRange.setDate(startOfRange.getDate() + 6);
                    endOfRange.setHours(23, 59, 59, 999);
                    break;
                
                case 'monthly':
                    startOfRange = new Date(date.getFullYear(), date.getMonth(), 1);
                    endOfRange = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                    endOfRange.setHours(23, 59, 59, 999);
                    break;
                
                case 'yearly':
                    startOfRange = new Date(date.getFullYear(), 0, 1);
                    endOfRange = new Date(date.getFullYear(), 11, 31);
                    endOfRange.setHours(23, 59, 59, 999);
                    break;
                
                case 'daily':
                default:
                    startOfRange = new Date(date);
                    startOfRange.setHours(0, 0, 0, 0);
                    endOfRange = new Date(date);
                    endOfRange.setHours(23, 59, 59, 999);
                    break;
            }

            try {
                const activitiesCollectionRef = collection(db, 'artifacts', appId || 'default-time-blocker', 'users', userId, 'activities');
                const q = query(
                    activitiesCollectionRef,
                    where('isCompleted', '==', true),
                    where('completedAt', '>=', Timestamp.fromDate(startOfRange)),
                    where('completedAt', '<=', Timestamp.fromDate(endOfRange))
                );

                const querySnapshot = await getDocs(q);
                const tasks = querySnapshot.docs.map(doc => doc.data());
                setDailyTasks(tasks);

            } catch (error) {
                console.error("Error fetching report:", error);
                setDailyTasks([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchReport();
    }, [selectedDate, reportMode, db, userId, appId]); // <-- TAMBAHKAN 'reportMode' ke dependency array

        const reportData = useMemo(() => {
            // Filter dulu tugasnya berdasarkan kategori yang dipilih
            const tasksToProcess = selectedCategory === 'Semua'
                ? dailyTasks
                : dailyTasks.filter(task => (task.category || 'Lainnya') === selectedCategory);

            // Setelah difilter, jalankan kalkulasi seperti sebelumnya
            return tasksToProcess.reduce((acc, task) => {
                const category = task.category || "Lainnya";
                const time = task.timeSpent || 0;

                acc.totalTime += time;
                // Kita tetap menghitung rincian kategori, meskipun mungkin hanya ada satu
                acc.categories[category] = (acc.categories[category] || 0) + time;

                return acc;
            }, { totalTime: 0, categories: {} });

        }, [dailyTasks, selectedCategory]);
    
    // Konversi tanggal ke format YYYY-MM-DD untuk input
    const dateToInputValue = (date) => {
        const offset = date.getTimezoneOffset();
        const adjustedDate = new Date(date.getTime() - (offset*60*1000));
        return adjustedDate.toISOString().split('T')[0];
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-cyan-400">Laporan Produktivitas</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                <div className="flex justify-center gap-2 mb-4 p-1 bg-gray-900 rounded-lg">
                    {['daily', 'weekly', 'monthly', 'yearly'].map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setReportMode(mode)}
                            className={`w-full py-2 px-3 text-sm font-bold rounded-md transition ${
                                reportMode === mode
                                    ? 'bg-cyan-500 text-gray-900'
                                    : 'bg-transparent text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            {/* Mengubah teks tombol agar lebih user-friendly */}
                            {mode === 'daily' ? 'Harian' : mode === 'weekly' ? 'Mingguan' : mode === 'monthly' ? 'Bulanan' : 'Tahunan'}
                        </button>
                    ))}
                </div>
                {/* GANTI BLOK FILTER YANG LAMA DENGAN INI */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            {reportMode === 'daily' && 'Pilih Tanggal:'}
                            {reportMode === 'weekly' && 'Pilih Minggu:'}
                            {reportMode === 'monthly' && 'Pilih Bulan:'}
                            {reportMode === 'yearly' && 'Pilih Tahun:'}
                        </label>
                        {/* Harian & Mingguan menggunakan input tanggal standar */}
                        {(reportMode === 'daily' || reportMode === 'weekly') && (
                            <input
                                type="date"
                                value={dateToInputValue(selectedDate)}
                                onChange={(e) => setSelectedDate(new Date(e.target.value))}
                                className="p-2 bg-gray-700 border border-gray-600 rounded-md w-full"
                            />
                        )}
                        {/* Bulanan menggunakan input bulan */}
                        {reportMode === 'monthly' && (
                            <input
                                type="month"
                                value={`${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1).toString().padStart(2, '0')}`}
                                onChange={(e) => setSelectedDate(new Date(e.target.value))}
                                className="p-2 bg-gray-700 border border-gray-600 rounded-md w-full"
                            />
                        )}
                        {/* Tahunan menggunakan input angka */}
                        {reportMode === 'yearly' && (
                            <input
                                type="number"
                                value={selectedDate.getFullYear()}
                                onChange={(e) => setSelectedDate(new Date(e.target.value, 0, 1))}
                                className="p-2 bg-gray-700 border border-gray-600 rounded-md w-full"
                            />
                        )}
                    </div>
                    
                    <div>
                        <label htmlFor="category-filter" className="block text-sm font-medium text-gray-300 mb-1">Kategori:</label>
                        <select
                            id="category-filter"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="p-2 bg-gray-700 border border-gray-600 rounded-md w-full"
                        >
                            <option value="Semua">Semua Kategori</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {isLoading ? (
                    <p>Memuat laporan...</p>
                ) : reportData && reportData.totalTime > 0 ? (
                    <div>
                        <div className="bg-gray-900 p-4 rounded-lg mb-4">
                            <p className="text-gray-400">Total Waktu Produktif</p>
                            <p className="text-3xl font-bold text-cyan-300">{formatTime(reportData.totalTime)}</p>
                        </div>
                        <h3 className="font-bold mb-2">Rincian per Kategori:</h3>
                        <ul className="space-y-2">
                            {Object.entries(reportData.categories).sort(([, a], [, b]) => b - a).map(([category, time]) => (
                                <li key={category} className="flex justify-between items-center bg-gray-700 p-3 rounded-md">
                                    <span>{category}</span>
                                    <span className="font-mono font-semibold">{formatTime(time)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p className="text-gray-400 text-center py-8">Tidak ada aktivitas yang diselesaikan pada tanggal ini.</p>
                )}
            </div>
        </div>
    );
};

export default ReportPage;