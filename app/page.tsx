import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-background text-foreground overflow-hidden relative">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="text-center z-10 max-w-2xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-card-border text-muted-foreground text-xs font-medium mb-6 shadow-xl">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          Next-Gen AI Outreach
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500">
          Fretbox Outreach <span className="text-indigo-400">AI</span>
        </h1>
        
        <p className="text-muted-foreground text-lg md:text-xl mb-10 leading-relaxed max-w-xl mx-auto">
          Automate your university outreach with intelligent insights, automated enrichment, and data-driven engagement.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="group relative inline-flex items-center justify-center bg-white text-black font-semibold px-8 py-3.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)] overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              Launch Dashboard
              <ArrowRightIcon className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
          
          <Link
            href="https://github.com/ecryptoguru/OnboardingAI2"
            target="_blank"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full border border-card-border text-foreground font-medium hover:bg-card transition-colors"
          >
            View Documentation
          </Link>
        </div>

        <div className="mt-16 pt-16 border-t border-card-border flex flex-wrap justify-center gap-8 md:gap-16 opacity-40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-muted" />
            <span className="font-bold tracking-widest text-xs uppercase">CONVEX</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-muted" />
            <span className="font-bold tracking-widest text-xs uppercase">NEXT.JS</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-muted" />
            <span className="font-bold tracking-widest text-xs uppercase">CLAUDE 3</span>
          </div>
        </div>
      </div>
      
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />
    </main>
  );
}
