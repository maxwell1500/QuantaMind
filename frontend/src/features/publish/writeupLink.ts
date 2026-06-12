/// The "walled garden" allow-list for an optional write-up link attached to a
/// published result. Restricting to known dev/social hosts keeps the board from
/// becoming a spam/SEO link farm — moderation cost the backend would otherwise eat.
const ALLOWED_HOSTS = [
  "github.com",
  "x.com",
  "twitter.com",
  "dev.to",
  "reddit.com",
  "medium.com",
  "youtube.com",
  "huggingface.co",
];

/// Is the write-up link acceptable? Empty is allowed (the link is optional);
/// otherwise it must be a parseable **https** URL whose host is (a subdomain of)
/// an allow-listed domain. Everything else — http, other domains, garbage — fails.
export function isAllowedWriteupLink(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === "") return true;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}
