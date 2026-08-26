'use client';

// Explains the model, so the parcel view can show a bare range with no caption.
// Deliberately terse — one answer per question, no warm-up sentences.

import Header from '@/components/Header';
import { connectAndRedirect, Footer } from '@/components/shared';

function Q({ id, q, children }) {
  return (
    <section id={id} className="mb-8 max-w-2xl scroll-mt-24">
      <h2 className="text-base mb-2">{q}</h2>
      <div className="text-sm opacity-70 flex flex-col gap-2">{children}</div>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />
      <main className="flex-1">
        <div className="px-6 mb-8">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[methodology]</span>
          </span>
        </div>

        <div className="px-6">
          <Q id="how" q="How are values calculated?">
            <p>
              The collection floor, multiplied by what a parcel&apos;s traits are worth. The multipliers
              are fitted to roughly 20,000 settled sales, so each one reflects what buyers have actually
              paid rather than a judgement call.
            </p>
          </Q>

          <Q id="hedonic" q="What is a hedonic pricing model?">
            <p>
              A model that prices something by pricing its characteristics. Nobody sells a zone or a
              biome on its own, but every sale is a bundle of them, and across enough sales you can
              separate out what each contributes.
            </p>
            <p>
              It is the standard approach for housing — you cannot look up the price of a third bedroom,
              but you can derive it from thousands of sales.
            </p>
          </Q>

          <Q id="model" q="How does the model work?">
            <p>
              A weighted regression on the log of each sale price relative to the floor at the time it
              sold. Working in floor multiples means the answers stay meaningful as the market moves.
            </p>
            <p>
              Recent sales count for more — the weighting halves every 60 days. Traits with few sales are
              pulled toward a hand-tuned prior, so one unusual trade cannot set a rare zone&apos;s price.
              Godmode, Plague, the seeds and Lith0 have too few sales to fit and show a single number.
            </p>
          </Q>

          <Q id="range" q="Why a range and not one number?">
            <p>
              A parcel is worth two things depending on how it sells. Accepting a standing offer nets
              less than listing it and waiting for a buyer. The model measures that gap rather than
              guessing it; currently about 12%.
            </p>
            <p>
              The low end is roughly what an offer nets, the high end what a listing sells for. Both are
              prices things have sold at — neither is an asking price, since listings that never sell
              are not in the data.
            </p>
          </Q>

          <Q id="floor" q="Why can an estimate be higher than the traits suggest?">
            <p>
              OpenSea lets someone bid on any parcel in the collection at once. While such an offer
              stands, any parcel can be sold for it immediately, so no estimate is allowed below it.
              Checked every few minutes; with no offer standing, the raw model estimate shows.
            </p>
          </Q>

          <Q id="accuracy" q="How accurate is it?">
            <p>
              Median error against recent settled sales is around 11% — half of sales land closer, half
              further. Least reliable on very rare zones, one-of-ones and anything far from recent
              trading; most reliable in the middle of the market.
            </p>
          </Q>

          <Q id="floorprice" q="Where does the floor price come from?">
            <p>
              OpenSea. The model trained against a more conservative measure — a low percentile of what
              actually traded rather than the cheapest listing — so a calibration constant reconciles the
              two. Without it every estimate would read about 17% high.
            </p>
          </Q>

          <Q id="listed" q="What does the listed price mean?">
            <p>
              What the current owner is asking on OpenSea, shown under the estimate when a parcel is for
              sale. It may sit well above or below the model — comparing the two is the point.
            </p>
          </Q>

          <Q id="unminted" q="How are unminted parcels valued?">
            <p>
              Identically. Their traits are already known, so they run through the same model. What is
              not known is which token number they will receive — minting allocates those at random.
            </p>
          </Q>

          <Q id="old" q="What happened to the old model?">
            <p>
              Its multipliers were set by hand and read high — parcels sold for less than it predicted.
              It is still at <a href="/legacy" className="no-underline">/legacy</a> for reproducing older
              quotes.
            </p>
          </Q>

          <p className="text-xs opacity-40 max-w-2xl mb-10">
            Not financial advice. Estimates describe what similar parcels have sold for, which is not a
            promise about what yours will.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
