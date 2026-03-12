import React from 'react';

interface DownloadButtonProps {
    appId: number;
    url: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({ appId, url }) => {
    return (
        <div className="flex justify-center mt-8">
            <a
                href={url}
                download={`CAM_${appId}.docx`}
                className="btn-premium flex items-center space-x-3 px-10 py-4"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-lg">Download Professional CAM.docx</span>
            </a>
        </div>
    );
};

export default DownloadButton;
