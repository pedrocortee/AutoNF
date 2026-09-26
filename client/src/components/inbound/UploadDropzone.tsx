import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useInboundApi, type UploadResult } from "@/lib/inbound";

const ACCEPT = ".xml,.pdf,.png,.jpg,.jpeg,.zip";

export function UploadDropzone({ onUploaded }: { onUploaded: () => void }) {
  const { upload } = useInboundApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    setProgress({ done: 0, total: files.length });
    const results: UploadResult[] = [];
    for (const [i, f] of files.entries()) {
      try {
        results.push(...(await upload(f)));
      } catch (err) {
        results.push({ filename: f.name, status: "rejeitado", reason: (err as Error).message });
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setProgress(null);
    onUploaded();

    const created = results.filter((r) => r.status === "criado").length;
    const dup = results.filter((r) => r.status === "duplicado").length;
    const rejected = results.filter((r) => r.status === "rejeitado");
    if (created) toast.success(`${created} documento(s) recebido(s) e em processamento`);
    if (dup) toast.info(`${dup} arquivo(s) já tinham sido enviados`);
    for (const r of rejected.slice(0, 3)) toast.error(`${r.filename}: ${r.reason}`);
    if (rejected.length > 3) toast.error(`e mais ${rejected.length - 3} arquivo(s) rejeitado(s)`);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !progress && inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex items-center gap-4 rounded-lg border border-dashed px-5 py-4 cursor-pointer transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {progress ? (
        <Loader2 className="w-6 h-6 text-primary animate-spin shrink-0" />
      ) : (
        <UploadCloud className="w-6 h-6 text-muted-foreground shrink-0" />
      )}
      <div className="text-sm">
        {progress ? (
          <p className="font-medium text-foreground">
            Enviando {progress.done} de {progress.total}…
          </p>
        ) : (
          <>
            <p className="font-medium text-foreground">Arraste notas, boletos ou um ZIP aqui — ou clique para escolher</p>
            <p className="text-muted-foreground">XML de NF-e e NFS-e são lidos na hora; PDFs e imagens passam pela IA.</p>
          </>
        )}
      </div>
    </div>
  );
}
