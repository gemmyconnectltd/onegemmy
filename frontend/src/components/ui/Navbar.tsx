"use client";

import { useState } from "react";
import { Logo } from "./Logo";

interface NavbarProps {
  showAuth?: boolean;
}

export function Navbar({ showAuth = true }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Logo size="md" />

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-gray-600 hover:text-[#0070C0] transition-colors"
            >
              Features
            </a>
            <a
              href="#modules"
              className="text-gray-600 hover:text-[#0070C0] transition-colors"
            >
              Modules
            </a>
            <a
              href="#pricing"
              className="text-gray-600 hover:text-[#0070C0] transition-colors"
            >
              Pricing
            </a>
            <a
              href="#about"
              className="text-gray-600 hover:text-[#0070C0] transition-colors"
            >
              About
            </a>
          </div>

          {showAuth && (
            <div className="flex items-center gap-4">
              <a
                href="/login"
                className="text-gray-600 hover:text-[#0070C0] transition-colors font-medium"
              >
                Sign In
              </a>
              <a
                href="/register"
                className="bg-[#0070C0] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#005A9E] transition-colors"
              >
                Get Started
              </a>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-4 py-4 space-y-3">
            <a
              href="#features"
              className="block text-gray-600 hover:text-[#0070C0] transition-colors"
            >
              Features
            </a>
            <a
              href="#modules"
              className="block text-gray-600 hover:text-[#0070C0] transition-colors"
            >
              Modules
            </a>
            <a
              href="#pricing"
              className="block text-gray-600 hover:text-[#0070C0] transition-colors"
            >
              Pricing
            </a>
            <a
              href="#about"
              className="block text-gray-600 hover:text-[#0070C0] transition-colors"
            >
              About
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
