import { supabase } from "@/integrations/supabase/client";

export type MediaRef = { path: string; bucket?: string | null; label?: string | null };

/** Normalise whatever shape is stored in jsonb columns into MediaRef objects. */
export function toMediaRefs(value: any, fallbackBucket = "job-media"): MediaRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v: any) => {
      if (typeof v === "string") return { path: v, bucket: fallbackBucket };
      if (v && typeof v === "object" && typeof v.path === "string") {
        return { path: v.path, bucket: v.bucket ?? fallbackBucket, label: v.label ?? null };
      }
      return null;
    })
    .filter(Boolean) as MediaRef[];
}

/** Create signed URLs for a list of media refs (grouped per bucket). */
export async function signMedia(refs: MediaRef[], expiresIn = 60 * 60 * 6) {
  const byBucket = new Map<string, MediaRef[]>();
  for (const r of refs) {
    const b = r.bucket || "job-media";
    byBucket.set(b, [...(byBucket.get(b) ?? []), r]);
  }
  const out: (MediaRef & { url: string })[] = [];
  await Promise.all(
    Array.from(byBucket.entries()).map(async ([bucket, list]) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrls(list.map((l) => l.path), expiresIn);
      (data ?? []).forEach((d: any, i: number) => {
        if (d?.signedUrl) out.push({ ...list[i], url: d.signedUrl });
      });
    }),
  );
  return out;
}
