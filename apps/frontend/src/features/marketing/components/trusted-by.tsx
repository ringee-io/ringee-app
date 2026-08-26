// import Image from 'next/image';

// import { Container } from './primitives';

// type Company = {
//   name: string;
//   darkLogo: string;
//   whiteLogo: string;
//   width: number;
//   height: number;
// };

// const COMPANIES: Company[] = [
//   {
//     name: 'Addiuva',
//     darkLogo: '/trust-on-us/addiuva_black_transparent.png',
//     whiteLogo: '/trust-on-us/addiuva_white_transparent.png',
//     width: 2172,
//     height: 724
//   },
//   {
//     name: 'Digital Cambium',
//     darkLogo: '/trust-on-us/digital-cambium_black_transparent.png',
//     whiteLogo: '/trust-on-us/digital-cambium_white_transparent.png',
//     width: 2172,
//     height: 724
//   },
//   {
//     name: 'FraudOps',
//     darkLogo: '/trust-on-us/fraudops_black_transparent.png',
//     whiteLogo: '/trust-on-us/fraudops_white_transparent.png',
//     width: 2172,
//     height: 724
//   },
//   {
//     name: 'Gen Media Management',
//     darkLogo: '/trust-on-us/genmedia-management_black_transparent.png',
//     whiteLogo: '/trust-on-us/genmedia-management_white_transparent.png',
//     width: 1672,
//     height: 1941
//   },
//   {
//     name: 'HandelNine',
//     darkLogo: '/trust-on-us/handelnine_black_transparent.png',
//     whiteLogo: '/trust-on-us/handelnine_white_transparent.png',
//     width: 2172,
//     height: 724
//   },
//   {
//     name: 'Matcheando',
//     darkLogo: '/trust-on-us/matcheando_black_transparent.png',
//     whiteLogo: '/trust-on-us/matcheando_white_transparent.png',
//     width: 2172,
//     height: 724
//   },
//   {
//     name: 'Betuel Travel',
//     darkLogo: '/trust-on-us/betuel-travel_black_transparent.png',
//     whiteLogo: '/trust-on-us/betuel-travel_white_transparent.png',
//     width: 1672,
//     height: 520
//   },
//   {
//     name: 'Isle Cebu',
//     darkLogo: '/trust-on-us/islecebu_black_transparent.png',
//     whiteLogo: '/trust-on-us/islecebu_white_transparent.png',
//     width: 1672,
//     height: 1941
//   },
//   {
//     name: 'TravelM',
//     darkLogo: '/trust-on-us/travelm_black_transparent.png',
//     whiteLogo: '/trust-on-us/travelm_white_transparent.png',
//     width: 1672,
//     height: 1941
//   },
// ];

// function Logo({ company }: { company: Company }) {
//   const alt = `${company.name} logo`;

//   const imgClass =
//     'h-7 w-auto object-contain opacity-60 transition-opacity duration-300 hover:opacity-100 sm:h-7';

//   return (
//     <div className='flex shrink-0 items-center'>
//       <Image
//         src={company.darkLogo}
//         alt={alt}
//         width={company.width}
//         height={company.height}
//         sizes='160px'
//         className={`${imgClass} dark:hidden`}
//         priority={false}
//       />

//       <Image
//         src={company.whiteLogo}
//         alt={alt}
//         width={company.width}
//         height={company.height}
//         sizes='160px'
//         className={`${imgClass} hidden dark:block`}
//         priority={false}
//       />
//     </div>
//   );
// }

// function Track({ ariaHidden = false }: { ariaHidden?: boolean }) {
//   return (
//     <div className='marquee__track' aria-hidden={ariaHidden || undefined}>
//       {COMPANIES.map((company) => (
//         <Logo key={company.name} company={company} />
//       ))}
//     </div>
//   );
// }

// export function TrustedBy() {
//   return (
//     <section className='py-10 sm:py-12' aria-label='Companies using Ringee'>
//       <Container>
//         <p className='text-muted-foreground/80 mb-8 text-center text-xs font-medium tracking-[0.14em] uppercase'>
//           Trusted by teams already calling with Ringee
//         </p>
//       </Container>

//       <div className='marquee'>
//         <Track />
//         <Track ariaHidden />
//       </div>
//     </section>
//   );
// }

import Image from 'next/image';

import { Container } from './primitives';

type Company = {
  name: string;
  darkLogo: string;
  whiteLogo: string;
  width: number;
  height: number;
  displayHeight: number;
  slotWidth: number;
};

const COMPANIES: Company[] = [
  {
    name: 'Addiuva',
    darkLogo: '/trust-on-us/addiuva_black_transparent.png',
    whiteLogo: '/trust-on-us/addiuva_white_transparent.png',
    width: 542,
    height: 140,
    displayHeight: 34,
    slotWidth: 170
  },
  {
    name: 'Digital Cambium',
    darkLogo: '/trust-on-us/digital-cambium_black_transparent.png',
    whiteLogo: '/trust-on-us/digital-cambium_white_transparent.png',
    width: 1138,
    height: 372,
    displayHeight: 36,
    slotWidth: 185
  },
  {
    name: 'FraudOps',
    darkLogo: '/trust-on-us/fraudops_black_transparent.png',
    whiteLogo: '/trust-on-us/fraudops_white_transparent.png',
    width: 1455,
    height: 361,
    displayHeight: 32,
    slotWidth: 190
  },
  {
    name: 'Gen Media Management',
    darkLogo: '/trust-on-us/genmedia-management_black_transparent.png',
    whiteLogo: '/trust-on-us/genmedia-management_white_transparent.png',
    width: 977,
    height: 372,
    displayHeight: 38,
    slotWidth: 175
  },
  {
    name: 'HandelNine',
    darkLogo: '/trust-on-us/handelnine_black_transparent.png',
    whiteLogo: '/trust-on-us/handelnine_white_transparent.png',
    width: 861,
    height: 228,
    displayHeight: 33,
    slotWidth: 170
  },
  {
    name: 'Matcheando',
    darkLogo: '/trust-on-us/matcheando_black_transparent.png',
    whiteLogo: '/trust-on-us/matcheando_white_transparent.png',
    width: 2172,
    height: 724,
    displayHeight: 34,
    slotWidth: 175
  },
  // {
  //   name: 'Betuel Travel',
  //   darkLogo: '/trust-on-us/betuel-travel_black_transparent.png',
  //   whiteLogo: '/trust-on-us/betuel-travel_white_transparent.png',
  //   width: 448,
  //   height: 520,
  //   displayHeight: 52,
  //   slotWidth: 105
  // },
  {
    name: 'Isle Cebu',
    darkLogo: '/trust-on-us/islecebu_black_transparent.png',
    whiteLogo: '/trust-on-us/islecebu_white_transparent.png',
    width: 846,
    height: 60,
    displayHeight: 55,
    slotWidth: 170
  }
  // {
  //   name: 'TravelM',
  //   darkLogo: '/trust-on-us/travelm_black_transparent.png',
  //   whiteLogo: '/trust-on-us/travelm_white_transparent.png',
  //   width: 520,
  //   height: 520,
  //   displayHeight: 50,
  //   slotWidth: 105
  // }
];

function Logo({ company }: { company: Company }) {
  const alt = `${company.name} logo`;

  const imgClass =
    'w-auto object-contain opacity-60 transition-opacity duration-300 hover:opacity-100';

  return (
    <div
      className='flex h-16 shrink-0 items-center justify-center'
      style={{ width: company.slotWidth }}
    >
      <Image
        src={company.darkLogo}
        alt={alt}
        width={company.width}
        height={company.height}
        sizes={`${company.slotWidth}px`}
        className={`${imgClass} dark:hidden`}
        style={{
          height: company.displayHeight,
          maxWidth: company.slotWidth
        }}
        priority={false}
      />

      <Image
        src={company.whiteLogo}
        alt={alt}
        width={company.width}
        height={company.height}
        sizes={`${company.slotWidth}px`}
        className={`${imgClass} hidden dark:block`}
        style={{
          height: company.displayHeight,
          maxWidth: company.slotWidth
        }}
        priority={false}
      />
    </div>
  );
}

function Track({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div className='marquee__track' aria-hidden={ariaHidden || undefined}>
      {COMPANIES.map((company) => (
        <Logo key={company.name} company={company} />
      ))}
    </div>
  );
}

export function TrustedBy() {
  return (
    <section className='py-10 sm:py-12' aria-label='Companies using Ringee'>
      <Container>
        <p className='text-muted-foreground/80 mb-8 text-center text-xs font-medium tracking-[0.14em] uppercase'>
          Trusted by teams already calling with Ringee
        </p>
      </Container>

      <div className='marquee'>
        <Track />
        <Track ariaHidden />
      </div>
    </section>
  );
}
