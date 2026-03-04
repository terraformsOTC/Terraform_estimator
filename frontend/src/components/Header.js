'use client';

export default function Header({ walletAddress, onConnect, onDisconnect }) {
  const short = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <header className="z-10 px-6 py-4 md:py-6 md:mb-12 mb-6 sticky top-0 md:relative bg-primary">
      <nav className="flex flex-row justify-between items-center" style={{ minHeight: '36px' }}>
        <div className="flex items-center">
          <a className="md:my-0 no-underline" href="/">[terraform estimator]</a>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://terraformexplorer.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm opacity-60 hover:opacity-100 transition-opacity no-underline hidden md:inline"
          >
            [explorer ↗]
          </a>
          {walletAddress ? (
            <button
              className="btn-primary btn-sm"
              onClick={onDisconnect}
              title="Click to disconnect"
            >
              {short}
            </button>
          ) : (
            <button className="btn-primary btn-sm" onClick={onConnect}>
              connect wallet
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
