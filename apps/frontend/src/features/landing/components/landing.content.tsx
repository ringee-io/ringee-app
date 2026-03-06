import Hero from './hero';
import Features from './features';
import Pricing from './pricing';
import Comparison from './comparision';
import FAQ from './faq';
import CTABanner from './cta-banner';
import Footer from './footer';
import { Navbar } from './navbar';
import VideoDemo from './video-demo';
import OpenSourceSection from './open-source-section';
import PromoBanner from './promo-banner';

export default function LandingContent() {
  return (
    <div id='landing'>
      <PromoBanner />
      <Navbar />
      <main>
        <Hero />
        <VideoDemo />
        <Features />
        <Pricing />
        <Comparison />
        <FAQ />
        <OpenSourceSection />
        <CTABanner />
        <Footer />
      </main>
    </div>
  );
}

