import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useInboundApi } from "@/lib/inbound";

/** Shows the original file: PDF in an iframe, images inline, XML as indented text. */
export function FileViewer({ id, mediaType }: { id: number; mediaType: string }) {
  const { fileBlob } = useInboundApi();
  const [url, setUrl] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    fileBlob(id)
      .then(async (blob) => {
        if (cancelled) return;
        if (mediaType === "application/xml") {
          setXml(prettyXml(await blob.text()));
        } else {
          revoked = URL.createObjectURL(blob);
          setUrl(revoked);
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [id, mediaType, fileBlob]);

  if (error) return <div className="p-6 text-sm text-red-700">Não foi possível abrir o arquivo: {error}</div>;
  if (!url && xml === null) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (xml !== null) {
    return <pre className="text-xs leading-relaxed p-4 overflow-auto h-full whitespace-pre-wrap break-all">{xml}</pre>;
  }
  if (mediaType === "application/pdf") {
    return <iframe title="Documento original" src={url!} className="w-full h-full min-h-[600px] border-0" />;
  }
  return <img src={url!} alt="Documento original" className="max-w-full mx-auto" />;
}

function prettyXml(xml: string): string {
  let depth = 0;
  return xml
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const closing = line.startsWith("</");
      const opensBlock = /^<[^!?/][^>]*[^/]>$/.test(line) || /^<[^!?/]>$/.test(line); // <tag ...> with no text and no close
      if (closing) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + line;
      if (opensBlock) depth++;
      return out;
    })
    .join("\n");
}
