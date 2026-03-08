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
            Special parcels have rare properties that override or supplement the standard zone/biome/level valuation formula. Most are priced as a multiple of the collection floor.
          </p>
          <GlossaryRow
            badge={<SpecialBadge type="Godmode" />}
            description="Origin Daydream (or potentially Origin Terraform) parcels that are not only X-Seed, but are in the highest possible range for seed values, which is between 9970 and 9999. Godmode parcels have a unique animation style that cycles through the entire possible character set, in the daydream format."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Origin Daydream" />}
            description="Parcels that were specially minted by certain contributors and community members when the Terraforms collection launched in 2021. As each parcel going from terrain into daydream mode incrementally delays (and eventually averts) the self-destruction of Hypercastle, these Origin Daydream parcels also set the initial window of time before the Hypercastle would begin to decay."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Origin Terraform" />}
            description="An Origin Daydream parcel that has had a drawing committed to it onchain, changing it into a Terraform. Like standard terraform mode parcels, this can be reverted."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Plague" />}
            description="Tokens with the Plague chroma — the rarest chroma type, and still a mystery. We do not yet know how they could possibly interact with the rest of the Hypercastle, or if they have some other function. Easily identified by their animation style and warped zone colour palettes."
          />
          <GlossaryRow
            badge={<SpecialBadge type="X-Seed" />}
            description="Parcels that animate through the full onchain character set instead of a specific biome's. Applies to Origin Daydream parcels with Seed > 9000 and Terrain parcels with Seed > 9970."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Y-Seed" />}
            description="Parcels that animate with 1 of 3 possible additional character sets instead of a specific biome's. Applies to parcels with Seed > 9950 and ≤ 9970."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Lith0" />}
            description="Parcels with an animation style evocative of lithograph printing. This is created by the intersection of biome 0 and certain duotone zone colour palettes in a parcel."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Spine" />}
            description={<>These parcels form the central axis up and down the Hypercastle&apos;s 20 levels, with 4 parcels to each level. They have also been used to host a collection of artwork uploaded by the Mathcastles community — learn more at <a href="https://terrafans.xyz/spine/index.php" target="_blank" rel="noopener noreferrer" style={{opacity:1}}>terrafans.xyz/spine</a>.</>}
          />
          <GlossaryRow
            badge={<SpecialBadge type="1of1" />}
            description="Parcels with a unique zone and biome combination. It is worth noting that parcels in this category will change when the remaining 1,193 are minted."
          />
        </Section>

        {/* ── MISC TRAITS ──────────────────────────────────────────── */}
        <Section title="Notable Traits">
          <p className="text-sm opacity-50 mb-4">
            Additional properties that appear on certain parcels that collectors pay attention to.
          </p>
          <GlossaryRow
            badge={<SpecialBadge type="S0" />}
            description="Stands for &quot;Season 0&quot;. These are parcels that upgraded to the V2 contract and turned the Antenna function on within a certain time window. Season 0 parcels may be able to capture special broadcasts in future."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Biome0" />}
            description="Biome 0 parcels are sought after by collectors for their unique animation style which is completely filled out, leaving no gaps like other biomes do."
          />
          <GlossaryRow
            badge={<SpecialBadge type="BigGrass" />}
            description="Parcels with the biome 42 character set. The distinctive Tibetan script characters create an illusion of grass being blown in the wind."
          />
          <GlossaryRow
            badge={<SpecialBadge type="LittleGrass" />}
            description="Parcels with the biome 65 character set. Using the same Tibetan script character as biome 42, but with smaller size, this is the understated sibling to Big Grass parcels."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Penthouse" />}
            description="Parcels on level 20, the top of the Hypercastle."
          />
          <GlossaryRow
            badge={<SpecialBadge type="Basement" />}
            description="Parcels on level 1, the bottom of the Hypercastle."
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
