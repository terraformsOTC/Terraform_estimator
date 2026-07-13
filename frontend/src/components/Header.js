'use client';

import { useState, useEffect, useRef } from 'react';
import { useMoneySword } from '@/contexts/MoneySword';

export default function Header({ walletAddress, onConnect, onDisconnect, onWhale }) {
  const short = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  const [moneySword, toggleMoneySword] = useMoneySword();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const handleWhale = () => {
    closeMenu();
    onWhale?.();
  };

  // Primary links stay visible in the banner; everything else is grouped under
  // the [more ▾] dropdown (desktop) / hamburger menu (mobile).
  const primaryNav = [
    { label: '[listings]', href: '/listings' },
    { label: '[sales]', href: '/sales' },
  ];
  const menuNav = [
    { label: '[random collector]', onClick: handleWhale },
    { label: '[glossary]', href: '/glossary' },
    { label: '[traits]', href: '/traits' },
    { label: '[explorer ↗]', href: 'https://terraformexplorer.xyz', external: true },
    { label: '[lore ↗]', href: 'https://www.terraformlore.xyz', external: true },
    { label: '[mandala tool ↗]', href: 'https://terraformmandala.xyz', external: true },
  ];

  const renderNavItem = (item, classes, closeOnNav) => {
    if (item.onClick) {
      return (
        <button
          key={item.label}
          onClick={item.onClick}
          className={`${classes} bg-transparent border-none cursor-pointer p-0 font-inherit text-left`}
        >
          {item.label}
        </button>
      );
    }
    const externalProps = item.external
      ? { target: '_blank', rel: 'noopener noreferrer' }
      : {};
    return (
      <a
        key={item.label}
        href={item.href}
        onClick={closeOnNav ? closeMenu : undefined}
        {...externalProps}
        className={classes}
      >
        {item.label}
      </a>
    );
  };

  const desktopClasses = (item) =>
    `text-sm opacity-60 hover:opacity-100 transition-opacity no-underline hidden md:inline${item.external ? ' whitespace-nowrap' : ''}`;

  const mobileClasses = 'text-sm opacity-80 hover:opacity-100 transition-opacity no-underline py-2';

  const dropdownClasses = 'block text-sm opacity-70 hover:opacity-100 transition-opacity no-underline py-2 whitespace-nowrap text-left';

  return (
    <header ref={containerRef} className="z-10 px-6 py-4 md:py-6 md:mb-6 mb-3 sticky top-0 md:relative bg-primary">
      <nav className="flex flex-row justify-between items-center gap-3" style={{ minHeight: '36px' }}>
        <div className="flex items-center whitespace-nowrap">
          <a className="md:my-0 no-underline" href="/">[terraform estimator]</a>
          <button
            onClick={toggleMoneySword}
            title={moneySword ? 'Disable Money Sword mode' : 'Enable Money Sword mode'}
            className={`ml-2 bg-transparent border-none cursor-pointer p-0 font-inherit leading-none transition-opacity ${moneySword ? 'opacity-100' : 'opacity-35 hover:opacity-60'}`}
            style={{ fontSize: '1.1em' }}
          >
            🗡
          </button>
        </div>
        <div className="flex items-center gap-4">
          {primaryNav.map((item) => renderNavItem(item, desktopClasses(item), false))}
          {/* desktop: secondary links grouped under a [more ▾] dropdown */}
          <div className="relative hidden md:flex md:items-center">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="text-sm opacity-60 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-0 font-inherit whitespace-nowrap"
            >
              {`[more ${menuOpen ? '▴' : '▾'}]`}
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-3 z-20 flex flex-col px-4 py-1 bg-primary border"
                style={{ borderColor: 'rgba(232, 232, 232, 0.12)' }}
              >
                {menuNav.map((item) => renderNavItem(item, dropdownClasses, true))}
              </div>
            )}
          </div>
          {/* mobile: single hamburger menu */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="text-sm opacity-60 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-0 font-inherit md:hidden whitespace-nowrap"
          >
            {`[${menuOpen ? 'close' : 'menu'}]`}
          </button>
          {walletAddress ? (
            <button
              className="btn-primary btn-sm whitespace-nowrap"
              onClick={onDisconnect}
              title="Click to disconnect"
            >
              {short}
            </button>
          ) : (
            <button className="btn-primary btn-sm whitespace-nowrap" onClick={onConnect}>
              connect<span className="hidden md:inline"> wallet</span>
            </button>
          )}
        </div>
      </nav>
      {menuOpen && (
        <div
          className="md:hidden flex flex-col mt-4 pt-4 border-t"
          style={{ borderColor: 'rgba(232, 232, 232, 0.12)' }}
        >
          {[...primaryNav, ...menuNav].map((item) => renderNavItem(item, mobileClasses, true))}
        </div>
      )}
      {moneySword && (
        <p className="text-xs opacity-50 mt-2">
          🗡 One or more nerds has the money sword, there is an uncomfortable amount of competition for parcels. All estimates are increased.
        </p>
      )}
      <p className="text-xs mt-2" style={{ color: 'rgba(232,232,232,0.4)' }}>
        Pricing methodology migration coming soon — mainly impacts rare &amp; special parcels.{' '}
        <a href="https://twitter.com/TerraformsOTC" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(232,232,232,0.4)', textDecoration: 'underline' }}>
          Contact us
        </a>{' '}
        with any questions.
      </p>
    </header>
  );
}
