'use client';

// Explains the model in plain language, so the parcel page can show a range
// without a caption trying to teach hedonic pricing in four words.

import Header from '@/components/Header';
import { connectAndRedirect, Footer } from '@/components/shared';

function Q({ id, q, children }) {
  return (
    <section id={id} className="mb-10 max-w-2xl scroll-mt-24">
      <h2 className="text-base mb-2">{q}</h2>
      <div className="text-sm opacity-70 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export default function FaqPage() {
  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />
      <main className="flex-1">
        <div className="px-6 mb-8">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[faq]</span>
          </span>
        </div>

        <div className="px-6">
          <Q id="how" q="How are values calculated?">
            <p>
              Every estimate starts from the collection floor and multiplies it by what a parcel&apos;s
              traits are worth. A parcel in a sought-after zone, on an unusual biome, at an extreme
              level, is worth some multiple of a plain one — the model&apos;s job is to say what that
              multiple is.
            </p>
            <p>
              The multiples are not set by hand. They are fitted to roughly 20,000 sales that actually
              settled, so the number attached to a trait is whatever buyers have really paid for it,
              not what anyone thinks it ought to be worth.
            </p>
          </Q>

          <Q id="hedonic" q="What is a hedonic pricing model?">
            <p>
              A hedonic model prices something by pricing its characteristics. Nobody sells &quot;a
              zone&quot; or &quot;a biome&quot; on its own, but every sale is a bundle of them, and
              across enough sales you can separate out what each one contributes.
            </p>
            <p>
              It is the standard approach for housing: you cannot look up the price of a third bedroom,
              but you can work it out from thousands of sales of houses that differ in how many bedrooms
              they have. Terraforms parcels are the same shape of problem — a fixed set of traits,
              combined differently each time, with a long history of public sales to learn from.
            </p>
          </Q>

          <Q id="model" q="How does the model work?">
            <p>
              It is a weighted regression on the log of each sale&apos;s price relative to the floor at
              the time it sold. Working in floor multiples rather than ETH means the model learns what a
              trait is worth in relative terms, so its answers stay meaningful as the whole market moves
              up or down.
            </p>
            <p>
              Recent sales count for more than old ones — the weighting halves every 60 days, so last
              month&apos;s market matters more than 2023&apos;s. Traits with very few sales are pulled
              toward a hand-tuned prior rather than being estimated from a handful of trades, which stops
              one unusual sale of a rare zone from setting that zone&apos;s price for everyone.
            </p>
            <p>
              A few parcel types — Godmode, Plague, the seeds, Lith0 — have too few sales to fit at all.
              Those fall back to the older hand-tuned model and show a single number instead of a range.
            </p>
          </Q>

          <Q id="range" q="Why is the estimate a range and not one number?">
            <p>
              Because a parcel is worth two different things depending on how it changes hands. Accept
              a standing offer and you get one price; list it and wait for a buyer and you get a higher
              one. Both are real, and both happen every week.
            </p>
            <p>
              The model measures that gap directly rather than guessing at it, and it is currently about
              12%. The low end of the range is roughly what accepting an offer nets you; the high end is
              roughly what a listing sells for. A single number would have to pretend one of those is
              the truth.
            </p>
            <p>
              Both ends are prices things have actually sold at. Neither is an asking price — plenty of
              listings never sell, and those are not in the data.
            </p>
          </Q>

          <Q id="floor" q="Why was my estimate raised to the collection offer?">
            <p>
              OpenSea lets someone bid on any parcel in the collection at once. While such an offer
              stands, every parcel can be sold for that amount immediately, whatever its traits.
            </p>
            <p>
              So no estimate is allowed below the best standing collection-wide offer. If the model
              prices a parcel under it, the estimate is raised to it — the market is telling us something
              the traits do not. This is checked every few minutes, and when no offer stands, the raw
              model estimate is shown.
            </p>
          </Q>

          <Q id="accuracy" q="How accurate is it?">
            <p>
              Against the most recent settled sales, the model&apos;s median error is around 11%. Half of
              sales land closer than that, half further. It is a starting point for a conversation about
              price, not a quote.
            </p>
            <p>
              It is least reliable where it has least to learn from: very rare zones, one-of-ones, and
              parcels far from anything that has traded recently. It is most reliable in the middle of
              the market, where sales are frequent.
            </p>
          </Q>

          <Q id="floorprice" q="Where does the floor price come from?">
            <p>
              The live collection floor comes from OpenSea. The model was trained against a different,
              more conservative floor measure — a low percentile of what actually traded, rather than the
              cheapest thing currently listed — so a calibration constant reconciles the two. Without it
              every estimate would read about 17% high.
            </p>
          </Q>

          <Q id="listed" q="What does the listed price on a parcel mean?">
            <p>
              If a parcel is for sale on OpenSea, its asking price is shown under the estimate. That is
              what the current owner wants, which may be well above or below what the model thinks it is
              worth — comparing the two is the point.
            </p>
          </Q>

          <Q id="unminted" q="How are unminted parcels valued?">
            <p>
              The same way as minted ones. Unminted parcels already have known traits — zone, biome,
              level, chroma — so they run through the identical model. What is not known is which token
              number a parcel will receive, because minting allocates those at random.
            </p>
          </Q>

          <Q id="old" q="What happened to the old model?">
            <p>
              It used multipliers set by hand rather than fitted to sales, and it read high — parcels
              consistently sold for less than it predicted. It is still available at{' '}
              <a href="/legacy" className="no-underline">/legacy</a> if you want to reproduce an older
              quote.
            </p>
          </Q>

          <p className="text-xs opacity-40 max-w-2xl mb-10">
            Estimates are not financial advice. They describe what similar parcels have sold for, which
            is not a promise about what yours will.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
