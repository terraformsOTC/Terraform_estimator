'use client';

import { CATEGORY_COLORS, SPECIAL_TYPE_BADGES, SpecialBadge, connectAndRedirect, Footer } from '@/components/shared';
import Header from '@/components/Header';
import { TRAIT_DESCRIPTIONS } from '@/lib/traitDescriptions';
import { SETS_GLOSSARY } from '@/lib/setsGlossary';

export default function GlossaryPage() {
  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />

      <main className="flex-1 px-6 max-w-2xl">
        <h1 className="text-3xl mb-2">Glossary</h1>
        <p className="opacity-55 text-sm mb-10">
          A reference for all the classifier tags used in parcel estimates.
        </p>

        {/* ── DESIRABILITY TIERS ───────────────────────────────────── */}
        <Section title="Desirability Tiers">
          <p className="text-sm opacity-65 mb-4">
            Every trait is assigned a desirability tier based on how numerous they are in the collection and how avidly they are sought after by collectors. Usually, the rarer a trait the more highly it is valued.
          </p>
          <p className="text-sm opacity-65 mb-2">
            The model assesses each zone, biome and level on two metrics:
          </p>
          <ul className="text-sm opacity-65 mb-4 list-disc pl-5 space-y-1">
            <li><strong>Price multiple</strong> is what parcels carrying the trait sell for against an otherwise identical parcel, fitted across 20,000+ sales with recent trades weighted most.</li>
            <li><strong>Scarcity</strong> is the number of the 9,911 minted parcels which carry that specific trait.</li>
          </ul>
          <GlossaryRow
            badge={<CategoryBadge label="Mythical" color={CATEGORY_COLORS.Mythical} />}
            description="The most coveted traits in the collection. Parcels carrying a Mythical trait command a price multiple over 2.5×, and/or have a scarcity of 25 parcels or less where there is not enough sales data to calculate the multiple."
          />
          <GlossaryRow
            badge={<CategoryBadge label="Rare" color={CATEGORY_COLORS.Rare} />}
            description="High-demand traits with a price multiple of 1.3× or more, and a scarcity of 100 parcels or less (<1% of the collection)."
          />
          <GlossaryRow
            badge={<CategoryBadge label="Premium" color={CATEGORY_COLORS.Premium} />}
            description="Desirable traits that carry a price multiple of 1.1× or more, but fall short of Rare on either multiple or scarcity."
          />
          <GlossaryRow
            badge={<CategoryBadge label="Uncommon" color={CATEGORY_COLORS['Uncommon']} />}
            description="No significant multiple (under 1.1×), but has a scarcity value of 200 parcels or less."
          />
          <GlossaryRow
            badge={<CategoryBadge label="Floor" color="rgba(232,232,232,0.4)" />}
            description="The most common traits with no price multiple and a scarcity value of 200 parcels or more."
          />
          <p className="text-sm opacity-65 leading-relaxed">
            You can view the full rubric for desirability tiers and how they are applied to traits <a href="/desirabilitytiers" className="underline">here</a>.
          </p>
        </Section>

        {/* ── SPECIAL PARCEL TYPES ─────────────────────────────────── */}
        <Section title="Special Parcel Types">
          <p className="text-sm opacity-65 mb-4">
            Special parcels have rare properties that override or supplement the standard zone/biome/level valuation formula. Most are priced as a multiple of the collection floor.
          </p>
          <GlossaryRow badge={<SpecialBadge type="Godmode" />}         description={TRAIT_DESCRIPTIONS['godmode']} />
          <GlossaryRow
            badge={<CategoryBadge label="origin mint" color="#ffaa00" />}
            description="An origin daydream or terraform mode parcel, which inherits an extra custom unicode character set in addition to those of its biome. These were specially allocated to certain contributors and community members when Terraforms launched in 2021. As each parcel going from terrain to daydream mode incrementally delays (and eventually averts) the self-destruction of Hypercastle, these Origin mints also calibrated the initial time before the Hypercastle would start to decay. As switching between terraform and daydream mode is reversible, we've decided to group both terraform and daydream modes together to avoid misleading rarity stats."
          />
          <GlossaryRow badge={<SpecialBadge type="Plague" />}          description={TRAIT_DESCRIPTIONS['plague']} />
          <GlossaryRow badge={<SpecialBadge type="X-Seed" />}          description={TRAIT_DESCRIPTIONS['x-seed']} />
          <GlossaryRow badge={<SpecialBadge type="Y-Seed" />}          description={TRAIT_DESCRIPTIONS['y-seed']} />
          <GlossaryRow badge={<SpecialBadge type="Lith0" />}           description={TRAIT_DESCRIPTIONS['lith0']} />
          <GlossaryRow badge={<SpecialBadge type="Spine" />}           description={TRAIT_DESCRIPTIONS['spine']} />
          <GlossaryRow badge={<SpecialBadge type="1of1" />}            description={TRAIT_DESCRIPTIONS['1of1']} />
        </Section>

        {/* ── MISC TRAITS ──────────────────────────────────────────── */}
        <Section title="Other Notable Traits">
          <p className="text-sm opacity-65 mb-4">
            Additional properties appearing on certain parcels valued by collectors.
          </p>
          <GlossaryRow badge={<SpecialBadge type="S0" />}          description={TRAIT_DESCRIPTIONS['s0']} />
          <GlossaryRow badge={<SpecialBadge type="Biome0" />}      description={TRAIT_DESCRIPTIONS['biome0']} />
          <GlossaryRow badge={<SpecialBadge type="Lith0like" />}   description={TRAIT_DESCRIPTIONS['lith0like']} />
          <GlossaryRow
            badge={<CategoryBadge label="high ???" color="#ffd700" />}
            description="Parcels with a ??? value above 50,000. We still do not fully understand what this trait does, but it appears visually on parcels as a &quot;water level&quot; for cycling characters in the animation. This may be a resource that could be &quot;tapped&quot; in the future."
          />
          <GlossaryRow
            badge={<CategoryBadge label="low ???" color="#f87171" />}
            description="Parcels with a ??? value below 20,000. These are recognisable for their low &quot;water level&quot; of animated cycling characters, and are rarer than their high ??? value counterparts."
          />
          <GlossaryRow badge={<SpecialBadge type="Mesa" />}        description={TRAIT_DESCRIPTIONS['mesa']} />
          <GlossaryRow badge={<SpecialBadge type="gm" />}          description={TRAIT_DESCRIPTIONS['gm']} />
          <GlossaryRow badge={<SpecialBadge type="Matrix" />}      description={TRAIT_DESCRIPTIONS['matrix']} />
          <GlossaryRow badge={<SpecialBadge type="Heartbeat" />}   description={TRAIT_DESCRIPTIONS['heartbeat']} />
          <GlossaryRow
            badge={<SpecialBadge type="Synchro" />}
            description="[redacted]"
          />
          <GlossaryRow badge={<SpecialBadge type="Penthouse" />}   description={TRAIT_DESCRIPTIONS['penthouse']} />
          <GlossaryRow badge={<SpecialBadge type="Basement" />}    description={TRAIT_DESCRIPTIONS['basement']} />
          <GlossaryRow
            badge={<SpecialBadge type="Unminted" />}
            description="1,193 parcels are not yet minted. However thanks to the deterministic nature of the Terraforms smart contracts, we can infer their traits: zone, biome, level, chroma etc. This means we can still estimate their value, and even render the animations. We do not know when these remaining parcels will be minted."
          />
        </Section>

        {/* ── COLLECTION SETS ──────────────────────────────────── */}
        <Section title="Collection Sets">
          <p className="text-sm opacity-65 mb-6">
            Sets are groupings of parcels built around a common theme or variable in the collection. Some are easy to complete, whilst others are almost impossible. The estimator automatically detects which sets you hold, and how close you are to completing others, when you view your collection.
          </p>
          {SETS_GLOSSARY.map(set => (
            <SetGlossaryRow key={set.name} {...set} />
          ))}
        </Section>

      </main>

      <Footer />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg mb-1 opacity-80">{title}</h2>
      <div className="mb-4" style={{ borderBottom: '1px solid rgba(232,232,232,0.1)' }} />
      {children}
    </section>
  );
}

function GlossaryRow({ badge, description }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        {badge}
      </div>
      <p className="text-sm opacity-65 leading-relaxed">{description}</p>
    </div>
  );
}

function CategoryBadge({ label, color }) {
  return (
    <span className="text-xs px-1" style={{ color, border: `1px solid ${color}`, opacity: 0.85 }}>
      {label}
    </span>
  );
}


function SetGlossaryRow({ name, color, description }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs px-1" style={{ color, border: `1px solid ${color}`, opacity: 0.85 }}>
          {name}
        </span>
      </div>
      <p className="text-sm opacity-65 leading-relaxed">{description}</p>
    </div>
  );
}

