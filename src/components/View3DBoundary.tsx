import { Component, type ReactNode } from 'react';

/** Shows a message instead of breaking the page when WebGL is not available. */
export class View3DBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.error) {
      return (
        <p className="error">
          The 3D view could not start ({this.state.error}). WebGL may be disabled in this browser; the top view still works.
        </p>
      );
    }
    return this.props.children;
  }
}
