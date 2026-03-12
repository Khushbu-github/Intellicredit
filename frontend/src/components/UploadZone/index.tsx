import React, { useRef } from 'react';
import FileCard from './FileCard';
import { useFileUpload } from '../../hooks/useFileUpload';

interface UploadZoneProps {
    appId: number | null;
    onUploadComplete: () => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ appId, onUploadComplete }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadFiles, isUploading } = useFileUpload(appId);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && appId) {
            await uploadFiles(e.target.files);
            onUploadComplete();
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h2 className="text-3xl font-bold gradient-text">Upload Intelligence Data</h2>
                <p className="text-slate-500">Provide bank, Tax, GST and Legal documents for analysis</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FileCard name="GST Returns" category="CSV (GSTR-1/3B)" onUpload={() => fileInputRef.current?.click()} />
                <FileCard name="Bank Statement" category="CSV (6 Months)" onUpload={() => fileInputRef.current?.click()} />
                <FileCard name="Annual Report" category="PDF (Audited)" onUpload={() => fileInputRef.current?.click()} />
                <FileCard name="Sanction Letter" category="PDF (Existing Limits)" onUpload={() => fileInputRef.current?.click()} />
                <FileCard name="Legal Notice" category="PDF (Court Orders)" onUpload={() => fileInputRef.current?.click()} />
                <FileCard name="CIBIL Commercial" category="JSON/PDF" onUpload={() => fileInputRef.current?.click()} />
            </div>

            <div className="flex justify-center pt-8">
                <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || !appId}
                    className="btn-premium px-12"
                >
                    {isUploading ? 'Analyzing...' : 'Trigger Full Analysis'}
                </button>
            </div>
        </div>
    );
};

export default UploadZone;
