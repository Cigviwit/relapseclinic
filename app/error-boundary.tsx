import { Component, type ReactNode } from 'react';
import { reportError } from '@/lib/error-reporting';
import { Logo } from '@/components/logo';

/** A screen that crashes shows this instead of a blank page. Saved records are unaffected. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportError(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="crash" role="alert">
      <Logo />
      <h1 className="h-sm">Something went wrong on this screen</h1>
      <p className="muted">Your saved records are safe. Anything being typed on this screen may need entering again.</p>
      <button className="btn btn-primary" onClick={() => location.reload()}>Reload RelapseClinic</button>
    </div>;
  }
}
