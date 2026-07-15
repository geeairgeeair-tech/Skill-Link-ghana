import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackButton({
  fallback = "/",
  label = "Back",
  className,
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: fallback });
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors -ml-1 px-2 py-1.5 rounded-lg active:bg-muted touch-manipulation",
        className,
      )}
    >
      <ArrowLeft className="size-4" />
      {label}
    </button>
  );
}
