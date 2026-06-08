import { Star } from "lucide-react";

export function StarRating({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  return (
    <div className="inline-flex items-center gap-1 text-sm">
      <Star className="fill-gold text-gold" style={{ width: size, height: size }} />
      <span className="font-semibold">{Number(value || 0).toFixed(1)}</span>
      {count !== undefined && <span className="text-muted-foreground">({count})</span>}
    </div>
  );
}
