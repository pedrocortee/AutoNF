import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

const UFS: [string, number][] = [
  ["AC", 12], ["AL", 27], ["AM", 13], ["AP", 16], ["BA", 29], ["CE", 23], ["DF", 53], ["ES", 32], ["GO", 52],
  ["MA", 21], ["MG", 31], ["MS", 50], ["MT", 51], ["PA", 15], ["PB", 25], ["PE", 26], ["PI", 22], ["PR", 41],
  ["RJ", 33], ["RN", 24], ["RO", 11], ["RR", 14], ["RS", 43], ["SC", 42], ["SE", 28], ["SP", 35], ["TO", 17],
];

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CertificateDialog({
  company,
  onClose,
  onSaved,
}: {
  company: { id: number; name: string; hasCertificate: boolean } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upload = trpc.companies.uploadCertificate.useMutation();
  const remove = trpc.companies.removeCertificate.useMutation();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uf, setUf] = useState("43");

  function close() {
    setFile(null);
    setPassword("");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !file) return;
    try {
      const r = await upload.mutateAsync({ companyId: company.id, pfxBase64: await readAsBase64(file), password, ufCode: Number(uf) });
      toast.success(`Certificado salvo — válido até ${new Date(r.validUntil).toLocaleDateString("pt-BR")}.`);
      onSaved();
      close();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleRemove() {
    if (!company || !confirm("Remover o certificado? A captura automática desta empresa para.")) return;
    await remove.mutateAsync({ companyId: company.id });
    toast.success("Certificado removido.");
    onSaved();
    close();
  }

  return (
    <Dialog open={!!company} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Certificado A1 — {company?.name}</DialogTitle>
          <DialogDescription>
            Usado para baixar da SEFAZ as NF-e emitidas contra esta empresa. Fica guardado criptografado. É preciso ter
            procuração do cliente para usar o certificado dele.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="cert-file">Arquivo .pfx ou .p12</Label>
            <Input id="cert-file" className="mt-1" type="file" accept=".pfx,.p12" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </div>
          <div>
            <Label htmlFor="cert-pass">Senha do certificado</Label>
            <Input id="cert-pass" className="mt-1" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <Label>Estado (UF) da empresa</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UFS.map(([sigla, code]) => <SelectItem key={code} value={String(code)}>{sigla}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {company?.hasCertificate ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={handleRemove} disabled={remove.isPending}>Remover</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
              <Button type="submit" disabled={!file || !password || upload.isPending}>{company?.hasCertificate ? "Substituir" : "Salvar"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
