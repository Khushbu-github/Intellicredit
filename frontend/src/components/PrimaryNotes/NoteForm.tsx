import React, { useState } from 'react';

interface NoteFormProps {
    onSubmit: (capacity: number, notes: string) => void;
}

const NoteForm: React.FC<NoteFormProps> = ({ onSubmit }) => {
    const [capacity, setCapacity] = useState(100);
    const [notes, setNotes] = useState("");
    const [mgmtQuality, setMgmtQuality] = useState(5);

    return (
        <div className="space-y-6">
            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Factory Real-time Capacity Utilization: {capacity}%
                </label>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={capacity}
                    onChange={(e) => setCapacity(parseInt(e.target.value))}
                    className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>Critical (0%)</span>
                    <span>Optimal (100%)</span>
                </div>
            </div>

            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Management Quality</label>
                <div className="flex space-x-2">
                    {[1, 2, 3, 4, 5].map(star => (
                        <button
                            key={star}
                            onClick={() => setMgmtQuality(star)}
                            className={`text-2xl transition-colors ${star <= mgmtQuality ? 'text-yellow-400' : 'text-slate-200'}`}
                        >
                            ★
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Qualitative Observations</label>
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter nuances (e.g., 'Factory found operating at 40% capacity')"
                    className="input-premium w-full h-24 resize-none pt-2"
                />
            </div>

            <button
                onClick={() => onSubmit(capacity / 100, notes)}
                className="btn-premium w-full"
            >
                Submit Notes & Refresh Scoring
            </button>
        </div>
    );
};

export default NoteForm;
