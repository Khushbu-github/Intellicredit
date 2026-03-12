import React, { useState } from 'react';

interface NewCaseProps {
    onRegister: (companyName: string) => void;
}

const NewCase: React.FC<NewCaseProps> = ({ onRegister }) => {
    const [name, setName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onRegister(name.trim());
        }
    };

    return (
        <div className="max-w-md mx-auto pt-10">
            <div className="glass-card p-10 text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-6 shadow-lg shadow-blue-200">
                    I
                </div>
                <h2 className="text-3xl font-bold text-slate-800 mb-2">New Appraisal</h2>
                <p className="text-slate-500 mb-8">Register a specific corporate entity to begin the next-gen credit assessment</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="text-left">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Company Name</label>
                        <input
                            type="text"
                            required
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Reliance Industries Ltd"
                            className="input-premium w-full text-lg"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!name.trim()}
                        className="btn-premium w-full text-lg flex items-center justify-center space-x-2"
                    >
                        <span>Begin Appraisal</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                    </button>
                </form>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4 text-center">
                <div className="p-4 rounded-2xl border border-slate-100 bg-white/50">
                    <div className="text-blue-600 font-bold text-xl mb-1">5Cs</div>
                    <div className="text-slate-400 text-xs uppercase font-bold tracking-tighter">Powered Engine</div>
                </div>
                <div className="p-4 rounded-2xl border border-slate-100 bg-white/50">
                    <div className="text-indigo-600 font-bold text-xl mb-1">OCR</div>
                    <div className="text-slate-400 text-xs uppercase font-bold tracking-tighter">Real-time Parse</div>
                </div>
            </div>
        </div>
    );
};

export default NewCase;
