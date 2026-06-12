const ENC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

/// A ULID: 10 time chars + 16 random chars (26 total), lexicographically
/// sortable by creation time. Good enough for document ids.
export function ulid(time = Date.now(), rnd: () => number = Math.random): string {
  let t = time;
  let ts = "";
  for (let i = 0; i < 10; i++) {
    ts = ENC[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  let r = "";
  for (let i = 0; i < 16; i++) r += ENC[Math.floor(rnd() * 32)];
  return ts + r;
}
