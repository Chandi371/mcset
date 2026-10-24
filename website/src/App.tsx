import React from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { LiveAppPreview } from './components/LiveAppPreview';
import { FeatureGrid } from './components/FeatureGrid';
import { EngineShowcase } from './components/EngineShowcase';
import { ZeroPortForwarding } from './components/ZeroPortForwarding';
import { AIAssistantSection } from './components/AIAssistantSection';
import { DownloadSection } from './components/DownloadSection';
import { FAQSection } from './components/FAQSection';
import { Footer } from './components/Footer';

export const App: React.FC = () => {
  const scrollToDownload = () => {
    const el = document.getElementById('download');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 bg-grid-pattern selection:bg-emerald-500 selection:text-white relative">
      <Navbar onDownloadClick={scrollToDownload} />
      <main>
        <Hero />
        <LiveAppPreview />
        <FeatureGrid />
        <EngineShowcase />
        <ZeroPortForwarding />
        <AIAssistantSection />
        <DownloadSection />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
};

export default App;
