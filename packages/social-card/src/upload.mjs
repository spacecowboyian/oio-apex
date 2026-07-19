// Turn a local render into a public direct-file URL for Upload-Post's server
// to fetch. Upload-Post's upload_photos has no base64/inline path (unlike
// upload_video's videoBase64), so a public URL is mandatory.
//
// Host history (see Brains oio-apex-social-generator): 0x0.st disabled
// uploads, catbox.moe now 412s ("Invalid uploader"), transfer.sh unreachable.
// tmpfiles.org works, with one real gotcha baked into the extraction below:
// the URL its API returns serves an HTML PREVIEW page, not the file. The true
// direct-download URL embeds a timestamp+hash and only appears in that page's
// markup as  <a class="download" href="https://tmpfiles.org/dl/<ts>.<hash>/<id>/<name>">.
// We upload, then resolve that dl URL, so a server fetching it gets real bytes.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const UA = "Mozilla/5.0";

export async function uploadToTmpfiles(filePath) {
  const bytes = await readFile(filePath);
  const name = basename(filePath);

  const form = new FormData();
  form.append("file", new Blob([bytes]), name);

  const res = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", headers: { "User-Agent": UA }, body: form });
  if (!res.ok) throw new Error(`tmpfiles upload failed: HTTP ${res.status}`);
  const json = await res.json();
  const previewUrl = json?.data?.url;
  if (!previewUrl) throw new Error(`tmpfiles upload: no url in response ${JSON.stringify(json)}`);

  // previewUrl is https://tmpfiles.org/<id>/<name> (serves HTML). Fetch it and
  // extract the real direct-download href.
  const page = await fetch(previewUrl, { headers: { "User-Agent": UA } });
  const html = await page.text();
  const m = html.match(/href="(https:\/\/tmpfiles\.org\/dl\/[^"]+)"/);
  if (!m) throw new Error(`tmpfiles: could not find direct /dl/ URL on preview page ${previewUrl}`);
  const directUrl = m[1];

  // Verify it actually serves the file, not HTML.
  const head = await fetch(directUrl, { method: "HEAD", headers: { "User-Agent": UA } });
  const ct = head.headers.get("content-type") || "";
  if (!/^image\/|^video\//.test(ct)) throw new Error(`tmpfiles: direct URL returned content-type "${ct}", expected image/*`);

  return { directUrl, previewUrl, contentType: ct };
}
