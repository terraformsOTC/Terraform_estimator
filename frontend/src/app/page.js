'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import ParcelSearch from '@/components/ParcelSearch';
import WalletView from '@/components/WalletView';
import ParcelResult from '@/components/ParcelResult';
import { EthIcon } from '@/components/shared';

const WHALE_WALLETS = [
  // Raw addresses
  '0x9ddbdcd3c5123e673e4b96992101f8ceafcd95a0',
  '0xb88f61e6fbda83fbfffabe364112137480398018',
  '0x3f51e7af7cf3e4be9af7b8f58324d0b085f4e4d9',
  '0x5f298bd43168b7d3cbb71b1ea017ddbe250220ae',
  '0xc21870affbef7df68ec74c91389daae6beeac0ec',
  '0xbc49de68bcbd164574847a7ced47e7475179c76b',
  '0xec7be1863da9a3f7108103b6e5d8a358b608aa45',
  '0xb5e1532b054226d92913b40da22a01b7900ec96e',
  '0x3833a533f811a20b30b9694e8045ea575c0ae1f6',
  '0x1ff2875cd548eeae6d22f26bae2d72a50fd143c7',
  '0x0b4c12293d4136a6fa4abb9a1610c5d2ec920df9',
  '0xb270e2b81437b7945f906cd88419da8864ce3803',
  '0x6bdac4f8dfda978b26df826ae4ef57f6d3b4f6b7',
  '0xe553fe5b71a236a8d6b03cbddde8be48c5fc5402',
  '0x0c78a025d8bf74298c19f569a8b41f74c3863296',
  '0x99e2e69f98b164c399cc12d8382a82135eea6364',
  '0xa9ee02564d0ab84b77efb4a4eaa16f6b7bf30a44',
  '0x35cbedc3412d3c93dec4afa60ddf38c2a9c38865',
  // ENS names
  'dinovault.eth',
  'hee.eth',
  '🐒.eth',
  '0x717a.eth',
  'maffs.eth',
  'voidprison.eth',
  'djen.eth',
  'flashrekt.eth',
  'cdx.eth',
  'pathogen.eth',
  'mnemonic.eth',
  'itme.eth',
  'el-vault.eth',
  'quantize.eth',
];

function TokenParamHandler({ onToken }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      const id = parseInt(token);
      if (!isNaN(id) && id >= 1 && id <= 9911) onToken(id);
    }
  }, []);
  return null;
}

export default function Home() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [view, setView] = useState('search'); // 'search' | 'wallet' | 'whale'
  const [searchResult, setSearchResult] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [whaleIdentifier, setWhaleIdentifier] = useState(null);
  const [whaleData, setWhaleData] = useState(null);
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

  async function loadRandomWhale() {
    const whale = WHALE_WALLETS[Math.floor(Math.random() * WHALE_WALLETS.length)];
    setWhaleIdentifier(whale);
    setWhaleData(null);
    setView('whale');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/wallet/${encodeURIComponent(whale)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWhaleData(data);
    } catch (err) {
      setError(err.message || 'Failed to load whale wallet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content-wrapper">
      <Suspense fallback={null}>
        <TokenParamHandler onToken={(id) => { setView('search'); searchParcel(id); }} />
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
                  🐋 Whale
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
          {whaleData && view === 'whale' && (
            <div className="text-left md:text-right">
              <p className="text-xs opacity-50 mb-1">{whaleIdentifier}</p>
              <div className="flex text-left md:text-right gap-6">
                <div>
                  <p className="font-semibold">Parcels</p>
                  <span>{whaleData.totalParcels}</span>
                </div>
                <div>
                  <p className="font-semibold">Est. Portfolio</p>
                  <span className="flex items-center gap-1">
                    <EthIcon />
                    {whaleData.totalEstimatedValue.toFixed(3)}
                  </span>
                </div>
                {whaleData.sets?.length > 0 && (
                  <div>
                    <p className="font-semibold">Sets</p>
                    <span>{whaleData.sets.length}</span>
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

          {view === 'whale' && (
            <WalletView
              data={whaleData}
              loading={loading}
              address={whaleIdentifier}
            />
          )}
        </div>
      </main>
      <footer className="px-6 mt-16 mb-6 text-xs opacity-40">
        Built with enthusiasm by{' '}
        <a href="https://x.com/TerraformsOTC" target="_blank" rel="noopener noreferrer">
          TerraformsOTC
        </a>
        {' '}and Claude
      </footer>
    </div>
  );
}

