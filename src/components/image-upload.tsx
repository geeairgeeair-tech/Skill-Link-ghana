import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

/**
 * Uploads an image to a private bucket under `${userId}/`.
 * Returns the storage path when `returnPath` is set (preferred for sensitive
 * files such as identity documents — a long-lived signed URL is a bearer
 * credential and must never be persisted), otherwise a long-lived signed URL.
 */
export async function uploadImage(bucket: string, userId: string, file: File, prefix = "img", returnPath = false) {
  if (!ACCEPT.includes(file.type)) throw new Error("Use a JPG, PNG or WebP image");
  if (file.size > MAX_BYTES) throw new Error("Image must be under 8MB");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  if (returnPath) return path;
  const { data, error: sErr } = await supabase.storage.from(bucket).createSignedUrl(path, TEN_YEARS);
  if (sErr) throw sErr;
  return data.signedUrl;
}

type Props = {
  bucket: string;
  userId: string;
  prefix?: string;
  label: string;
  hint?: string;
  multiple?: boolean;
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  /** Store storage paths instead of signed URLs (sensitive files). */
  returnPath?: boolean;
};


export function ImageUpload({ bucket, userId, prefix = "img", label, hint, multiple, value, onChange, max = 8, returnPath = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // Stored paths (sensitive files) are shown with a short-lived signed URL.
  useEffect(() => {
    if (!returnPath) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of value) {
        if (/^https?:\/\//.test(p)) continue;
        const { data } = await supabase.storage.from(bucket).createSignedUrl(p, 300);
        if (data?.signedUrl) next[p] = data.signedUrl;
      }
      if (!cancelled) setPreviews((prev) => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [returnPath, bucket, value.join("|")]);

  const handle = async (files: FileList) => {
    setBusy(true);
    try {
      const picked = Array.from(files).slice(0, Math.max(0, max - value.length));
      const urls: string[] = [];
      for (const f of picked) urls.push(await uploadImage(bucket, userId, f, prefix, returnPath));
      onChange(multiple ? [...value, ...urls] : urls.slice(0, 1));
      toast.success("Uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <p className="text-[11px] font-semibold mb-1 text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="relative size-20 rounded-xl overflow-hidden border border-border bg-muted">
            <img src={/^https?:\/\//.test(url) ? url : previews[url]} alt={label} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((u) => u !== url))}
              className="absolute top-0.5 right-0.5 size-5 rounded-full bg-background/90 grid place-items-center"
              aria-label="Remove image"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {value.length < (multiple ? max : 1) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="size-20 rounded-xl border border-dashed border-input grid place-items-center text-muted-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) handle(e.target.files); }}
      />
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
