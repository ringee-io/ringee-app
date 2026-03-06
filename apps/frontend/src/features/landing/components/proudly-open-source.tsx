'use client';

import { Github, Star } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@ringee/frontend-shared/lib/utils';
import React, { useEffect, useState } from 'react';

interface ProudlyOpenSourceProps {
  className?: string;
  repoUrl?: string;
}

export const ProudlyOpenSource = ({
  className,
  repoUrl = 'https://github.com/ringee-io/ringee-app',
}: ProudlyOpenSourceProps) => {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    // Extract owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return;
    
    const [, owner, repo] = match;
    
    fetch(`https://api.github.com/repos/${owner}/${repo}`)
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.stargazers_count === 'number') {
          setStars(data.stargazers_count);
        }
      })
      .catch(console.error);
  }, [repoUrl]);

  return (
    <Link
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group relative inline-flex items-center justify-center gap-3 rounded-full border border-border/50 bg-background/50 px-4 py-1.5 text-sm font-medium shadow-sm backdrop-blur-md transition-all hover:bg-muted/50 hover:shadow-md cursor-pointer',
        className
      )}
    >
      <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 blur-xl transition-all group-hover:from-emerald-500/20 group-hover:via-teal-500/20 group-hover:to-cyan-500/20" />
      
      <div className="flex items-center gap-2">
        <Github className="h-4 w-4 transition-transform group-hover:scale-110" />
        <span className="bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text font-bold text-transparent dark:from-emerald-400 dark:to-cyan-400">
          Proudly Open Source
        </span>
      </div>

      <div className="h-4 w-[1px] bg-border" />

      <div className="flex items-center gap-1.5 text-muted-foreground transition-colors group-hover:text-foreground">
        <Star className={cn("h-3.5 w-3.5 transition-colors", stars !== null ? "fill-yellow-400 text-yellow-400" : "fill-none group-hover:fill-yellow-400 group-hover:text-yellow-400")} />
        <span className="font-medium">
          {stars !== null ? `${stars.toLocaleString()} stars` : 'Star us on GitHub'}
        </span>
      </div>
    </Link>
  );
};
