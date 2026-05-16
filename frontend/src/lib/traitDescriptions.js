// Trait descriptions shared between the glossary page and the /traits/[type]
// detail page. Keyed by the slug used in /traits routes. Values are React
// nodes so entries can include links (e.g. Spine).

export const TRAIT_DESCRIPTIONS = {
  'godmode': 'Origin Daydream (or potentially Origin Terraform) parcels that are not only X-Seed, but are in the highest possible range for seed values, which is between 9970 and 9999. Godmode parcels have a unique animation style that cycles through the entire possible character set, in the daydream format.',
  'origin-daydream': 'Parcels that were specially minted by certain contributors and community members when the Terraforms collection launched in 2021. As each parcel going from terrain into daydream mode incrementally delays (and eventually averts) the self-destruction of Hypercastle, these Origin Daydream parcels also set the initial window of time before the Hypercastle would begin to decay.',
  'origin-terraform': 'An Origin Daydream parcel that has had a drawing committed to it onchain, changing it into a Terraform. Like standard terraform mode parcels, this can be reverted.',
  'plague': 'Tokens with the Plague chroma — the rarest chroma type, and still a mystery. We do not yet know how they could possibly interact with the rest of the Hypercastle, or if they have some other function. Easily identified by their animation style and warped zone colour palettes.',
  'x-seed': 'Parcels that animate through the full onchain character set instead of a specific biome’s. Applies to Origin Daydream parcels with Seed > 9000 and Terrain parcels with Seed > 9970.',
  'y-seed': 'Parcels that animate with 1 of 3 possible additional character sets instead of a specific biome’s. Applies to parcels with Seed > 9950 and ≤ 9970.',
  'lith0': 'Parcels with an animation style evocative of lithography. This is created by the intersection of biome 0 and duotone, non-alternating, zone colour palettes.',
  'spine': (
    <>
      These parcels form the central axis up and down the Hypercastle&apos;s 20 levels, with 4 parcels to each level. They have also been used to host a collection of artwork uploaded by the Mathcastles community — learn more at{' '}
      <a href="https://terrafans.xyz/spine/index.php" target="_blank" rel="noopener noreferrer" style={{ opacity: 1 }}>
        terrafans.xyz/spine
      </a>.
    </>
  ),
  '1of1': 'Parcels with a unique zone and biome combination. The site draws from both the unminted and minted parcels to determine this trait, so there may be differences between what is shown here as "1 of 1" and other resources such as terraformexplorer. These differences will resolve when the remaining parcels are minted.',
  's0': 'Stands for "Season 0". These are parcels that upgraded to the V2 contract and turned the Antenna function on between December 24th 2023, and January 13th 2024. Season 0 parcels may be able to capture special broadcasts in future.',
  'biome0': 'Biome 0 parcels are sought after by collectors for their unique animation style which is completely filled out, leaving no gaps like other biomes do.',
  'lith0like': 'A Lith0 look-alike. In order to have this trait the opening frame of a parcel’s animation cycle must be a flat, single block of colour.',
  'mesa': 'Biome 39 parcels in terrain mode with a ??? value under 30,000. This is the only biome in the collection with gaps in the character set, and when combined with a low ??? value produces a heightmap topographically reminiscent of mesa rock formations.',
  'matrix': 'Terrain mode parcels with the Intro Forest zone colour palette and Biome 58 character set. Digital rain in the Hypercastle.',
  'big-grass': 'Terrain mode parcels with the biome 42 character set. The distinctive Tibetan script characters create an illusion of grass being blown in the wind.',
  'little-grass': 'Terrain mode parcels with the biome 65 character set. Using the same Tibetan script character as biome 42, but with smaller size, this is the understated sibling to Big Grass parcels.',
  'heartbeat': 'Terrain mode parcels with the [BLOOD] zone and a Pulse chroma. The beating heart of the Hypercastle.',
  'gm': 'Terrain mode parcels with a low ??? value and Biome 71 character set. Parcels with this trait print a clean "gm" in the heightmap animation.',
  'basement': 'Parcels on level 1, the bottom of the Hypercastle.',
  'penthouse': 'Parcels on level 20, the top of the Hypercastle.',
};
