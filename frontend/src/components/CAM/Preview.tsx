import React from 'react';

interface PreviewProps {
    appId: number;
}

const Preview: React.FC<PreviewProps> = ({ appId }) => {
    return (
        <div className="glass-card overflow-hidden h-[600px] flex flex-col">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                <span className="font-bold text-slate-700">CAM Live Preview (App ID: {appId})</span>
                <span className="text-xs text-slate-400">Word Document Structure</span>
            </div>
            <div className="flex-1 flex items-center justify-center bg-slate-100 p-12">
                <div className="w-full max-w-2xl h-full bg-white shadow-2xl p-10 space-y-4">
                    <div className="h-8 bg-slate-100 w-3/4 mb-8"></div>
                    <div className="h-4 bg-slate-100 w-full font-serif text-slate-300">Section 1: Company Profile...</div>
                    <div className="h-4 bg-slate-100 w-5/6"></div>
                    <div className="h-32 border-2 border-dashed border-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-sm">
                        CAM Data Table Placeholder
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Preview;
