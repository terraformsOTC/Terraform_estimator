'use client';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import ParcelSearch from '@/components/ParcelSearch';
import WalletView from '@/components/WalletView';
import ParcelResult from '@/components/ParcelResult';
import UnmintedResult from '@/components/UnmintedResult';
import ErrorBoundary from '@/components/ErrorBoundary';
import { EthIcon, API_URL, pickRandomWhale, Footer, getMoneySwordMultiplier } from '@/components/shared';
import { useMoneySword } from '@/contexts/MoneySword';

function PortfolioStats({ data }) {
  const [moneySword] = useMoneySword();
  const displayTotal = useMemo(() => {
    if (!moneySword || !data.parcels) return data.totalEstimatedValue;
    return data.parcels.reduce((sum, p) => sum + p.pricing.estimatedValue * getMoneySwordMultiplier(p.pricing, p.traits?.level), 0);
  }, [data, moneySword]);
  return (
    <div className="text-left md:text-right">
      <div className="flex text-left md:text-right gap-6 whitespace-nowrap">
        <div>
          <p className="font-semibold">Parcels</p>
          <span>{data.totalParcels}</span>
        </div>
        <div>
          <p className="font-semibold">Estimated collection value</p>
          <span className="flex items-center md:justify-end gap-1">
            <EthIcon />
            {displayTotal.toFixed(2)}
          </span>
        </div>
        {data.sets?.some(s => s.completed) && (
          <div>
            <p className="font-semibold">Sets</p>
            <span>{data.sets.filter(s => s.completed).length}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TokenParamHandler({ onToken, onAddress }) {
  const searchParams = useSearchParams();
  const onTokenRef = useRef(onToken);
  const onAddressRef = useRef(onAddress);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      const id = parseInt(token, 10);
      if (!isNaN(id) && id >= 1 && id <= 11104) onTokenRef.current(id);
    }
    const address = searchParams.get('address');
    if (address) onAddressRef.current(address);
  }, []);
  return null;
}

// Reserves the result area's footprint while an estimate is in flight so the
// async result (RPC ~1–3s, common on /?token= deep-links) doesn't shove the
// footer down when it lands — the dominant CLS source on this page.
function ResultSkeleton() {
  return (
    <div className="mt-8 flex flex-col md:flex-row gap-8 max-w-2xl" aria-hidden="true">
      <div className="flex-shrink-0">
        <div className="bg-placeholder animate-pulse" style={{ width: 277, height: 400 }} />
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="bg-placeholder animate-pulse h-3 w-24" />
          <div className="bg-placeholder animate-pulse h-3 w-32" />
        </div>
      </div>
      <div className="flex flex-col gap-4 flex-1">
        <div className="flex flex-col gap-2">
          <div className="bg-placeholder animate-pulse h-3 w-28" />
          <div className="bg-placeholder animate-pulse h-8 w-40" />
          <div className="bg-placeholder animate-pulse h-3 w-36" />
        </div>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-placeholder animate-pulse h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [view, setView] = useState('search'); // 'search' | 'wallet' | 'whale'
  const [searchResult, setSearchResult] = useState(null);
  const [unmintedResult, setUnmintedResult] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [whaleIdentifier, setWhaleIdentifier] = useState(null);
  const [whaleData, setWhaleData] = useState(null);
  const [isRandomWhale, setIsRandomWhale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ethUsd, setEthUsd] = useState(null);
  const walletFetchId = useRef(0);
  const walletAddressRef = useRef(walletAddress);
  useEffect(() => { walletAddressRef.current = walletAddress; }, [walletAddress]);

  useEffect(() => {
    fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      .then(r => r.json())
      .then(d => { const p = parseFloat(d?.data?.amount); if (Number.isFinite(p)) setEthUsd(p); })
      .catch(() => {});
  }, []);

  async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
      setError('No wallet detected. Install MetaMask or another Web3 wallet.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWalletAddress(accounts[0]);
      setView('wallet');
      await loadWalletData(accounts[0]);
    } catch (err) {
      setError('Wallet connection rejected.');
    }
  }

  function disconnectWallet() {
    setWalletAddress(null);
    setWalletData(null);
    setView('search');
  }

  // Sync header + wallet view when the user switches accounts in their wallet extension.
  // Without this, the short-address button in the header stays on the previously
  // connected account until a page reload.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum?.on) return;
    const handleAccountsChanged = (accounts) => {
      const next = accounts?.[0];
      if (!next) {
        disconnectWallet();
        return;
      }
      const prev = walletAddressRef.current;
      if (prev && prev.toLowerCase() === next.toLowerCase()) return;
      setWalletAddress(next);
      setView('wallet');
      loadWalletData(next);
    };
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => {
      window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  }, []);

  async function loadWalletData(address) {
    // Discard stale responses: if the user switches accounts in their wallet
    // extension mid-fetch, the second fetch's response can land after the
    // first's and overwrite walletData with the wrong account.
    const myId = ++walletFetchId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/wallet/${encodeURIComponent(address)}`);
      if (myId !== walletFetchId.current) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWalletData(data);
    } catch (err) {
      if (myId !== walletFetchId.current) return;
      setError(err.message || 'Failed to load wallet data.');
    } finally {
      if (myId === walletFetchId.current) setLoading(false);
    }
  }

  async function searchParcel(tokenId) {
    setLoading(true);
    setError(null);
    setSearchResult(null);
    setUnmintedResult(null);
    try {
      if (tokenId >= 1 && tokenId <= 9911) {
        const res = await fetch(`${API_URL}/estimate/${tokenId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setSearchResult(data);
      } else {
        const unmintedId = tokenId - 9911;
        const res = await fetch(`${API_URL}/unminted/search?id=${unmintedId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setUnmintedResult(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch parcel data.');
    } finally {
      setLoading(false);
    }
  }

  async function loadWalletByAddress(addr, { isWhale = false } = {}) {
    if (!addr) return;
    const myId = ++walletFetchId.current;
    setWhaleIdentifier(addr);
    setWhaleData(null);
    setIsRandomWhale(isWhale);
    setView('whale');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/wallet/${encodeURIComponent(addr)}`);
      if (myId !== walletFetchId.current) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWhaleData(data);
    } catch (err) {
      if (myId !== walletFetchId.current) return;
      setError(err.message || 'Failed to load wallet.');
    } finally {
      if (myId === walletFetchId.current) setLoading(false);
    }
  }

  function loadRandomWhale() {
    return loadWalletByAddress(pickRandomWhale(), { isWhale: true });
  }


  return (
    <div className="content-wrapper">
      <Suspense fallback={null}>
        {/* empty dep array is intentional — runs once on mount to read initial URL params only */}
        <TokenParamHandler onToken={(id) => { setView('search'); searchParcel(id); }} onAddress={loadWalletByAddress} />
      </Suspense>
      <Header
        walletAddress={walletAddress}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        onWhale={loadRandomWhale}
      />
      <main className="flex-1">
        <div className="px-6 mb-6 block md:flex justify-between items-end">
          <div>
            <a
              className={`text-[1.35rem] md:text-[1.6875rem] inline md:mb-0 mb-4 no-underline cursor-pointer switch-option-link ${view === 'search' ? 'switch-option-link--selected' : 'switch-option-link--unselected'}`}
              onClick={() => setView('search')}
            >
              parcel valuation estimate
            </a>
            {walletAddress && (
              <>
                <span className="text-[1.35rem] md:text-[1.6875rem]"> / </span>
                <a
                  className={`text-[1.35rem] md:text-[1.6875rem] inline md:mb-0 mb-4 no-underline cursor-pointer switch-option-link ${view === 'wallet' ? 'switch-option-link--selected' : 'switch-option-link--unselected'}`}
                  onClick={() => setView('wallet')}
                >
                  My Parcels
                </a>
              </>
            )}
            {whaleData && (
              <>
                <span className="text-[1.35rem] md:text-[1.6875rem]"> / </span>
                <a
                  className={`text-[1.35rem] md:text-[1.6875rem] inline md:mb-0 mb-4 no-underline cursor-pointer switch-option-link ${view === 'whale' ? 'switch-option-link--selected' : 'switch-option-link--unselected'}`}
                  onClick={() => setView('whale')}
                >
                  {isRandomWhale ? '🐋 Whale' : whaleIdentifier}
                </a>
              </>
            )}
          </div>
          {walletData && view === 'wallet' && <PortfolioStats data={walletData} />}
          {whaleData  && view === 'whale'  && <PortfolioStats data={whaleData} />}
        </div>

        <div className="px-6">
          {error && (
            <div className="mb-6 text-sm opacity-70">[error: {error}]</div>
          )}

          <ErrorBoundary>
          {view === 'search' && (
            <>
              <ParcelSearch onSearch={searchParcel} loading={loading} />
              {loading && <ResultSkeleton />}
              {searchResult && !loading && (
                <div className="mt-8">
                  <ParcelResult parcel={searchResult} ethUsd={ethUsd} />
                </div>
              )}
              {unmintedResult && !loading && (
                <div className="mt-8">
                  <UnmintedResult parcel={unmintedResult} ethUsd={ethUsd} />
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

          {view === 'whale' && (
            <WalletView
              data={whaleData}
              loading={loading}
              address={whaleIdentifier}
            />
          )}

          </ErrorBoundary>
        </div>
      </main>
      <Footer />
    </div>
  );
}

