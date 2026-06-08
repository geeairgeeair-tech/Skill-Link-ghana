import * as Icons from "lucide-react";
import type { LucideProps } from "lucide-react";

export function CategoryIcon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (Icons as unknown as Record<string, React.FC<LucideProps>>)[name] ?? Icons.Wrench;
  return <Cmp {...props} />;
}
