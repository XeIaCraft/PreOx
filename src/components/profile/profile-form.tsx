"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateFullName, uploadAvatar } from "@/app/actions/profile";
import { InitialsAvatar } from "@/components/hub/initials-avatar";
import { AvatarCropDialog } from "@/components/profile/avatar-crop-dialog";
import type { Profile } from "@/lib/supabase/types";

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [croppingFile, setCroppingFile] = useState<File | null>(null);
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleSaveName() {
    startTransition(async () => {
      const result = await updateFullName(fullName);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        refresh();
      }
    });
  }

  function handleAvatarSelected(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Seules les images sont acceptées.", { variant: "error" });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast("Photo trop lourde (4 Mo maximum).", { variant: "error" });
      return;
    }
    setCroppingFile(file);
  }

  function handleCropConfirm(base64: string, mimeType: string) {
    setCroppingFile(null);
    setUploadingAvatar(true);
    uploadAvatar(base64, mimeType)
      .then((result) => {
        if (result.error) toast(result.error, { variant: "error" });
        else refresh();
      })
      .catch(() => toast("Échec de l'envoi de la photo.", { variant: "error" }))
      .finally(() => setUploadingAvatar(false));
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <h2 className="font-serif-display text-lg font-medium text-foreground">Informations</h2>

      <div className="mt-4 flex items-center gap-4">
        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-tint text-primary-strong">
          {profile.avatar_url ? (
            <Image src={profile.avatar_url} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <InitialsAvatar userId={profile.id} name={profile.full_name} email={profile.email} className="h-16 w-16 text-lg" />
          )}
        </span>
        <div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleAvatarSelected(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
            <Upload className="h-4 w-4" />
            {uploadingAvatar ? "Envoi…" : "Changer la photo"}
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        <Label htmlFor="profile-name">Nom complet</Label>
        <div className="flex gap-2">
          <Input id="profile-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Button onClick={handleSaveName} disabled={isPending || !fullName.trim() || fullName === (profile.full_name ?? "")}>
            Enregistrer
          </Button>
        </div>
      </div>

      {croppingFile && (
        <AvatarCropDialog file={croppingFile} onCancel={() => setCroppingFile(null)} onConfirm={handleCropConfirm} />
      )}
    </div>
  );
}
