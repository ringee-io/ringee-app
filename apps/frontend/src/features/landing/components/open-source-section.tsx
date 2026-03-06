'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Github, Star, Users, ShieldCheck, Code, TestTube, Cloud, ChevronRight, Fingerprint } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';

export default function OpenSourceSection() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://api.github.com/repos/ringee-co/ringee')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.stargazers_count === 'number') {
          setStars(data.stargazers_count);
        }
      })
      .catch(console.error);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <section className="relative py-16 sm:py-16 overflow-hidden border-t border-border/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-16">
        
        {/* Header Section */}
        <div className="mb-12 max-w-4xl">
          <motion.div 
            initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-500"
          >
            <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
            <span>Secure, open-source</span>
          </motion.div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl max-w-3xl leading-tight"
          >
            Proudly open source - host on your own infrastructure and own your data
          </motion.h2>
        </div>

        {/* Content Section */}
        <div className="grid gap-x-12 gap-y-12 lg:grid-cols-2 mt-8 sm:mt-12 items-stretch">
          
          {/* Left Column */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="flex flex-col relative z-10"
          >
            <h3 className="text-2xl font-bold text-foreground mb-3">Open-source, self-hosted</h3>
            <p className="text-base text-muted-foreground leading-relaxed max-w-md mb-8">
              Host Ringee on your own server. Own your customer data and stay fully compliant with regulatory standards.
            </p>

            <div className="mb-12">
              <div className="inline-block relative group">
                <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-amber-500 to-indigo-500 opacity-20 group-hover:opacity-40 blur transition duration-500"></div>
                <Link href="https://github.com/ringee-co/ringee" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="relative gap-2 rounded-lg pl-3 pr-4 shadow-sm h-10 text-sm font-medium transition-transform group-hover:scale-[1.02]">
                    <Github className="h-4 w-4" />
                    Find us on GitHub
                  </Button>
                </Link>
              </div>
            </div>

            <div className="flex items-start gap-10 sm:gap-14 mt-auto border-t border-border/40 pt-8">
              <div className="group space-y-2 cursor-default">
                <div className="flex items-center gap-2 text-muted-foreground transition-colors group-hover:text-amber-500">
                  <Star className="h-5 w-5" strokeWidth={2} />
                  <span className="text-xs font-medium uppercase tracking-wider">Stars on Github</span>
                </div>
                <div className="text-3xl font-bold tracking-tight group-hover:scale-105 origin-left transition-transform">
                  {stars !== null ? `${(stars / 1000).toFixed(1)}k` : '1.2k'}
                </div>
              </div>
              
              <div className="group space-y-2 cursor-default">
                <div className="flex items-center gap-2 text-muted-foreground transition-colors group-hover:text-blue-500">
                  <Users className="h-5 w-5" strokeWidth={2} />
                  <span className="text-xs font-medium uppercase tracking-wider">Contributors</span>
                </div>
                <div className="text-3xl font-bold tracking-tight group-hover:scale-105 origin-left transition-transform">
                  45+
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column */}
          <div className="relative flex flex-col pt-8 lg:pt-0 border-t lg:border-t-0 border-border/40">
            {/* The Blue Curved Line (Desktop Only) */}
            <div className="hidden lg:block absolute left-[-60px] top-6 bottom-0 w-[60px] pointer-events-none z-0">
              <svg 
                className="absolute inset-0 h-full w-full text-blue-400/50 dark:text-blue-500/40" 
                preserveAspectRatio="none"
                viewBox="0 0 100 400" 
                fill="none" 
              >
                <path d="M 0 400 C 60 380, 70 150, 100 0" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" className="animate-[dash_20s_linear_infinite]" vectorEffect="non-scaling-stroke" />
                <motion.circle 
                  cx="100" cy="0" r="4" 
                  fill="currentColor"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
              </svg>
            </div>

            <div className="flex flex-col h-full lg:pl-10 lg:border-l border-border/40 relative z-10">
              
              {/* Features Grid */}
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="grid grid-cols-2 border-b border-border/40"
              >
                <motion.div variants={itemVariants} className="group relative flex flex-col items-center justify-center p-6 sm:p-8 text-center border-r border-border/40 border-b border-border/40 overflow-hidden cursor-default">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <Fingerprint className="h-6 w-6 text-muted-foreground mb-3 group-hover:text-indigo-500 group-hover:-translate-y-1 transition-all duration-300" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">Secure<br/>personnel</span>
                </motion.div>
                
                <motion.div variants={itemVariants} className="group relative flex flex-col items-center justify-center p-6 sm:p-8 text-center border-b border-border/40 overflow-hidden cursor-default">
                  <div className="absolute inset-0 bg-gradient-to-sw from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <Code className="h-6 w-6 text-muted-foreground mb-3 group-hover:text-blue-500 group-hover:-translate-y-1 transition-all duration-300" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">Secure<br/>development</span>
                </motion.div>
                
                <motion.div variants={itemVariants} className="group relative flex flex-col items-center justify-center p-6 sm:p-8 text-center border-r border-border/40 overflow-hidden cursor-default">
                  <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <TestTube className="h-6 w-6 text-muted-foreground mb-3 group-hover:text-amber-500 group-hover:-translate-y-1 transition-all duration-300" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">Secure<br/>testing</span>
                </motion.div>
                
                <motion.div variants={itemVariants} className="group relative flex flex-col items-center justify-center p-6 sm:p-8 text-center overflow-hidden cursor-default">
                  <div className="absolute inset-0 bg-gradient-to-tl from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <Cloud className="h-6 w-6 text-muted-foreground mb-3 group-hover:text-emerald-500 group-hover:-translate-y-1 transition-all duration-300" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">Cloud<br/>security</span>
                </motion.div>
              </motion.div>

              {/* Compliance Text */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }}
                className="pt-8 pb-4 w-full"
              >
                <h4 className="flex items-center gap-2 text-2xl font-bold text-foreground mb-3 tracking-tight">
                  <ShieldCheck className="h-6 w-6 text-amber-500" />
                  Security aligned with SOC 2 standards
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-sm">
                  With strict protocols in place, you can trust us to protect your information with confidence.
                </p>
                <Button variant="ghost" className="group -ml-3 rounded-lg h-9 px-3 text-sm font-medium hover:bg-muted/50">
                  Read more
                  <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </Button>
              </motion.div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
