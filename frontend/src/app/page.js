'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import ParcelSearch from '@/components/ParcelSearch';
import WalletView from '@/components/WalletView';
import ParcelResult from '@/components/ParcelResult';
import UnmintedResult from '@/components/UnmintedResult';
import UndervaluedView from '@/components/UndervaluedView';
import ErrorBoundary from '@/components/ErrorBoundary';
import { EthIcon, API_URL, WHALE_WALLETS } from '@/components/shared';

function PortfolioStats({ data }) {
  return (
    <div className="text-left md:text-right">
      <div className="flex text-left md:text-right gap-6">
        <div>
          <p className="font-semibold">Parcels</p>
          <span>{data.totalParcels}</span>
        </div>
        <div>
          <p className="font-semibold">Est. Portfolio</p>
          <span className="flex items-center justify-end gap-1">
            <EthIcon />
            {data.totalEstimatedValue.toFixed(2)}
          </span>
        </div>
        {data.sets?.length > 0 && (
          <div>
            <p className="font-semibold">Sets</p>
            <span>{data.sets.length}</span>
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

export default function Home() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [view, setView] = useState('search'); // 'search' | 'wallet' | 'whale' | 'undervalued'
  const [searchResult, setSearchResult] = useState(null);
  const [unmintedResult, setUnmintedResult] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [whaleIdentifier, setWhaleIdentifier] = useState(null);
  const [whaleData, setWhaleData] = useState(null);
  const [isRandomWhale, setIsRandomWhale] = useState(false);
  const [undervaluedData, setUndervaluedData] = useState(null);
  const [undervaluedError, setUndervaluedError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const walletFetchId = useRef(0);

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

  async function loadWalletData(address) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/wallet/${address}`);
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

  function loadAddressWallet(addr) { return loadWalletByAddress(addr); }

  function loadRandomWhale() {
    const whale = WHALE_WALLETS[Math.floor(Math.random() * WHALE_WALLETS.length)];
    return loadWalletByAddress(whale, { isWhale: true });
  }

  async function loadUndervalued() {
    setView('undervalued');
    if (undervaluedData) return; // use cache until user explicitly refreshes
    setLoading(true);
    setUndervaluedError(null);
    try {
      const res = await fetch(`${API_URL}/undervalued`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUndervaluedData(data);
    } catch (err) {
      setUndervaluedError(err.message || 'Failed to load undervalued parcels.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshUndervalued() {
    setUndervaluedData(null);
    setLoading(true);
    setUndervaluedError(null);
    try {
      const res = await fetch(`${API_URL}/undervalued`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUndervaluedData(data);
    } catch (err) {
      setUndervaluedError(err.message || 'Failed to load undervalued parcels.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content-wrapper">
      <Suspense fallback={null}>
        <TokenParamHandler onToken={(id) => { setView('search'); searchParcel(id); }} onAddress={loadAddressWallet} />
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
            {whaleData && (
              <>
                <span className="text-2xl md:text-3xl"> / </span>
                <a
                  className={`text-2xl md:text-3xl inline md:mb-0 mb-4 no-underline cursor-pointer switch-option-link ${view === 'whale' ? 'switch-option-link--selected' : 'switch-option-link--unselected'}`}
                  onClick={() => setView('whale')}
                >
                  {isRandomWhale ? '🐋 Whale' : whaleIdentifier}
                </a>
              </>
            )}
            {view === 'undervalued' && (
              <>
                <span className="text-2xl md:text-3xl"> / </span>
                <a
                  className="text-2xl md:text-3xl inline md:mb-0 mb-4 no-underline cursor-pointer switch-option-link switch-option-link--selected"
                >
                  [bargains]
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
              {searchResult && !loading && (
                <div className="mt-8">
                  <ParcelResult parcel={searchResult} />
                </div>
              )}
              {unmintedResult && !loading && (
                <div className="mt-8">
                  <UnmintedResult parcel={unmintedResult} />
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

          {view === 'undervalued' && (
            <>
              {undervaluedData && !loading && (
                <div className="mb-4">
                  <button
                    className="btn-primary btn-sm text-xs"
                    onClick={refreshUndervalued}
                  >
                    [refresh listings]
                  </button>
                </div>
              )}
              <UndervaluedView
                data={undervaluedData}
                loading={loading}
                error={undervaluedError}
              />
            </>
          )}
          </ErrorBoundary>
        </div>
      </main>
      <footer className="px-6 mt-16 mb-6 text-xs opacity-40">
        Built with enthusiasm by{' '}
        <a href="https://x.com/TerraformsOTC" target="_blank" rel="noopener noreferrer">
          TerraformsOTC
        </a>
        {' '}and Claude. Want help buying or selling a parcel? Contact{' '}
        <a href="mailto:terraformsotc@protonmail.com">
          terraformsotc@protonmail.com
        </a>
      </footer>
    </div>
  );
}

