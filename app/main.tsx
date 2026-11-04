import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import ClinicApp from './clinic-app';
import { ErrorBoundary } from './error-boundary';
import { installErrorReporting } from '@/lib/error-reporting';

installErrorReporting();
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><ClinicApp /></ErrorBoundary></StrictMode>);
