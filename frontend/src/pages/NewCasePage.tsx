/** Borrower registration - step 1 of the workflow. */

import React from 'react';
import { useNavigate } from 'react-router-dom';

import NewCase from '../components/Registration/NewCase';
import { useToast } from '../components/ui/toastContext';
import { useCases, useCreateCase, useMeta } from '../hooks/queries';
import { useTheme } from '../lib/theme';

const NewCasePage: React.FC = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const { theme, toggle } = useTheme();

    const metaQuery = useMeta();
    const casesQuery = useCases();
    const createCase = useCreateCase();

    const handleRegister = async (name: string, sector: string) => {
        try {
            const result = await createCase.mutateAsync({ companyName: name, sector });
            navigate(`/cases/${result.app_id}/documents`);
        } catch (err) {
            toast({
                status: 'critical',
                title: 'Could not register the borrower',
                detail: err instanceof Error ? err.message : 'The appraisal service did not respond.',
            });
        }
    };

    return (
        <NewCase
            onRegister={handleRegister}
            sectors={metaQuery.data?.sectors ?? []}
            theme={theme}
            onToggleTheme={toggle}
            onBrowseCases={() => navigate('/cases')}
            caseCount={casesQuery.data?.length ?? 0}
        />
    );
};

export default NewCasePage;
