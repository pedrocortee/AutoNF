import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  onAccepted: () => void;
}

export function PrivacyConsentModal({ open, onAccepted }: Props) {
  const acceptMutation = trpc.auth.acceptPrivacy.useMutation({
    onSuccess: onAccepted,
  });

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        // Prevent closing without accepting
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck className="w-6 h-6 text-blue-600 flex-shrink-0" />
            <DialogTitle>Política de Privacidade e LGPD</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-slate-600 leading-relaxed">
            Para usar o AutoNF precisamos tratar seus dados fiscais (CNPJ, inscrição municipal,
            certificado digital, notas fiscais) conforme nossa{" "}
            <a href="/privacy" target="_blank" className="text-blue-600 underline font-medium">
              Política de Privacidade
            </a>
            . Isso é necessário para emitir NFS-e junto às prefeituras municipais.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
          <p>✓ Certificado digital armazenado com criptografia AES-256-GCM</p>
          <p>✓ Dados compartilhados apenas com prefeituras e processador de pagamentos</p>
          <p>✓ Você pode excluir sua conta e dados a qualquer momento</p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="w-full"
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? "Registrando..." : "Aceitar e continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
