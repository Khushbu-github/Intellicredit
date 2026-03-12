import React from 'react';

interface FileCardProps {
    name: string;
    category: string;
    onUpload: () => void;
}

const FileCard: React.FC<FileCardProps> = ({ name, category, onUpload }) => {
    return (
        <div
            onClick={onUpload}
            className="glass-card p-6 flex flex-col items-center justify-center space-y-3 cursor-pointer hover:border-blue-500 transition-all group"
        >
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                <svg className="w-6 h-6 text-blue-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
            </div>
            <div className="text-center">
                <h3 className="font-semibold text-slate-800">{name}</h3>
                <p className="text-xs text-slate-500">{category}</p>
            </div>
        </div>
    );
};

export default FileCard;
