'use client';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import ParcelSearch from '@/components/ParcelSearch';
import BestTerrainCarousel from '@/components/BestTerrainCarousel';
import WalletView from '@/components/WalletView';
import ParcelResult from '@/components/ParcelResult';
import UnmintedResult from '@/components/UnmintedResult';
import ErrorBoundary from '@/components/ErrorBoundary';
import { EthIcon, API_URL, Footer, shortAddr } from '@/components/shared';

function PortfolioStats({ data }) {
  // Totals come from the backend already summed on both sides: totalEstimatedValue
  // is the bid side (what liquidating realises) and totalListedValue the ask side.
  // Shown as a range for the same reason a single parcel is — summing the ask side
  // alone would quote a wallet at a price every parcel selling at once could not get.
  const { totalEstimatedValue: low, totalListedValue: high } = data;
  const showRange = typeof high === 'number' && high !== low;
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
            {showRange ? `${low.toFixed(2)} – ${high.toFixed(2)}` : low.toFixed(2)}
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

// The rail belongs to the landing page only. Two things take you off it: a
// ?token= / ?address= deep link, and running a search from the box (which leaves
// the URL alone, so the param check cannot see it) — hence both conditions.
//
// The param read lives inside its own Suspense boundary rather than in the parent:
// useSearchParams opts this subtree out of the static prerender, so the server
// sends nothing and the client renders the rail only when it belongs. Deciding in
// an effect instead would ship the skeletons in the prerendered HTML and blink
// them away a frame later on every /?token= load.
function LandingCarousel({ suppressed }) {
  const searchParams = useSearchParams();
  if (suppressed) return null;
  if (searchParams.get('token') || searchParams.get('address')) return null;
  return (
    <div className="px-6">
      <BestTerrainCarousel />
    </div>
  );
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

  // Make the back button mean something.
  //
  // Searching pushes ?token= / ?address= so a result is linkable, but pushState
  // only rewrites the URL — React knows nothing about it. Without this, going back
  // returned the address bar to "/" while the parcel or wallet stayed on screen,
  // and the deals rail stayed hidden. That is worse than not touching the URL at
  // all, because it invites a click that appears to do nothing.
  //
  // Neither branch pushes, or navigating back would push a fresh entry and trap
  // the user in the history.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const address = params.get('address');

      if (token) {
        const id = parseInt(token, 10);
        if (!Number.isNaN(id) && id >= 1 && id <= 11104) {
          setView('search');
          searchParcel(id);
          return;
        }
      }
      if (address) {
        loadWalletByAddress(address);
        return;
      }
      // Bare "/" — back to the landing page, results cleared so the rail returns.
      walletFetchId.current += 1;   // abandon any wallet fetch still in flight
      setSearchResult(null);
      setUnmintedResult(null);
      setWhaleData(null);
      setWhaleIdentifier(null);
      setError(null);
      setLoading(false);
      setView('search');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Same contract as loadWalletByAddress: `pushUrl` when the search box is the
  // caller, so the result is linkable and the back button works; not set when the
  // ?token= deep link is, which would push the entry twice. No resolution step
  // here — a token id is already canonical, so there is nothing to replace after.
  async function searchParcel(tokenId, { pushUrl = false } = {}) {
    setLoading(true);
    setError(null);
    setSearchResult(null);
    setUnmintedResult(null);
    if (pushUrl) window.history.pushState({}, '', `/?token=${tokenId}`);
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

  // `pushUrl` is set when the search box is the caller, so the address lands in
  // the URL and the view becomes linkable and back-navigable. Not set when the
  // caller is the ?address= deep link itself — that would push the entry twice.
  async function loadWalletByAddress(addr, { pushUrl = false } = {}) {
    if (!addr) return;
    const myId = ++walletFetchId.current;
    setWhaleIdentifier(addr);
    setWhaleData(null);
    setView('whale');
    setLoading(true);
    if (pushUrl) {
      // Push what was typed straight away rather than waiting for the lookup:
      // an ENS name is a valid deep link on its own, the backend resolves it the
      // same way. The canonical address replaces it below once known.
      window.history.pushState({}, '', `/?address=${encodeURIComponent(addr)}`);
    }
    setError(null);
    try {
      const res = await fetch(`${API_URL}/wallet/${encodeURIComponent(addr)}`);
      if (myId !== walletFetchId.current) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWhaleData(data);
      // Swap the typed name for the address it resolved to, so a copied link is
      // stable even if the ENS record later points somewhere else. replaceState,
      // not push: this is the same view, spelled canonically. A combined view
      // keeps every wallet, comma-separated.
      const canonical = data.aggregate
        ? (data.wallets || []).map(w => w.address).join(',')
        : data.address;
      if (pushUrl && canonical) {
        window.history.replaceState({}, '', `/?address=${canonical}`);
      }
    } catch (err) {
      if (myId !== walletFetchId.current) return;
      setError(err.message || 'Failed to load wallet.');
    } finally {
      if (myId === walletFetchId.current) setLoading(false);
    }
  }


  // Whose parcels these are, named the way the rest of the site names a wallet:
  // ENS if the backend resolved one, otherwise the shortened address. The tab used
  // to read "🐋 Whale" for a randomly-picked collector, which told you nothing
  // about which collector you were looking at. `whaleIdentifier` is whatever was
  // typed or linked, so it can be an ENS name already — pass it through rather
  // than truncating something that is not an address.
  const whaleAddr = whaleData?.address || whaleIdentifier;
  const walletName = (w) => w?.ens || (w?.address?.startsWith('0x') ? shortAddr(w.address) : w?.address);
  // A combined view is named by its first wallet plus a count of the rest.
  const whaleLabel = whaleData?.aggregate
    ? `${walletName(whaleData.wallets[0])} +${whaleData.wallets.length - 1}`
    : whaleData?.ens
      || (whaleAddr?.startsWith('0x') ? shortAddr(whaleAddr) : whaleAddr);

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
      />
      <main className="flex-1">
        {view === 'search' && (
          <Suspense fallback={null}>
            <LandingCarousel suppressed={loading || !!searchResult || !!unmintedResult} />
          </Suspense>
        )}

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
                  {whaleLabel}
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
              <ParcelSearch
                onSearch={(id) => searchParcel(id, { pushUrl: true })}
                onAddress={(a) => loadWalletByAddress(a, { pushUrl: true })}
                loading={loading}
              />
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

