'use client';

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-6 py-8">
          <p className="text-sm opacity-70 mb-2">[something went wrong]</p>
          <p className="text-xs opacity-50 mb-4">{this.state.error?.message}</p>
          <button
            className="btn-primary btn-sm text-xs"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            [try again]
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
