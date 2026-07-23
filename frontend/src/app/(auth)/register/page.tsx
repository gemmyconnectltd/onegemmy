import Link from "next/link";
import { Layers } from "lucide-react";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-border p-8">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <div className="w-10 h-10 bg-foreground flex items-center justify-center">
              <Layers className="text-white" size={20} />
            </div>
            <div>
              <span className="text-xl font-bold block leading-none text-foreground">OneGemmy</span>
              <span className="text-[9px] text-muted font-medium tracking-wider uppercase">by Gemmy Connect</span>
            </div>
          </div>

          <h1 className="text-lg font-bold text-foreground text-center mb-1">Create your account</h1>
          <p className="text-sm text-muted text-center mb-6">Get started with OneGemmy</p>

          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">First Name</label>
                <input
                  type="text"
                  placeholder="John"
                  className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Last Name</label>
                <input
                  type="text"
                  placeholder="Doe"
                  className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Company Name</label>
              <input
                type="text"
                placeholder="Acme Corp"
                className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-3 py-2.5 border border-border text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-foreground/70">
              <input type="checkbox" className="accent-primary mt-0.5" />
              <span>I agree to the <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link></span>
            </label>
            <button
              type="submit"
              className="w-full bg-accent text-white py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Create Account
            </button>
          </form>

          <p className="text-sm text-muted text-center mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
