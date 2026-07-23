"use client";

import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { Logo } from "./Logo";

interface NavbarProps {
  showAuth?: boolean;
}

export function Navbar({ showAuth = true }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Logo size="md" />

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium text-sm"
            >
              Features
            </a>
            <a
              href="#modules"
              className="text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium text-sm"
            >
              Modules
            </a>
            <a
              href="#pricing"
              className="text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium text-sm"
            >
              Pricing
            </a>
            <a
              href="#about"
              className="text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium text-sm"
            >
              About
            </a>
          </div>

          {showAuth && (
            <div className="hidden md:flex items-center gap-4">
              <a
                href="/login"
                className="text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium text-sm"
              >
                Sign In
              </a>
              <a
                href="/register"
                className="bg-[#1E3A5F] text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-[#2D5A8E] transition-colors shadow-lg shadow-[#1E3A5F]/20"
              >
                Get Started
              </a>
            </div>
          )}

          <button
            type="button"
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white">
          <div className="px-4 py-4 space-y-3">
            <a
              href="#features"
              className="block text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium"
            >
              Features
            </a>
            <a
              href="#modules"
              className="block text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium"
            >
              Modules
            </a>
            <a
              href="#pricing"
              className="block text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium"
            >
              Pricing
            </a>
            <a
              href="#about"
              className="block text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium"
            >
              About
            </a>
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <a
                href="/login"
                className="block text-slate-600 hover:text-[#1E3A5F] transition-colors font-medium"
              >
                Sign In
              </a>
              <a
                href="/register"
                className="block bg-[#1E3A5F] text-white px-5 py-2.5 rounded-lg font-medium text-center hover:bg-[#2D5A8E] transition-colors"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
