import React from 'react';

const ExplainTrail: React.FC = () => {
    const steps = [
        { title: "Data Ingestion", status: "Success", desc: "12 files parsed via regex/OCR", time: "18:30:12" },
        { title: "Circular Trading Engine", status: "Flagged", desc: "18% overlap found in GSTIN data", time: "18:30:14" },
        { title: "Financial Ratio Analysis", status: "Analyzed", desc: "DSCR 1.03x < 1.1x threshold", time: "18:30:15" },
        { title: "5Cs Model Scoring", status: "Calculated", desc: "Total Score: 58/100", time: "18:30:16" },
        { title: "Final Recommendation", status: "Generated", desc: "Status: REJECT", time: "18:30:17" }
    ];

    return (
        <div className="max-w-3xl mx-auto glass-card p-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-8">AI Decision Audit Trail</h2>
            <div className="space-y-8 relative before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
                {steps.map((step, i) => (
                    <div key={i} className="relative pl-10">
                        <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-white border-4 border-blue-500 z-10"></div>
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-slate-800">{step.title}</h4>
                                <p className="text-sm text-slate-500">{step.desc}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-bold text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded">{step.status}</span>
                                <p className="text-[10px] text-slate-400 mt-1">{step.time}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ExplainTrail;
