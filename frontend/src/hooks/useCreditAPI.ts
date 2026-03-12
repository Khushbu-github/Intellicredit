import type { Application } from '../types/credit';

const BASE_URL = 'http://localhost:8001/api';

export const useCreditAPI = () => {
    const createApplication = async (companyName: string): Promise<{ app_id: number }> => {
        const res = await fetch(`${BASE_URL}/applications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_name: companyName })
        });
        return res.json();
    };

    const getAnalysis = async (appId: number): Promise<Application> => {
        const res = await fetch(`${BASE_URL}/${appId}/analysis`);
        return res.json();
    };

    const updatePrimaryNotes = async (appId: number, factoryCapacity: number, qualitativeNotes?: string) => {
        const formData = new FormData();
        formData.append('factory_capacity', factoryCapacity.toString());
        if (qualitativeNotes) {
            formData.append('qualitative_notes', qualitativeNotes);
        }
        const res = await fetch(`${BASE_URL}/${appId}/primary-notes`, {
            method: 'POST',
            body: formData,
        });
        return res.json();
    };

    const getCamUrl = (appId: number) => `${BASE_URL}/${appId}/cam`;

    return { createApplication, getAnalysis, updatePrimaryNotes, getCamUrl };
};
