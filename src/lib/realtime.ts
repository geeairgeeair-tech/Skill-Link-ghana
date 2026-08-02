import { supabase } from "@/integrations/supabase/client";

/**
 * Creates a realtime channel with a topic that is unique per call.
 *
 * `supabase.channel(topic)` returns the *existing* channel instance when a
 * channel with the same topic is already registered on the client. If two
 * components (or a StrictMode double-mount) use the same topic, the second
 * caller receives an already-subscribed channel and every `.on()` throws
 * "cannot add 'postgres_changes' callbacks after 'subscribe()'".
 *
 * Suffixing the topic guarantees each subscriber owns its own channel.
 * Always tear it down with `supabase.removeChannel(ch)` on unmount.
 */
export function uniqueChannel(topic: string) {
  return supabase.channel(`${topic}:${Math.random().toString(36).slice(2)}`);
}
