"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, KeyRound, Building2, Shield } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Field, Input, FormFooter } from "@/components/ui/Form";
import { Drawer } from "@/components/ui/Drawer";
import { ProfileDetails, UserAvatar, StatusPill, roleBadgeClass } from "@/components/users/ProfileDetails";
import { useAppConfig } from "@/lib/appConfig";
import { useMyProfile, useCurrentTenant, useUpdateMyProfile } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth";

export default function MyProfilePage() {
  const { brandColor } = useAppConfig();
  const { user: authUser } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useMyProfile();
  const { data: tenant } = useCurrentTenant();
  const updateProfile = useUpdateMyProfile();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <PageLoader variant="page" />;

  if (isError || !profile) {
    return (
      <div className="space-y-6">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">My Profile</h1>
        <div className="bg-card border border-border rounded-xl py-12 px-6 text-center space-y-3">
          <p className="text-sm font-semibold text-foreground">Could not load your profile</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg border border-border bg-surface text-sm font-semibold text-foreground hover:bg-surface/70"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const openEdit = () => {
    setForm({ full_name: profile.full_name, phone: profile.phone ?? "" });
    setError(null);
    setEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError("Name is required");
      return;
    }
    try {
      await updateProfile.mutateAsync({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
      });
      setEditing(false);
    } catch (err) {
      setError((err as { detail?: string })?.detail ?? "Could not save your changes");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">My Profile</h1>
        <p className="text-sm text-muted mt-0.5">
          The company and account you are signed in with.
        </p>
      </div>

      {/* Identity header — answers "which business am I in?" at a glance */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          <UserAvatar name={profile.full_name} color={brandColor} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-bold text-foreground truncate">{profile.full_name}</h2>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${roleBadgeClass(profile.role)}`}>
                {profile.role}
              </span>
              <StatusPill isActive={profile.is_active} />
            </div>
            <p className="text-[13px] text-muted truncate mt-0.5">{profile.email}</p>
            {profile.tenant_name && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold text-accent truncate">
                <Building2 size={14} className="flex-shrink-0" />
                {profile.tenant_name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={openEdit}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-surface text-[12px] font-semibold text-muted hover:text-accent hover:bg-accent/10 transition-colors flex-shrink-0"
          >
            <Pencil size={13} /> Edit
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-foreground mb-3">Account Information</h2>
        <ProfileDetails user={profile} businessPhone={tenant?.phone} />
      </div>

      {/* Self-service actions that aren't simple field edits */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-foreground">Security</h2>
        <Link
          href="/settings/security"
          className="flex items-center gap-3.5 bg-card border border-border rounded-xl p-4 hover:border-foreground/20 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
            <KeyRound size={16} style={{ color: brandColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">Change password</p>
            <p className="text-[12px] text-muted">Update the password you use to sign in.</p>
          </div>
          <Shield size={15} className="text-muted flex-shrink-0" />
        </Link>
      </div>

      <p className="text-[11px] text-muted/70 leading-relaxed">
        Email address and role are managed by your company administrator. Contact them if either
        needs to change{authUser?.isSuperuser ? " (you are a platform superuser)" : ""}.
      </p>

      <Drawer
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit Profile"
        description="Update your name and phone number"
        size="md"
      >
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <Field label="Full Name" required>
            <Input
              autoFocus
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="e.g. John Doe"
            />
          </Field>
          <Field
            label="Phone Number"
            hint="Your personal number. Leave blank to fall back to the company main line."
          >
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. +233 20 123 4567"
            />
          </Field>
          <Field label="Email Address" hint="Managed by your company administrator.">
            <Input value={profile.email} disabled />
          </Field>
          {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
          <FormFooter
            submitLabel="Save Changes"
            onCancel={() => setEditing(false)}
            disabled={!form.full_name.trim() || updateProfile.isPending}
          />
        </form>
      </Drawer>
    </div>
  );
}
