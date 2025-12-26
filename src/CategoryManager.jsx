import React, { useState } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

const CategoryManager = ({ db, userId, appId, categories, onClose }) => {
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingCategory, setEditingCategory] = useState(null); // { id, name }

    const categoriesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'categories');

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            await addDoc(categoriesCollectionRef, {
                name: newCategoryName.trim(),
                createdAt: serverTimestamp(),
            });
            setNewCategoryName('');
        } catch (error) {
            console.error("Error adding category:", error);
        }
    };

    const handleUpdateCategory = async () => {
        if (!editingCategory || !newCategoryName.trim()) return;
        const categoryDoc = doc(db, 'artifacts', appId, 'users', userId, 'categories', editingCategory.id);
        try {
            await updateDoc(categoryDoc, { name: newCategoryName.trim() });
            setNewCategoryName('');
            setEditingCategory(null);
        } catch (error) {
            console.error("Error updating category:", error);
        }
    };

    const handleDeleteCategory = async (id) => {
        if (window.confirm("Apakah Anda yakin ingin menghapus kategori ini?")) {
            const categoryDoc = doc(db, 'artifacts', appId, 'users', userId, 'categories', id);
            try {
                await deleteDoc(categoryDoc);
            } catch (error) {
                console.error("Error deleting category:", error);
            }
        }
    };
    
    const startEdit = (cat) => {
        setEditingCategory(cat);
        setNewCategoryName(cat.name);
    };

    const cancelEdit = () => {
        setEditingCategory(null);
        setNewCategoryName('');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md text-white">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">Kelola Kategori</h2>

                {/* Form untuk Add/Edit */}
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        placeholder={editingCategory ? "Ubah nama kategori" : "Nama kategori baru"}
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="flex-grow p-2 bg-gray-700 border border-gray-600 rounded-md"
                    />
                    {editingCategory ? (
                        <>
                            <button onClick={handleUpdateCategory} className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-md">Simpan</button>
                            <button onClick={cancelEdit} className="px-4 py-2 bg-gray-500 hover:bg-gray-400 rounded-md">Batal</button>
                        </>
                    ) : (
                        <button onClick={handleAddCategory} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-md">Tambah</button>
                    )}
                </div>

                {/* Daftar Kategori */}
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {categories.map((cat) => (
                        <li key={cat.id} className="flex justify-between items-center bg-gray-700 p-2 rounded-md">
                            <span>{cat.name}</span>
                            <div className="flex gap-2">
                                <button onClick={() => startEdit(cat)} className="text-yellow-400 hover:text-yellow-300">Edit</button>
                                <button onClick={() => handleDeleteCategory(cat.id)} className="text-red-500 hover:text-red-400">Hapus</button>
                            </div>
                        </li>
                    ))}
                </ul>

                <button onClick={onClose} className="mt-6 w-full py-2 bg-red-600 hover:bg-red-700 rounded-md">Tutup</button>
            </div>
        </div>
    );
};

export default CategoryManager;