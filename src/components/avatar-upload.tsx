import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  userId: string;
  currentUrl?: string | null;
  fallbackText?: string;
  onChange: (url: string | null) => void;
  size?: number;
};

export function AvatarUpload({ userId, currentUrl, fallbackText, onChange, size = 96 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (!ACCEPT.includes(file.type)) return toast.error("Use a JPG, PNG or WebP image");
    if (file.size > MAX_BYTES) return toast.error("Image must be under 5MB");
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, TEN_YEARS);
      if (sErr) throw sErr;
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ avatar_url: signed.signedUrl })
        .eq("id", userId);
      if (pErr) throw pErr;
      onChange(signed.signedUrl);
      toast.success("Profile photo updated");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { data: list } = await supabase.storage.from("avatars").list(userId, { limit: 100 });
      if (list?.length) {
        await supabase.storage.from("avatars").remove(list.map(o => `${userId}/${o.name}`));
      }
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      if (error) throw error;
      onChange(null);
      toast.success("Photo removed");
    } catch (e: any) {
      toast.error(e.message ?? "Could not remove");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="rounded-full bg-primary-soft overflow-hidden grid place-items-center text-primary font-bold shrink-0"
        style={{ width: size, height: size, fontSize: size / 2.6 }}
      >
        {currentUrl
          ? <img src={currentUrl} alt="Profile" className="size-full object-cover" />
          : (fallbackText?.[0]?.toUpperCase() ?? "?")}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin"/> : <Camera className="size-3.5"/>}
          {currentUrl ? "Change photo" : "Upload photo"}
        </button>
        {currentUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60 ml-2"
          >
            <Trash2 className="size-3.5"/> Remove
          </button>
        )}
        <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP · up to 5MB</p>
      </div>
    </div>
  );
}
