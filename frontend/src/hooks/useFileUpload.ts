/**
 * Thin adapter so UploadZone keeps its existing shape while the request and
 * its cache invalidation are owned by the query layer.
 */

import { useUploadDocuments } from './queries';
import type { UploadResult } from '../lib/api';

export type { IngestedFile, UploadResult } from '../lib/api';

export const useFileUpload = (appId: number | null) => {
    const upload = useUploadDocuments(appId);

    const uploadFiles = async (files: File[]): Promise<UploadResult | undefined> => {
        if (!appId || files.length === 0) return undefined;
        return upload.mutateAsync(files);
    };

    return { uploadFiles, isUploading: upload.isPending };
};
