"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Logo size="sm" />

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-foreground/60 hover:text-foreground transition-colors font-medium text-sm">
              Features
            </a>
            <a href="#modules" className="text-foreground/60 hover:text-foreground transition-colors font-medium text-sm">
              Modules
            </a>
            <a href="#pricing" className="text-foreground/60 hover:text-foreground transition-colors font-medium text-sm">
              Pricing
            </a>
            <a href="/login" className="text-foreground/60 hover:text-foreground transition-colors font-medium text-sm">
              Sign In
            </a>
            <a
              href="/register"
              className="bg-primary text-white px-5 py-2.5 font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Get Started
            </a>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden text-foreground">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-border px-4 pb-4">
          <a href="#features" className="block text-foreground/60 hover:text-foreground transition-colors font-medium py-3 border-b border-border">
            Features
          </a>
          <a href="#modules" className="block text-foreground/60 hover:text-foreground transition-colors font-medium py-3 border-b border-border">
            Modules
          </a>
          <a href="#pricing" className="block text-foreground/60 hover:text-foreground transition-colors font-medium py-3 border-b border-border">
            Pricing
          </a>
          <a href="/login" className="block text-foreground/60 hover:text-foreground transition-colors font-medium py-3 border-b border-border">
            Sign In
          </a>
          <a
            href="/register"
            className="block bg-primary text-white px-5 py-2.5 font-medium text-center mt-3 hover:opacity-90 transition-opacity"
          >
            Get Started
          </a>
        </div>
      )}
    </nav>
  );
}
