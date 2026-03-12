import React from 'react';

interface RiskFlagsProps {
    gstPct: number;
    litigationCount: number;
}

const RiskFlags: React.FC<RiskFlagsProps> = ({ gstPct, litigationCount }) => {
    return (
        <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Risk Flags & Mismatches
            </h3>

            <div className="space-y-4">
                <div className={`p-4 rounded-xl border flex justify-between items-center ${gstPct > 15 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                    <div>
                        <p className="font-semibold text-slate-800">Circular Trading (GST)</p>
                        <p className="text-xs text-slate-500">Overlapping vendor/customer GSTINs</p>
                    </div>
                    <span className={`text-xl font-bold ${gstPct > 15 ? 'text-red-600' : 'text-green-600'}`}>{gstPct}%</span>
                </div>

                <div className={`p-4 rounded-xl border flex justify-between items-center ${litigationCount >= 2 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div>
                        <p className="font-semibold text-slate-800">Litigation / Bounces</p>
                        <p className="text-xs text-slate-500">NI Act §138 cases + CHQ Returns</p>
                    </div>
                    <span className={`text-xl font-bold ${litigationCount >= 2 ? 'text-red-600' : 'text-slate-600'}`}>{litigationCount}</span>
                </div>
            </div>
        </div>
    );
};

export default RiskFlags;
