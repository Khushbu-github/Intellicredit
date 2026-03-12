import { useState } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

export const useFileUpload = (appId: number | null) => {
    const [isUploading, setIsUploading] = useState(false);

    const uploadFiles = async (files: FileList) => {
        if (!appId) return;
        setIsUploading(true);
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        const res = await fetch(`${BASE_URL}/${appId}/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const errorText = await res.text();
            setIsUploading(false);
            throw new Error(`Upload failed: ${res.status} ${res.statusText} - ${errorText}`);
        }

        setIsUploading(false);
        return res.json();
    };

    return { uploadFiles, isUploading };
};
