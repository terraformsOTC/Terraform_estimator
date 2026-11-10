// rpcLimiter.js — one cap on the API's RPC traffic, whoever asks.
//
// Why: every route, the parcel store and the event poller share one RPC
// endpoint and its rate allowance. Each route bounded its own fan-out, but
// nothing bounded them together, so a few busy visitors could push the server
// past the provider's limit, and once throttled the poller, owner lookups and
// ENS fail for everyone (security scan 2026-11-04, finding 4).
//
// CappedJsonRpcProvider routes every HTTP request the provider makes through
// one RpcLimiter: at most `maxInFlight` at a time, the rest wait their turn in
// order. If more than `maxQueued` are already waiting, a new request fails at
// once ("RPC busy") instead of joining an ever longer queue; callers already
// treat an RPC error as "try again" or fall back to cached data.

const { ethers } = require('ethers');

class RpcBusyError extends Error {
  constructor() {
    super('RPC busy: too many requests waiting');
    this.code = 'RPC_BUSY';
  }
}

class RpcLimiter {
  constructor({ maxInFlight = 8, maxQueued = 400 } = {}) {
    this.maxInFlight = maxInFlight;
    this.maxQueued = maxQueued;
    this.active = 0;
    this.waiting = [];
    this.stats = { started: 0, queued: 0, rejected: 0, peakWaiting: 0 };
  }

  acquire() {
    if (this.active < this.maxInFlight) {
      this.active++;
      this.stats.started++;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.maxQueued) {
      this.stats.rejected++;
      return Promise.reject(new RpcBusyError());
    }
    this.stats.queued++;
    return new Promise(resolve => {
      this.waiting.push(resolve);
      if (this.waiting.length > this.stats.peakWaiting) this.stats.peakWaiting = this.waiting.length;
    });
  }

  release() {
    const next = this.waiting.shift();
    if (next) {
      // The slot passes straight to the next caller; `active` stays the same.
      this.stats.started++;
      next();
    } else {
      this.active--;
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ethers v6 sends every JSON-RPC payload (a single call or a batch) through
// _send, one HTTP request each, so capping _send caps the provider's requests.
class CappedJsonRpcProvider extends ethers.JsonRpcProvider {
  constructor(url, limiter, network, options) {
    super(url, network, options);
    this.limiter = limiter;
  }

  _send(payload) {
    return this.limiter.run(() => super._send(payload));
  }
}

module.exports = { RpcLimiter, RpcBusyError, CappedJsonRpcProvider };
