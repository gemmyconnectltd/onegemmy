import { User, Bell, Shield, Palette, Building2 } from "lucide-react";

const settingsSections = [
  { name: "Profile", description: "Manage your account settings", icon: User, active: true },
  { name: "Company", description: "Business information and branding", icon: Building2, active: false },
  { name: "Notifications", description: "Email and push notification preferences", icon: Bell, active: false },
  { name: "Security", description: "Password, 2FA, and access controls", icon: Shield, active: false },
  { name: "Appearance", description: "Theme, colors, and display settings", icon: Palette, active: false },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your account and application preferences</p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="bg-white border border-border">
          <nav className="p-2">
            {settingsSections.map((section) => (
              <button
                key={section.name}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                  section.active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/60 hover:bg-surface"
                }`}
              >
                <section.icon size={18} />
                <div>
                  <p className="font-medium">{section.name}</p>
                  <p className="text-xs text-muted">{section.description}</p>
                </div>
              </button>
            ))}
          </nav>
        </div>

        <div className="lg:col-span-3 bg-white border border-border p-6">
          <h2 className="text-lg font-bold text-foreground mb-6">Profile Settings</h2>
          <div className="space-y-5 max-w-xl">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-primary/15 flex items-center justify-center text-xl font-bold text-primary">
                JD
              </div>
              <button className="text-sm font-medium text-primary hover:underline">Change avatar</button>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
              <input
                type="text"
                defaultValue="John Doe"
                className="w-full px-3 py-2.5 border border-border text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                defaultValue="john@gemmyconnect.com"
                className="w-full px-3 py-2.5 border border-border text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Role</label>
              <input
                type="text"
                defaultValue="Admin"
                disabled
                className="w-full px-3 py-2.5 border border-border text-sm text-muted bg-surface"
              />
            </div>
            <button className="bg-accent text-white px-5 py-2.5 text-sm font-medium hover:bg-accent/90 transition-colors">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
