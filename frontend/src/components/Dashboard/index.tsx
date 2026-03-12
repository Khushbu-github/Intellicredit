import React from 'react';
import FiveCsCards from './FiveCsCards';
import RiskFlags from './RiskFlags';
import type { Application } from '../../types/credit';

interface DashboardProps {
    data: Application;
}

const Dashboard: React.FC<DashboardProps> = ({ data }) => {
    const isReject = data.decision === 'REJECT';

    return (
        <div className="space-y-6">
            <div className={`p-6 rounded-2xl border-2 flex justify-between items-center ${isReject ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <div>
                    <h2 className={`text-2xl font-bold ${isReject ? 'text-red-700' : 'text-green-700'}`}>
                        {data.decision}: ₹{data.recommended_limit_cr} Cr
                    </h2>
                    <p className="text-slate-600">{data.decision_reason}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs uppercase text-slate-500 font-bold">Recommended Pricing</p>
                    <p className="text-xl font-bold text-slate-800">{data.spread}</p>
                </div>
            </div>

            <FiveCsCards data={{
                character: data.character_score,
                capacity: data.capacity_score,
                capital: data.capital_score,
                collateral: data.collateral_score,
                conditions: data.conditions_score
            }} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RiskFlags
                    gstPct={data.gst_circular_trading_pct || 0}
                    litigationCount={data.litigation_count || 0}
                />

                <div className="glass-card p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Financial Snapshots</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-slate-500">Revenue (Annual)</span>
                            <span className="font-bold">₹{data.revenue} Cr</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-slate-500">EBITDA</span>
                            <span className="font-bold">₹{data.ebitda} Cr</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-slate-500">DSCR (Estimated)</span>
                            <span className={`font-bold ${(data.dscr || 0) < 1.1 ? 'text-red-600' : 'text-green-600'}`}>{data.dscr}x</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
