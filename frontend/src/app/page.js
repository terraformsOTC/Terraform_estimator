'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import ParcelSearch from '@/components/ParcelSearch';
import WalletView from '@/components/WalletView';
import ParcelResult from '@/components/ParcelResult';
import UnmintedResult from '@/components/UnmintedResult';
import ErrorBoundary from '@/components/ErrorBoundary';
import { EthIcon, API_URL } from '@/components/shared';

const WHALE_WALLETS = [
  // Raw addresses
  '0x9ddbdcd3c5123e673e4b96992101f8ceafcd95a0',
  '0xb88f61e6fbda83fbfffabe364112137480398018',
  '0x3f51e7af7cf3e4be9af7b8f58324d0b085f4e4d9',
  '0x5f298bd43168b7d3cbb71b1ea017ddbe250220ae',
  '0x43b3A12cdc49003c9537D0aB92800a97C0a8959E',
  '0x1Ab786Ea6828FF401477d6d351408CDE2ff0B938',
  '0xc21870affbef7df68ec74c91389daae6beeac0ec',
  '0x113d754ff2e6ca9fd6ab51932493e4f9dabdf596',
  '0xbc49de68bcbd164574847a7ced47e7475179c76b',
  '0x717a578E4A157Ea52EE989be75f15957F294d1A9',
  '0xec7be1863da9a3f7108103b6e5d8a358b608aa45',
  '0xaaA3F05f25EeD87eE3a268F4582Ec914e6245577',
  '0xb5e1532b054226d92913b40da22a01b7900ec96e',
  '0xAc6745E88C85a44A6D8bDdc11DE2C93A94ef900C',
  '0x3833a533f811a20b30b9694e8045ea575c0ae1f6',
  '0x1ff2875cd548eeae6d22f26bae2d72a50fd143c7',
  '0x821372752c0a7D9Bfc7a78F11E4aAD3147A8db22',
  '0x2E0D63fFCB08eA20fF3AcDbB72dfEc97343885d2',
  '0x69a949D2330bFaC2FDBEE90ccfA9923343326B19',
  '0x9aF256B6A43d8A2B7c427DF049D2d32B700B9998',
  '0x8A5a244B08678a7DE0605494fe4E76C552935d38',
  '0x0b4c12293d4136a6fa4abb9a1610c5d2ec920df9',
  '0xb270e2b81437b7945f906cd88419da8864ce3803',
  '0x6bdac4f8dfda978b26df826ae4ef57f6d3b4f6b7',
  '0xe553fe5b71a236a8d6b03cbddde8be48c5fc5402',
  '0x0c78a025d8bf74298c19f569a8b41f74c3863296',
  '0x3FD272470965E7dDcE30c97feDE93e11839f3ac3',
  '0x99e2e69f98b164c399cc12d8382a82135eea6364',
  '0xDe8Ed5A0f5F94548D62873A5dEe1eE79992e016a',
  '0xFb7Ad45dF71dc18237FC30f2E4654E733D4503C3',
  '0xa9ee02564d0ab84b77efb4a4eaa16f6b7bf30a44',
  '0x35cbedc3412d3c93dec4afa60ddf38c2a9c38865',
  '0xd3c3678b3f70e43162aaf21039c4669a0dd78c81',
  '0x2C0a5Ed29d463f6c6180fF4DAdAb248158b6DA5B',
  '0x0B119DDa8918c8bd6EB5F316fA23A553777e1aA9',
  '0x6b34dd13CE75a1aB05B9bdE8C3b31AcA77184329',
  '0x56ca0b9cfc2e88b5fadf1b37c77908265148ef2b',
  '0x03f0e71ac43276FCF0b327b1AbE8CDF5974aeCC1',
  '0x9039c742b908c2dded0ae499501bbae9286e1995',
  '0xfcd457b27ee149e74a080b2a4e482d9a5dbaf3d9',
  '0x012E168ACb9fdc90a4ED9fd6cA2834D9bF5b579e',
  '0x55313b424de97716c9dfc7f6f97dcaab0234274d',
  '0xc229d7D3dD662A1b107E29AA84bb0C8Ff609CF3A',
  '0xD72bb0961368F1A5c566E0ac3AFCA62afFa20F14',
  '0x27d558d7da6853eac80081d624d058a559284855',
  '0x4ca1cb4bc1d4b24806fdf27d2b4be0a1045f463e',
  '0x578f9b95723ae641d6c9d37d5a47f42f3895eb02',
  '0xaF8738a35eB57A2C69EeFD4ED48947aB45FcF765',
  '0xda930d632c17719b7d1f75a8cb986b7417c7ba75',
  '0xcb14228737c6b38C0d060bf7Cf5FF8f9090936fc',
];

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
          <span className="flex items-center gap-1">
            <EthIcon />
            {data.totalEstimatedValue.toFixed(3)}
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
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      const id = parseInt(token);
      if (!isNaN(id) && id >= 1 && id <= 11104) onToken(id);
    }
    const address = searchParams.get('address');
    if (address) onAddress(address);
  }, []);
  return null;
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

  async function loadAddressWallet(addr) {
    if (!addr) return;
    setWhaleIdentifier(addr);
    setWhaleData(null);
    setIsRandomWhale(false);
    setView('whale');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/wallet/${encodeURIComponent(addr)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWhaleData(data);
    } catch (err) {
      setError(err.message || 'Failed to load wallet.');
    } finally {
      setLoading(false);
    }
  }

  async function loadRandomWhale() {
    const whale = WHALE_WALLETS[Math.floor(Math.random() * WHALE_WALLETS.length)];
    setWhaleIdentifier(whale);
    setWhaleData(null);
    setIsRandomWhale(true);
    setView('whale');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/wallet/${encodeURIComponent(whale)}`);
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
          </ErrorBoundary>
        </div>
      </main>
      <footer className="px-6 mt-16 mb-6 text-xs opacity-40">
        Built with enthusiasm by{' '}
        <a href="https://x.com/TerraformsOTC" target="_blank" rel="noopener noreferrer">
          TerraformsOTC
        </a>
        {' '}and Claude. Want help selling or buying a parcel? Contact{' '}
        <a href="mailto:terraformsotc@protonmail.com">
          terraformsotc@protonmail.com
        </a>
      </footer>
    </div>
  );
}

