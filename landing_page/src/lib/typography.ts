/**
 * Polska typografia: jednoliterowy wyraz (a, i, o, u, w, z) nie może zostać na końcu linii.
 * Wiąże go twardą spacją z następnym wyrazem, tylko w tekście: znaczniki, atrybuty, <script>
 * i <style> zostają nietknięte.
 */
const ORPHAN = /(?<=^|[\s(„"])([aiouwz])\s+(?=\S)/gi;

export function bindOrphans(html: string): string {
  return html.replace(
    /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>)|([^<]+)/gi,
    (match, tag: string | undefined) => (tag ? match : match.replace(ORPHAN, "$1 ")),
  );
}
