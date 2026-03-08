'use client';

import { CATEGORY_COLORS, SPECIAL_TYPE_BADGES } from '@/components/shared';

export default function GlossaryPage() {
  return (
    <div className="content-wrapper">
      <header className="z-10 px-6 py-4 md:py-6 md:mb-6 mb-3 sticky top-0 md:relative bg-primary">
        <nav className="flex flex-row justify-between items-center" style={{ minHeight: '36px' }}>
          <a className="md:my-0 no-underline" href="/">[terraform estimator]</a>
          <div className="flex items-center gap-4">
            <a href="/glossary" className="text-sm opacity-100 no-underline hidden md:inline">[glossary]</a>
            <a href="https://terraformexplorer.xyz" target="_blank" rel="noopener noreferrer"
              className="text-sm opacity-60 hover:opacity-100 transition-opacity no-underline hidden md:inline">
              [explorer ↗]
            </a>
          </div>
        </nav>
      </header>

      <main className="flex-1 px-6 max-w-2xl">
        <h1 className="text-3xl mb-2">Glossary</h1>
        <p className="opacity-55 text-sm mb-10">
          A reference for all the classifier tags used in parcel estimates.
        </p>

        {/* ── DESIRABILITY TIERS ───────────────────────────────────── */}
        <Section title="Desirability Tiers">
          <p className="text-sm opacity-50 mb-4">
            Every zone and biome are assigned a desirability tier based on how numerous they are in the collection and how avidly they are sought after by collectors. Usually, the rarer a trait the more highly it is valued.
          </p>
          <GlossaryRow
            badge={<CategoryBadge label="Mythical" color={CATEGORY_COLORS.Mythical} />}
            description="The most coveted zones and biomes in the collection. Parcels carrying a Mythical trait command large premiums, and are extremely hard to acquire."
          />
          <GlossaryRow
            badge={<CategoryBadge label="Rare" color={CATEGORY_COLORS.Rare} />}
            description="High-demand zones and biomes that are not only hard to acquire, but have strong collector appeal."
          />
          <GlossaryRow
            badge={<CategoryBadge label="Premium" color={CATEGORY_COLORS.Premium} />}
            description="Desirable traits that carry a premium. Noticeably above average, but more accessible than Rare parcels."
          />
          <GlossaryRow
            badge={<CategoryBadge label="Uncommon" color={CATEGORY_COLORS['Uncommon']} />}
            description="Slightly above-average traits that create a modest increase in value."
          />
          <GlossaryRow
            badge={<CategoryBadge label="Floor" color="rgba(232,232,232,0.4)" />}
            description="The most common traits with no premium."
          />
        </Section>

        {/* ── SPECIAL PARCEL TYPES ─────────────────────────────────── */}
        <Section title="Special Parcel Types">
          <p className="text-sm opacity-50 mb-4">
            Special parcels have rare properties that override or supplement the standard zone/biome/level valuation formula. Most are priced as a direct multiple of the collection floor.
          </p>
          <GlossaryRow
            badge={<SpecialBadge type="Godmode" />}
            description="Origin Daydream (or potentially Origin Terraform) parcels that are not only X-Seed, but are in the highest possible range for seed values, which is between 9970 and 9999."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Origin Daydream" />}
            description="Parcels that were specially minted by certain contributors and community members when the Terraforms collection launched in 2021. As each parcel going from terrain into daydream mode incrementally delays (and eventually averts) the self-destruction of Hypercastle, these Origin Daydream parcels also seeded the initial window of time before the Hypercastle would begin to decay."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Origin Terraform" />}
            description="An Origin Daydream parcel that has had a drawing committed to it onchain, changing it into a Terraform."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Plague" />}
            description="Tokens with the Plague chroma — the rarest chroma type, and still shrouded in mystery. We do not yet know how they could possibly interact with the rest of the Hypercastle, or if they have some other function. Easily identified by their animation style and warped zone colour palettes."
          />
          <GlossaryRow
            badge={<SpecialBadge type="X-Seed" />}
            description="Parcels containing the X-Seed resource, a scarce on-chain artifact buried in 48 parcels throughout the collection. Priced at 12.5x floor."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Y-Seed" />}
            description="Parcels containing the Y-Seed resource, one of the rarest items embedded in Terraforms terrain. Only 17 exist in the collection. Priced at 14x floor."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Lith0" />}
            description="Parcels bearing the Lith0 resource — a rare crystalline material found in only 13 locations across the entire map. Priced at 15x floor."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Spine" />}
            description="Tokens bearing the Spine resource — an unusual structural artifact found in 68 parcels. Uses the standard zone/biome formula with an additional 1.2x premium on top."
          />
          <GlossaryRow
            badge={<SpecialBadge type="1of1" />}
            description="Parcels with a unique combination of zone and biome found nowhere else in the collection. Adds a 1.05x premium on top of the standard formula."
          />
        </Section>

        {/* ── MISC TRAITS ──────────────────────────────────────────── */}
        <Section title="Notable Traits">
          <p className="text-sm opacity-50 mb-4">
            Additional characteristics that appear on certain parcels, surfaced for context
            alongside the main estimate.
          </p>
          <GlossaryRow
            badge={<SpecialBadge type="S0" />}
            description="Parcels upgraded to V2 with the Antenna trait enabled during Season 0 — the first and only upgrade window in Terraforms history. Marks early participants in the on-chain upgrade system. Adds a 1.05x premium."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Biome0" />}
            description="Parcels situated in Biome 0, the rarest biome in the collection. Already priced at the Mythical tier (4x), this badge highlights the trait visually in the breakdown."
          />
          <GlossaryRow
            badge={<SpecialBadge type="BigGrass" />}
            description="Parcels in Biome 42, characterised by a distinctive lush, large-form grass terrain. A visually recognisable biome with a dedicated collector following."
          />
          <GlossaryRow
            badge={<SpecialBadge type="LittleGrass" />}
            description="Parcels in Biome 65, a variant of the grass biome with a more delicate, fine-grained visual character. The quieter sibling to Big Grass."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Penthouse" />}
            description="Level 20 parcels — the highest level achievable in the collection. Sitting at the very top of the terrain stack, these are among the rarest level designations."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Basement" />}
            description="Level 1 parcels — the lowest possible level, sitting at the foundation of the terrain. The ground floor of the Terraforms world."
          />
        </Section>

        {/* ── CHROMA ───────────────────────────────────────────────── */}
        <Section title="Chroma">
          <p className="text-sm opacity-50 mb-4">
            Chroma controls the colour animation style of a parcel. Most parcels are Flow by default;
            Pulse and Hyper carry a small premium, and Plague is treated as a separate special type.
          </p>
          <GlossaryRow
            badge={<PlainBadge label="Flow" />}
            description="The standard chroma. A smooth, continuous colour animation that forms the visual baseline for the collection. No multiplier applied (1x)."
          />
          <GlossaryRow
            badge={<PlainBadge label="Pulse" />}
            description="An animated chroma with a rhythmic, pulsing colour cycle. Less common than Flow and carries a 1.05x multiplier."
          />
          <GlossaryRow
            badge={<PlainBadge label="Hyper" />}
            description="An intensified chroma with heightened visual energy and faster colour cycling. Equally rare to Pulse and also carries a 1.05x multiplier."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Plague" />}
            description="The rarest chroma — a corrupted, mutated colour variant. So distinctive it's treated as a full special parcel type rather than a simple multiplier. See Special Parcel Types above."
          />
        </Section>

        {/* ── MODE ─────────────────────────────────────────────────── */}
        <Section title="Mode">
          <p className="text-sm opacity-50 mb-4">
            Mode defines the terrain's visual rendering state. Origin modes are the rarest;
            Daydream and Terraform are slight discounts from the standard Terrain baseline.
          </p>
          <GlossaryRow
            badge={<PlainBadge label="Terrain" />}
            description="The default mode. A fully rendered, structured terrain view — the standard visual state for most parcels. No multiplier adjustment (1x)."
          />
          <GlossaryRow
            badge={<PlainBadge label="Daydream" />}
            description="A softened, dreamlike rendering of the terrain with a fluid, animated quality. Slightly less common than Terrain but applies a mild discount (0.95x) in the model."
          />
          <GlossaryRow
            badge={<PlainBadge label="Terraform" />}
            description="An active, structural rendering showing the terrain mid-transformation. Also carries a 0.95x multiplier in the pricing model."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Origin Daydream" />}
            description="See Special Parcel Types above. The rarest mode designation — applies a 4x multiplier."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Origin Terraform" />}
            description="See Special Parcel Types above. Equally rare to Origin Daydream — applies a 4x multiplier."
          />
        </Section>
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

function Section({ title, children }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg mb-1 opacity-80">{title}</h2>
      <div className="mb-4" style={{ borderBottom: '1px solid rgba(232,232,232,0.1)' }} />
      {children}
    </section>
  );
}

function GlossaryRow({ badge, title, description }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        {badge}
        {title && <p className="text-sm font-medium">{title}</p>}
      </div>
      <p className="text-sm opacity-50 leading-relaxed">{description}</p>
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

function SpecialBadge({ type }) {
  const config = SPECIAL_TYPE_BADGES[type];
  if (!config) return null;
  return (
    <span className="text-xs px-1" style={{ color: config.color, border: `1px solid ${config.color}`, opacity: 0.85 }}>
      {config.label}
    </span>
  );
}

function PlainBadge({ label }) {
  return (
    <span className="text-xs px-1 opacity-50" style={{ border: '1px solid rgba(232,232,232,0.4)' }}>
      {label.toLowerCase()}
    </span>
  );
}
