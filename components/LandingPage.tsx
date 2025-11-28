import React from 'react';

interface LandingPageProps {
  onEnter: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  return (
    <div className="relative z-10 flex flex-col w-full">

      {/* HERO SECTION */}
      <section className="min-h-screen flex flex-col items-center justify-center p-6 relative border-b-4 border-deep-black">
        <div className="max-w-6xl w-full pt-16 md:pt-0">
          <div className="border-l-8 border-deep-black pl-4 md:pl-8 mb-8 bg-white/50 backdrop-blur-sm p-4 inline-block">
            {/* Scaled down typography for md screens */}
            <h1 className="font-display text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-none text-deep-black">
              LINERA<br /><span className="text-linera-red">FLOW</span>
            </h1>
          </div>
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <p className="font-mono text-base md:text-lg lg:text-xl max-w-xl bg-paper-white border-4 border-deep-black p-4 md:p-6 shadow-hard">
              The decentralized support system for the creator economy.
              <br /><br />
              <span className="font-bold">/// STATUS:</span> LIVE<br />
              <span className="font-bold">/// LATENCY:</span> 0ms
            </p>
            <button
              onClick={onEnter}
              className="w-full md:w-auto bg-deep-black text-white font-display text-2xl md:text-3xl lg:text-4xl px-8 md:px-12 py-4 md:py-6 uppercase tracking-widest hover:bg-linera-red transition-colors shadow-[8px_8px_0px_0px_#FF4438] md:shadow-[12px_12px_0px_0px_#FF4438] hover:translate-x-2 hover:translate-y-2 hover:shadow-none border-4 border-transparent shrink-0"
            >
              Enter App
            </button>
          </div>
        </div>
        <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 font-mono text-[10px] md:text-xs opacity-70 bg-white p-2 border border-black hidden md:block">
          SYSTEM ARCHITECTURE: V1.0.4<br />
          ACTIVE AUTHORS: 4,231
        </div>
      </section>

      {/* TICKER */}
      <div className="bg-deep-black text-white overflow-hidden py-3 border-b-4 border-deep-black relative z-20">
        <div className="whitespace-nowrap animate-marquee font-mono font-bold text-sm md:text-xl">
           // LIVE DONATION DATA // BLOCK HEIGHT: 891,221 // GAS PRICE: 0.0001 LIN // TOTAL VALUE LOCKED: $42,000,000 // NEXT EPOCH: 12M // NEW BLOCK VERIFIED: 0x991...AA // CREATOR SUPPORT: +12% //
        </div>
      </div>

      {/* FEATURES GRID */}
      {/* Changed to 2 columns on md, 3 on lg to prevent squeezing */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-b-4 border-deep-black bg-paper-white relative z-20">
        <FeatureCard
          title="Micro-Chains"
          desc="Every user is a chain. Infinite scalability through parallel execution. No bottlenecks. Your wallet is your server."
          number="01"
          icon="⛓"
        />
        <FeatureCard
          title="Instant Finality"
          desc="Interactions happen at the speed of thought. Donate, mint, and vote with 0ms latency confirmation."
          number="02"
          icon="⚡"
        />
        <FeatureCard
          title="Sovereignty"
          desc="You own the state. Your data, your assets, your rules. The network just syncs it. No platform risk."
          number="03"
          icon="🛡"
        />
      </section>

      {/* MANIFESTO SECTION */}
      <section className="p-8 md:p-24 lg:p-32 bg-linera-red text-white border-b-4 border-deep-black relative z-20 overflow-hidden">
        {/* Decorative Background Text */}
        <div className="absolute -right-10 md:-right-20 -top-10 md:-top-20 text-deep-black opacity-10 font-display text-[8rem] md:text-[15rem] lg:text-[20rem] leading-none pointer-events-none select-none">
          WEB3
        </div>

        <div className="relative z-10 max-w-4xl">
          <h2 className="font-display text-4xl md:text-6xl lg:text-7xl uppercase leading-tight mb-8 md:mb-12">
            "The medium is the message, but the support is the law."
          </h2>
          <div className="font-mono text-base md:text-lg lg:text-xl space-y-4 md:space-y-8 border-l-4 border-deep-black pl-4 md:pl-8">
            <p>
              We are dismantling the rent-seeking platforms of Web2. LineraFlow is not a company; it is a hyper-structure designed to sustain the next century of digital creativity.
            </p>
            <p>
              By utilizing the Linera network, we assign a dedicated microchain to every creator and every supporter. This means no congestion, low fees, and infinite horizontal scaling.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-deep-black text-white p-8 md:p-16 lg:p-24 relative z-20 pb-24 lg:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          <div className="col-span-1 md:col-span-2">
            <h3 className="font-display text-3xl md:text-4xl text-linera-red mb-4">LINERA FLOW</h3>
            <p className="font-mono text-sm text-gray-400 max-w-xs">
              Decentralized Creator Economy Platform.
              <br />Built on Linera.
            </p>
          </div>
          <div>
            <h4 className="font-mono font-bold border-b border-gray-700 pb-2 mb-4">PLATFORM</h4>
            <ul className="font-mono text-sm space-y-2 text-gray-400">
              <li className="hover:text-white cursor-pointer">{'->'} Documentation</li>
              <li className="hover:text-white cursor-pointer">{'->'} Whitepaper</li>
              <li className="hover:text-white cursor-pointer">{'->'} GitHub</li>
              <li className="hover:text-white cursor-pointer">{'->'} Status</li>
            </ul>
          </div>
          <div>
            <h4 className="font-mono font-bold border-b border-gray-700 pb-2 mb-4">SOCIAL</h4>
            <ul className="font-mono text-sm space-y-2 text-gray-400">
              <li className="hover:text-white cursor-pointer">{'->'} Twitter / X</li>
              <li className="hover:text-white cursor-pointer">{'->'} Farcaster</li>
              <li className="hover:text-white cursor-pointer">{'->'} Discord</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 md:mt-24 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center font-mono text-xs text-gray-600 gap-4">
          <p>© 2024 LINERA FLOW FOUNDATION</p>
          <p>HASH: 88a1...ff29</p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ title, desc, number, icon }: { title: string, desc: string, number: string, icon: string }) => (
  <div className="p-8 md:p-10 lg:p-12 border-b-4 md:border-b-0 md:border-r-4 border-deep-black last:border-r-0 hover:bg-gray-50 transition-colors group flex flex-col h-full">
    <div className="flex justify-between items-start mb-6 md:mb-8">
      <span className="font-display text-5xl md:text-6xl lg:text-7xl text-gray-200 group-hover:text-linera-red transition-colors">{number}</span>
      <span className="text-3xl md:text-4xl grayscale group-hover:grayscale-0 transition-all">{icon}</span>
    </div>
    <h3 className="font-display text-2xl md:text-3xl uppercase mb-4">{title}</h3>
    <p className="font-mono text-sm text-gray-600 leading-relaxed mt-auto">{desc}</p>
  </div>
);

export default LandingPage;