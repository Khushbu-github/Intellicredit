import React from 'react';
import NoteForm from './NoteForm';

interface PrimaryNotesProps {
    onUpdate: (capacity: number, notes: string) => void;
}

const PrimaryNotes: React.FC<PrimaryNotesProps> = ({ onUpdate }) => {
    return (
        <div className="max-w-2xl mx-auto">
            <div className="glass-card p-8">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">Primary Notes Portal</h2>
                    <p className="text-slate-500">Manual adjustments based on factory visit and management meeting</p>
                </div>
                <NoteForm onSubmit={onUpdate} />
            </div>

            <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start space-x-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-indigo-700">
                    <strong>Notice:</strong> Submitting these notes will trigger a real-time re-calculation of the <strong>Capacity</strong> pillar in the 5Cs model.
                </p>
            </div>
        </div>
    );
};

export default PrimaryNotes;
