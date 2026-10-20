'use client';

import { WISHLIST_COLOR } from '@/lib/wishlist';

// The words differ by page: listings that fill a gap, or another collector's
// parcels that do.
const WORDS = {
  listings: {
    what: 'the listings',
    count: n => `${n} ${n === 1 ? 'listing fills' : 'listings fill'} a gap on your wishlist`,
    none: 'nothing listed right now fills a gap on your wishlist',
  },
  wallet: {
    what: 'the parcels here',
    count: n => `${n} of their parcels ${n === 1 ? 'fills' : 'fill'} a gap on your wishlist`,
    none: 'none of their parcels fill a gap on your wishlist',
  },
};

// What the collector's wishlist says about the page (lib/wishlist.js): nothing
// at all with no wallet connected and no wishlist on (status 'off'); with a
// wallet connected, the way to switch the marks on. `extra` sits after the
// count once the marks are on — the wallet page's [show only these].
export default function WishlistLine({ wishlist, count, page = 'listings', extra = null }) {
  const status = wishlist?.status || 'off';
  const words = WORDS[page];
  const star = <span style={{ color: WISHLIST_COLOR }}>★</span>;
  if (wishlist?.error && status !== 'on') {
    return <div className="mb-4 text-xs" style={{ color: '#e8b86c' }}>{star} {wishlist.error}</div>;
  }
  if (status === 'off') return null;
  const edit = <a href="/helper" className="opacity-70 hover:opacity-100">[edit wishlist]</a>;
  const turnOn = (
    <button type="button" className="btn-primary btn-xs" style={{ color: WISHLIST_COLOR, borderColor: WISHLIST_COLOR }} onClick={wishlist.turnOn}>
      [turn on wishlist]
    </button>
  );
  let body;
  if (status === 'loading') {
    body = <>{star} checking your wishlist…</>;
  } else if (status === 'mine') {
    body = <span className="opacity-75">{star} your own wallet — its parcels already count toward your wishlist · {edit}</span>;
  } else if (status === 'setup') {
    body = (
      <>
        {star} Mark {words.what} that fill gaps in your collection:{' '}
        <a href={`/helper?w=${wishlist.connected}`} style={{ color: WISHLIST_COLOR }}>[set up your wishlist →]</a>{' '}
        <span className="opacity-60">— pick your goals, and add any vault or other wallet you collect with so its parcels count.</span>
      </>
    );
  } else if (status === 'available') {
    body = <>{star} Mark {words.what} that fill gaps in your helper goals: {turnOn} <a href="/helper" className="opacity-70 hover:opacity-100">[edit goals]</a></>;
  } else if (status === 'not-in-setup') {
    body = (
      <>
        {star} This wallet isn&apos;t in your helper setup yet. Add it and mark {words.what} that fill your gaps: {turnOn}{' '}
        <a href="/helper" className="opacity-70 hover:opacity-100">[edit in the helper]</a>
      </>
    );
  } else if (status === 'disconnected') {
    body = (
      <>
        {star} your helper wishlist is saved in this browser —{' '}
        <button type="button" className="underline" onClick={wishlist.connect}>connect your wallet</button>{' '}
        to mark {words.what} that fill it.
      </>
    );
  } else if (status === 'other-wallet') {
    body = (
      <>
        {star} the connected wallet isn&apos;t in your wishlist group:{' '}
        <button type="button" className="underline" onClick={wishlist.turnOn}>add it</button> · {edit}
      </>
    );
  } else {
    body = count > 0
      ? <>{star} <span style={{ color: WISHLIST_COLOR }}>{words.count(count)}</span>{extra && <> · {extra}</>} · {edit}</>
      : <>{star} {words.none} · {edit}</>;
  }
  return <div className="mb-4 text-xs opacity-80">{body}</div>;
}
