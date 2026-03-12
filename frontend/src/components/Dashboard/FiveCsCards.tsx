import React from 'react';

interface ScoreCardProps {
    label: string;
    score: number;
    max: number;
    color: string;
}

const ScoreCard: React.FC<ScoreCardProps> = ({ label, score, max, color }) => {
    const pct = (score / max) * 100;
    return (
        <div className="glass-card p-5 border-l-4" style={{ borderLeftColor: color }}>
            <p className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-1">{label}</p>
            <div className="flex items-end space-x-2">
                <span className="text-3xl font-bold text-slate-800">{score}</span>
                <span className="text-slate-400 mb-1">/ {max}</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                    className="h-full transition-all duration-1000 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
};

interface FiveCsCardsProps {
    data: {
        character?: number;
        capacity?: number;
        capital?: number;
        collateral?: number;
        conditions?: number;
    };
}

const FiveCsCards: React.FC<FiveCsCardsProps> = ({ data }) => {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <ScoreCard label="Character" score={data.character || 0} max={25} color="#3b82f6" />
            <ScoreCard label="Capacity" score={data.capacity || 0} max={30} color="#10b981" />
            <ScoreCard label="Capital" score={data.capital || 0} max={20} color="#6366f1" />
            <ScoreCard label="Collateral" score={data.collateral || 0} max={15} color="#f59e0b" />
            <ScoreCard label="Conditions" score={data.conditions || 0} max={10} color="#ec4899" />
        </div>
    );
};

export default FiveCsCards;
