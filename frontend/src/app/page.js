'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import ParcelSearch from '@/components/ParcelSearch';
import WalletView from '@/components/WalletView';
import ParcelResult from '@/components/ParcelResult';

export default function Home() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [view, setView] = useState('search'); // 'search' | 'wallet'
  const [searchResult, setSearchResult] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
      setError('No wallet detected. Install MetaMask or another Web3 wallet.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWalletAddress(accounts[0]);
      setView('wallet');
      loadWalletData(accounts[0]);
    } catch (err) {
      setError('Wallet connection rejected.');
    }
  }

  async function disconnectWallet() {
    setWalletAddress(null);
    setWalletData(null);
    setView('search');
  }

  async function loadWalletData(address) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/wallet/${address}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWalletData(data);
    } catch (err) {
      setError(err.message || 'Failed to load wallet data.');
    } finally {
      setLoading(false);
    }
  }

  async function searchParcel(tokenId) {
    setLoading(true);
    setError(null);
    setSearchResult(null);
    try {
      const res = await fetch(`${API}/estimate/${tokenId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSearchResult(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch parcel data.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content-wrapper">
      <Header
        walletAddress={walletAddress}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        activeView={view}
        onViewChange={setView}
      />
      <main>
        <div className="px-6 mb-6 block md:flex justify-between items-end">
          <div>
            <a
              className={`text-2xl md:text-3xl inline md:mb-0 mb-4 no-underline cursor-pointer switch-option-link ${view === 'search' ? 'switch-option-link--selected' : 'switch-option-link--unselected'}`}
              onClick={() => setView('search')}
            >
              Estimate
            </a>
            {walletAddress && (
              <>
                <span className="text-2xl md:text-3xl"> / </span>
                <a
                  className={`text-2xl md:text-3xl inline md:mb-0 mb-4 no-underline cursor-pointer switch-option-link ${view === 'wallet' ? 'switch-option-link--selected' : 'switch-option-link--unselected'}`}
                  onClick={() => setView('wallet')}
                >
                  My Parcels
                </a>
              </>
            )}
          </div>
          {walletData && view === 'wallet' && (
            <div className="text-left md:text-right">
              <div className="flex text-left md:text-right gap-6">
                <div>
                  <p className="font-semibold">Parcels</p>
                  <span>{walletData.totalParcels}</span>
                </div>
                <div>
                  <p className="font-semibold">Est. Portfolio</p>
                  <span className="flex items-center gap-1">
                    <EthIcon />
                    {walletData.totalEstimatedValue.toFixed(3)}
                  </span>
                </div>
                {walletData.sets?.length > 0 && (
                  <div>
                    <p className="font-semibold">Sets</p>
                    <span>{walletData.sets.length}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6">
          {error && (
            <div className="mb-6 text-sm opacity-70">[error: {error}]</div>
          )}

          {view === 'search' && (
            <>
              <ParcelSearch onSearch={searchParcel} loading={loading} />
              {searchResult && !loading && (
                <div className="mt-8">
                  <ParcelResult parcel={searchResult} />
                </div>
              )}
            </>
          )}

          {view === 'wallet' && (
            <WalletView
              data={walletData}
              loading={loading}
              address={walletAddress}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function EthIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" style={{ opacity: 0.8 }}>
      <path d="M5 0L0 8.15L5 11L10 8.15L5 0Z" />
      <path d="M0 9.1L5 16L10 9.1L5 12L0 9.1Z" />
    </svg>
  );
}
