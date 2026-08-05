import { useQuery } from "@tanstack/react-query";
import { Loader2, Image as ImageIcon, Play } from "lucide-react";
import { signMedia, toMediaRefs } from "@/lib/media";

type Item = { url: string; kind: "image" | "video"; name?: string | null };

function isVideoPath(p: string) {
  return /\.(mp4|mov|webm|m4v|3gp|avi)(\?|$)/i.test(p);
}

/** Signs booking media (private bucket) and renders photos/videos. */
export function BookingMedia({ value, title = "Job photos and videos" }: { value: any; title?: string }) {
  const raw = Array.isArray(value) ? value : [];

  const { data, isLoading } = useQuery({
    queryKey: ["booking-media", JSON.stringify(raw)],
    enabled: raw.length > 0,
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<Item[]> => {
      const direct: Item[] = [];
      const toSign: any[] = [];
      for (const v of raw) {
        if (typeof v === "string" && /^https?:\/\//.test(v)) {
          direct.push({ url: v, kind: isVideoPath(v) ? "video" : "image" });
        } else {
          toSign.push(v);
        }
      }
      const refs = toMediaRefs(toSign, "job-media");
      const signed = refs.length ? await signMedia(refs) : [];
      const signedItems: Item[] = signed.map((s: any) => ({
        url: s.url,
        kind: (raw.find((r: any) => r?.path === s.path)?.kind === "video" || isVideoPath(s.path)) ? "video" : "image",
        name: s.label ?? null,
      }));
      return [...direct, ...signedItems];
    },
  });

  if (raw.length === 0) return null;

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
      <h3 className="font-display font-bold text-sm inline-flex items-center gap-1">
        <ImageIcon className="size-4" /> {title}
      </h3>
      {isLoading ? (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="size-3 animate-spin" /> Loading media…
        </p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">These files are no longer available.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {data.map((m, i) =>
            m.kind === "video" ? (
              <a
                key={i}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted grid place-items-center"
              >
                <video src={m.url} className="size-full object-cover" preload="metadata" muted playsInline />
                <span className="absolute inset-0 grid place-items-center bg-foreground/25">
                  <Play className="size-6 text-background" />
                </span>
              </a>
            ) : (
              <a
                key={i}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square rounded-xl overflow-hidden border border-border"
              >
                <img src={m.url} alt={m.name || `Booking attachment ${i + 1}`} className="size-full object-cover" loading="lazy" />
              </a>
            ),
          )}
        </div>
      )}
    </section>
  );
}
