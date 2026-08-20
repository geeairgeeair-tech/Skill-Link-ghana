import { useQuery } from "@tanstack/react-query";
import { signMedia, toMediaRefs } from "@/lib/media";

/**
 * Signs a list of private storage paths on demand with a short-lived URL.
 * Legacy values that are already absolute URLs pass through untouched.
 * Returns a map of original value -> viewable URL.
 */
export function useSignedMedia(values: (string | null | undefined)[], bucket = "job-media") {
  const list = values.filter((v): v is string => typeof v === "string" && v.length > 0);
  const key = list.join("|");

  const { data } = useQuery({
    queryKey: ["signed-media", bucket, key],
    enabled: list.length > 0,
    // Short-lived signed URLs (5 min); refresh a little before they expire.
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const toSign: string[] = [];
      for (const v of list) {
        if (/^https?:\/\//.test(v)) map[v] = v;
        else toSign.push(v);
      }
      if (toSign.length) {
        const signed = await signMedia(toMediaRefs(toSign, bucket));
        for (const s of signed) map[s.path] = s.url;
      }
      return map;
    },
  });

  return (value?: string | null) => (value ? (data?.[value] ?? (/^https?:\/\//.test(value) ? value : undefined)) : undefined);
}
