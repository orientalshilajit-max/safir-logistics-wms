"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/auth/auth-provider";
import {
  Button,
  ErrorBanner,
  Field,
  inputClassName,
  Panel,
} from "@/app/components/wms-ui";

const minimumPasswordLength = 8;

export function ChangePasswordForm() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    if (!user?.email) {
      setError("Unable to find your account email. Please sign in again.");
      return;
    }

    if (newPassword.length < minimumPasswordLength) {
      setError(`New password must be at least ${minimumPasswordLength} characters.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      setError("Current password is incorrect.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
    }

    setSaving(false);
  }

  return (
    <Panel title="My Account">
      <form className="max-w-xl space-y-4" onSubmit={(event) => void changePassword(event)}>
        <ErrorBanner message={error} />
        {message ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </div>
        ) : null}
        <Field label="Current password">
          <input
            className={inputClassName}
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field label="New password">
          <input
            className={inputClassName}
            minLength={minimumPasswordLength}
            required
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            className={inputClassName}
            minLength={minimumPasswordLength}
            required
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={saving}>
          {saving ? "Updating..." : "Change Password"}
        </Button>
      </form>
    </Panel>
  );
}
