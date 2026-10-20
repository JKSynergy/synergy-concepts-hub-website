// Brand images embedded in generated PDFs (read at request time on the server).
import { readFileSync } from "fs";
import { join } from "path";

const dataUri = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;

export function brandAssets() {
  return {
    logo: dataUri(join(process.cwd(), "public", "images", "logo-with-black.png")),
    signature: dataUri(join(process.cwd(), "public", "images", "SCH E-Signature small.png")),
  };
}
