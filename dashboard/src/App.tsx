import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from '@/lib/api.ts';
import { AuthGate } from '@/components/AuthGate.tsx';
import { Layout } from '@/components/Layout.tsx';
import { LoginPage } from '@/pages/Login.tsx';
import { OverviewPage } from '@/pages/Overview.tsx';
import { ChecksListPage } from '@/pages/ChecksList.tsx';
import { CheckDetailPage } from '@/pages/CheckDetail.tsx';
import { CheckNewPage } from '@/pages/CheckNew.tsx';
import { GithubPage } from '@/pages/Github.tsx';
import { CloudflarePage } from '@/pages/Cloudflare.tsx';
import { AlertsPage } from '@/pages/Alerts.tsx';

function UnauthorizedListener() {
    const navigate = useNavigate();
    useEffect(() => {
        setUnauthorizedHandler(() => navigate('/login', { replace: true }));
    }, [navigate]);
    return null;
}

export function App() {
    return (
        <BrowserRouter>
            <UnauthorizedListener />
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                    path="/*"
                    element={
                        <AuthGate>
                            <Layout>
                                <Routes>
                                    <Route path="/" element={<OverviewPage />} />
                                    <Route path="/checks" element={<ChecksListPage />} />
                                    <Route path="/checks/new" element={<CheckNewPage />} />
                                    <Route path="/checks/:id" element={<CheckDetailPage />} />
                                    <Route path="/github" element={<GithubPage />} />
                                    <Route path="/cloudflare" element={<CloudflarePage />} />
                                    <Route path="/alerts" element={<AlertsPage />} />
                                    <Route path="*" element={<Navigate to="/" />} />
                                </Routes>
                            </Layout>
                        </AuthGate>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}
