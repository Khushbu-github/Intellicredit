import React, { useState } from 'react';

import { api, saveBlob } from '../../lib/api';
import Button from '../ui/Button';
import { useToast } from '../ui/toastContext';

interface DownloadButtonProps {
    appId: number;
    companyName: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'primary' | 'secondary';
}

/** Sanitises the borrower name into a filename-safe slug for the .docx. */
function slug(name: string): string {
    return (
        name
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 48) || 'Borrower'
    );
}

/**
 * The memo sits behind bearer auth, so a plain <a href> would be answered with
 * a 401 - the browser does not attach the token. It is fetched as a blob and
 * handed to the browser through a temporary object URL instead.
 */
const DownloadButton: React.FC<DownloadButtonProps> = ({
    appId,
    companyName,
    size = 'md',
    variant = 'primary',
}) => {
    const toast = useToast();
    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const blob = await api.downloadCam(appId);
            saveBlob(blob, `CAM_${slug(companyName)}_${String(appId).padStart(4, '0')}.docx`);
        } catch (err) {
            toast({
                status: 'critical',
                title: 'Could not download the memo',
                detail: err instanceof Error ? err.message : 'The appraisal service did not respond.',
            });
        } finally {
            setDownloading(false);
        }
    };

    return (
        <Button
            onClick={handleDownload}
            icon="download"
            size={size}
            variant={variant}
            loading={downloading}
            disabled={downloading}
        >
            {downloading ? 'Preparing…' : 'Download CAM (.docx)'}
        </Button>
    );
};

export default DownloadButton;
