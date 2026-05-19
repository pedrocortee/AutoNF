import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, FileUp, Lock, Building2, UserX, Webhook, Trash2, Eye, Copy, ChevronDown, ChevronUp, Bell } from "lucide-react";
import { toast } from "sonner";

const ALL_EVENTS = [
  { value: "invoice.created", label: "invoice.created", description: "NF criada" },
  { value: "invoice.processed", label: "invoice.processed", description: "NF emitida com sucesso" },
  { value: "invoice.error", label: "invoice.error", description: "NF com erro após retries" },
  { value: "invoice.cancelled", label: "invoice.cancelled", description: "NF cancelada" },
] as const;

type EventName = (typeof ALL_EVENTS)[number]["value"];

export default function Settings() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const deleteAccountMutation = trpc.account.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("Conta excluída com sucesso.");
      navigate("/");
    },
    onError: (err) => toast.error(err.message || "Erro ao excluir conta"),
  });

  const [companyFormData, setCompanyFormData] = useState({
    cnpj: "",
    municipalRegistration: "",
    companyName: "",
    address: "",
    municipality: "",
    state: "",
    issRate: 5,
    cTribNac: "0107",
  });

  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState("");
  const [isLoadingCert, setIsLoadingCert] = useState(false);
  const [isLoadingCompany, setIsLoadingCompany] = useState(false);

  // Queries
  const companyQuery = trpc.company.getConfig.useQuery();
  const certificatesQuery = trpc.certificates.list.useQuery();
  const activeCertQuery = trpc.certificates.getActive.useQuery();

  // Mutations
  const updateCompanyMutation = trpc.company.updateConfig.useMutation();
  const uploadCertMutation = trpc.certificates.upload.useMutation();

  // Load company data when available
  if (companyQuery.data && !companyFormData.cnpj) {
    setCompanyFormData({
      cnpj: companyQuery.data.cnpj || "",
      municipalRegistration: companyQuery.data.municipalRegistration || "",
      companyName: companyQuery.data.companyName || "",
      address: companyQuery.data.address || "",
      municipality: companyQuery.data.municipality || "",
      state: companyQuery.data.state || "",
      issRate: parseFloat(companyQuery.data.issRate ?? "5"),
      cTribNac: companyQuery.data.cTribNac ?? "0107",
    });
  }

  const handleUpdateCompany = async () => {
    setIsLoadingCompany(true);
    try {
      await updateCompanyMutation.mutateAsync(companyFormData);
      toast.success("Dados da empresa atualizados com sucesso!");
      companyQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar dados da empresa");
    } finally {
      setIsLoadingCompany(false);
    }
  };

  const handleUploadCertificate = async () => {
    if (!certificateFile) {
      toast.error("Selecione um arquivo de certificado");
      return;
    }

    if (!certificatePassword) {
      toast.error("Digite a senha do certificado");
      return;
    }

    setIsLoadingCert(true);
    try {
      const certificateData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
        reader.readAsDataURL(certificateFile);
      });
      await uploadCertMutation.mutateAsync({
        filename: certificateFile.name,
        certificateData,
        encryptedPassword: certificatePassword,
      });
      toast.success("Certificado enviado com sucesso!");
      setCertificateFile(null);
      setCertificatePassword("");
      certificatesQuery.refetch();
      activeCertQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar certificado");
    } finally {
      setIsLoadingCert(false);
    }
  };

  // ── Notification Preferences state ────────────────────────────────────────
  const [notifEmailTomador, setNotifEmailTomador] = useState(true);
  const [notifEmailPrestador, setNotifEmailPrestador] = useState(true);
  const [notifDefaultTomadorEmail, setNotifDefaultTomadorEmail] = useState("");
  const [notifLoaded, setNotifLoaded] = useState(false);

  const notifPrefsQuery = trpc.notifications.getPrefs.useQuery();
  const updateNotifPrefsMutation = trpc.notifications.updatePrefs.useMutation({
    onSuccess: () => toast.success("Preferências de notificação salvas!"),
    onError: (err) => toast.error(err.message || "Erro ao salvar preferências"),
  });

  if (notifPrefsQuery.data && !notifLoaded) {
    setNotifEmailTomador(notifPrefsQuery.data.emailTomadorOnSuccess);
    setNotifEmailPrestador(notifPrefsQuery.data.emailPrestadorOnError);
    setNotifDefaultTomadorEmail(notifPrefsQuery.data.defaultTomadorEmail ?? "");
    setNotifLoaded(true);
  }

  // ── Webhook state ──────────────────────────────────────────────────────────
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookDescription, setWebhookDescription] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<EventName[]>([
    "invoice.created",
    "invoice.processed",
    "invoice.error",
    "invoice.cancelled",
  ]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [expandedDeliveries, setExpandedDeliveries] = useState<number | null>(null);

  const webhookEndpointsQuery = trpc.webhookEndpoints.list.useQuery();
  const deliveriesQuery = trpc.webhookEndpoints.deliveries.useQuery(
    { endpointId: expandedDeliveries! },
    { enabled: expandedDeliveries !== null }
  );

  const createWebhookMutation = trpc.webhookEndpoints.create.useMutation({
    onSuccess: (data) => {
      setNewSecret(data.secret);
      setWebhookUrl("");
      setWebhookDescription("");
      webhookEndpointsQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Erro ao criar webhook"),
  });

  const updateWebhookMutation = trpc.webhookEndpoints.update.useMutation({
    onSuccess: () => webhookEndpointsQuery.refetch(),
    onError: (err) => toast.error(err.message || "Erro ao atualizar webhook"),
  });

  const deleteWebhookMutation = trpc.webhookEndpoints.delete.useMutation({
    onSuccess: () => webhookEndpointsQuery.refetch(),
    onError: (err) => toast.error(err.message || "Erro ao remover webhook"),
  });

  const handleCreateWebhook = () => {
    if (!webhookUrl) return toast.error("URL é obrigatória");
    if (webhookEvents.length === 0) return toast.error("Selecione pelo menos um evento");
    createWebhookMutation.mutate({ url: webhookUrl, description: webhookDescription || undefined, events: webhookEvents });
  };

  const toggleEvent = (event: EventName) => {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  return (
    <DashboardLayout>
      <div className="flex-1 flex flex-col">
        <div className="p-8 pb-4">
          <h1 className="text-3xl font-bold text-slate-900">Configurações</h1>
          <p className="text-slate-600 mt-2">
            Gerencie seus dados de empresa e certificado digital para emissão de NFS-e
          </p>
        </div>

        <div className="flex-1 overflow-auto p-8 pt-4">
          <Tabs defaultValue="company" className="w-full max-w-4xl">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="company" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Empresa
              </TabsTrigger>
              <TabsTrigger value="certificate" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Certificado
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notificações
              </TabsTrigger>
              <TabsTrigger value="webhooks" className="flex items-center gap-2">
                <Webhook className="w-4 h-4" />
                Webhooks
              </TabsTrigger>
              <TabsTrigger value="account" className="flex items-center gap-2">
                <UserX className="w-4 h-4" />
                Conta
              </TabsTrigger>
            </TabsList>

            {/* Company Data Tab */}
            <TabsContent value="company" className="space-y-6">
              <Card className="p-6">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cnpj" className="text-sm font-medium">
                        CNPJ *
                      </Label>
                      <Input
                        id="cnpj"
                        placeholder="00.000.000/0000-00"
                        value={companyFormData.cnpj}
                        onChange={(e) =>
                          setCompanyFormData({ ...companyFormData, cnpj: e.target.value })
                        }
                        className="mt-1"
                      />
                      <p className="text-xs text-slate-500 mt-1">14 dígitos sem formatação</p>
                    </div>

                    <div>
                      <Label htmlFor="municipalRegistration" className="text-sm font-medium">
                        Inscrição Municipal (ISS) *
                      </Label>
                      <Input
                        id="municipalRegistration"
                        placeholder="Inscrição Municipal"
                        value={companyFormData.municipalRegistration}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            municipalRegistration: e.target.value,
                          })
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="companyName" className="text-sm font-medium">
                      Razão Social *
                    </Label>
                    <Input
                      id="companyName"
                      placeholder="Nome da empresa"
                      value={companyFormData.companyName}
                      onChange={(e) =>
                        setCompanyFormData({ ...companyFormData, companyName: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="address" className="text-sm font-medium">
                      Endereço *
                    </Label>
                    <Input
                      id="address"
                      placeholder="Rua, número, complemento"
                      value={companyFormData.address}
                      onChange={(e) =>
                        setCompanyFormData({ ...companyFormData, address: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="municipality" className="text-sm font-medium">
                        Município *
                      </Label>
                      <Input
                        id="municipality"
                        placeholder="Porto Alegre"
                        value={companyFormData.municipality}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            municipality: e.target.value,
                          })
                        }
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="state" className="text-sm font-medium">
                        Estado (UF) *
                      </Label>
                      <Input
                        id="state"
                        placeholder="RS"
                        maxLength={2}
                        value={companyFormData.state}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            state: e.target.value.toUpperCase(),
                          })
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="issRate" className="text-sm font-medium">
                        Alíquota ISS (%)
                      </Label>
                      <Input
                        id="issRate"
                        type="number"
                        min={2}
                        max={5}
                        step={0.5}
                        value={companyFormData.issRate}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            issRate: parseFloat(e.target.value) || 5,
                          })
                        }
                        className="mt-1"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Varia por município: 2% a 5%. Porto Alegre: 5%, Caxias do Sul: 4%.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="cTribNac" className="text-sm font-medium">
                        Código serviço nacional (LC 116/2003)
                      </Label>
                      <Input
                        id="cTribNac"
                        placeholder="0107"
                        value={companyFormData.cTribNac}
                        onChange={(e) =>
                          setCompanyFormData({
                            ...companyFormData,
                            cTribNac: e.target.value.replace(/\D/g, ""),
                          })
                        }
                        className="mt-1"
                        maxLength={6}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Ex: 0107 = TI/Processamento de dados. Veja a lista LC 116.
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleUpdateCompany}
                    disabled={isLoadingCompany}
                    className="w-full"
                  >
                    {isLoadingCompany ? "Salvando..." : "Salvar Dados da Empresa"}
                  </Button>
                </div>
              </Card>
            </TabsContent>

            {/* Certificate Tab */}
            <TabsContent value="certificate" className="space-y-6">
              {/* Active Certificate */}
              {activeCertQuery.data && (
                <Card className="p-6 border-green-200 bg-green-50">
                  <div className="flex items-start gap-4">
                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-green-900">Certificado Ativo</h3>
                      <p className="text-sm text-green-800 mt-1">
                        {activeCertQuery.data.filename}
                      </p>
                      {activeCertQuery.data.validUntil && (
                        <p className="text-xs text-green-700 mt-2">
                          Válido até:{" "}
                          {new Date(activeCertQuery.data.validUntil).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* Upload New Certificate */}
              <Card className="p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4">
                      Enviar Novo Certificado
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                      Envie seu certificado digital A1 (arquivo .pfx ou .p12) para emitir notas
                      fiscais.
                    </p>
                  </div>

                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-slate-400 transition-colors">
                    <FileUp className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                    <label className="cursor-pointer">
                      <span className="text-sm font-medium text-blue-600 hover:text-blue-700">
                        Clique para selecionar arquivo
                      </span>
                      <input
                        type="file"
                        accept=".pfx,.p12"
                        onChange={(e) => setCertificateFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>
                    {certificateFile && (
                      <p className="text-sm text-slate-600 mt-2">{certificateFile.name}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="certPassword" className="text-sm font-medium">
                      Senha do Certificado *
                    </Label>
                    <Input
                      id="certPassword"
                      type="password"
                      placeholder="Digite a senha do certificado"
                      value={certificatePassword}
                      onChange={(e) => setCertificatePassword(e.target.value)}
                      className="mt-1"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      A senha será criptografada e armazenada com segurança
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium">Informações importantes:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                          <li>Certificado deve ser válido e emitido por AC credenciada ICP-Brasil</li>
                          <li>Apenas certificados A1 são suportados</li>
                          <li>A senha será criptografada antes de ser armazenada</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleUploadCertificate}
                    disabled={isLoadingCert || !certificateFile}
                    className="w-full"
                  >
                    {isLoadingCert ? "Enviando..." : "Enviar Certificado"}
                  </Button>
                </div>
              </Card>

              {/* Certificate List */}
              {certificatesQuery.data && certificatesQuery.data.length > 0 && (
                <Card className="p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Histórico de Certificados</h3>
                  <div className="space-y-3">
                    {certificatesQuery.data.map((cert) => (
                      <div
                        key={cert.id}
                        className="flex items-center justify-between p-3 border border-slate-200 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{cert.filename}</p>
                          {cert.validUntil && (
                            <p className="text-xs text-slate-500">
                              Válido até:{" "}
                              {new Date(cert.validUntil).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </div>
                        {cert.isActive === "true" && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                            Ativo
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </TabsContent>
            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-1">Notificações por Email</h3>
                <p className="text-sm text-slate-600 mb-6">
                  Configure os emails automáticos enviados após cada emissão de NFS-e.
                </p>

                <div className="space-y-6">
                  {/* Email ao tomador */}
                  <div className="flex items-start justify-between gap-4 p-4 border border-slate-200 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        Enviar PDF ao tomador após emissão
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        O tomador recebe o PDF da NFS-e por email logo após a emissão com sucesso.
                      </p>
                    </div>
                    <Switch
                      checked={notifEmailTomador}
                      onCheckedChange={setNotifEmailTomador}
                    />
                  </div>

                  {/* Default tomador email */}
                  {notifEmailTomador && (
                    <div>
                      <Label htmlFor="defaultTomadorEmail" className="text-sm font-medium">
                        Email padrão do tomador
                      </Label>
                      <Input
                        id="defaultTomadorEmail"
                        type="email"
                        placeholder="tomador@empresa.com.br"
                        value={notifDefaultTomadorEmail}
                        onChange={(e) => setNotifDefaultTomadorEmail(e.target.value)}
                        className="mt-1"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Usado quando nenhum email específico for informado na nota.
                      </p>
                    </div>
                  )}

                  {/* Email de erro ao prestador */}
                  <div className="flex items-start justify-between gap-4 p-4 border border-slate-200 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        Alertar por email em caso de falha
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Você recebe um email quando uma nota falha após todas as tentativas de reenvio.
                      </p>
                    </div>
                    <Switch
                      checked={notifEmailPrestador}
                      onCheckedChange={setNotifEmailPrestador}
                    />
                  </div>

                  <Button
                    onClick={() =>
                      updateNotifPrefsMutation.mutate({
                        emailTomadorOnSuccess: notifEmailTomador,
                        emailPrestadorOnError: notifEmailPrestador,
                        defaultTomadorEmail: notifDefaultTomadorEmail || null,
                      })
                    }
                    disabled={updateNotifPrefsMutation.isPending}
                    className="w-full"
                  >
                    {updateNotifPrefsMutation.isPending ? "Salvando..." : "Salvar Preferências"}
                  </Button>
                </div>
              </Card>

              <Card className="p-5 bg-blue-50 border-blue-200">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Configuração de SMTP</p>
                    <p className="text-xs mt-1">
                      Para enviar emails, defina as variáveis de ambiente{" "}
                      <code className="bg-blue-100 px-1 rounded">SMTP_HOST</code>,{" "}
                      <code className="bg-blue-100 px-1 rounded">SMTP_PORT</code>,{" "}
                      <code className="bg-blue-100 px-1 rounded">SMTP_USER</code> e{" "}
                      <code className="bg-blue-100 px-1 rounded">SMTP_PASS</code>.
                      Alternativamente, use <code className="bg-blue-100 px-1 rounded">RESEND_API_KEY</code>.
                    </p>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Webhooks Tab */}
            <TabsContent value="webhooks" className="space-y-6">
              {/* Secret reveal dialog */}
              {newSecret && (
                <Card className="p-5 border-green-200 bg-green-50">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-green-900">Endpoint criado!</p>
                      <p className="text-xs text-green-700 mt-1 mb-2">
                        Copie a chave secreta agora — ela não será exibida novamente.
                      </p>
                      <div className="flex items-center gap-2 bg-white border border-green-300 rounded px-3 py-2 font-mono text-xs break-all">
                        <span className="flex-1">{newSecret}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(newSecret);
                            toast.success("Copiado!");
                          }}
                          className="shrink-0 text-green-700 hover:text-green-900"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setNewSecret(null)}
                      >
                        OK, já copiei
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Add new endpoint */}
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Adicionar endpoint</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">URL *</Label>
                    <Input
                      placeholder="https://meusite.com/webhooks/autonf"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Descrição</Label>
                    <Input
                      placeholder="Ex: ERP produção"
                      value={webhookDescription}
                      onChange={(e) => setWebhookDescription(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Eventos *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_EVENTS.map((ev) => (
                        <label
                          key={ev.value}
                          className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={webhookEvents.includes(ev.value)}
                            onChange={() => toggleEvent(ev.value)}
                            className="rounded"
                          />
                          <div>
                            <p className="text-xs font-mono font-medium text-slate-800">{ev.label}</p>
                            <p className="text-xs text-slate-500">{ev.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={handleCreateWebhook}
                    disabled={createWebhookMutation.isPending}
                    className="w-full"
                  >
                    {createWebhookMutation.isPending ? "Criando..." : "Criar endpoint"}
                  </Button>
                </div>
              </Card>

              {/* Endpoint list */}
              {webhookEndpointsQuery.data && webhookEndpointsQuery.data.length > 0 && (
                <Card className="p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Endpoints configurados</h3>
                  <div className="space-y-3">
                    {webhookEndpointsQuery.data.map((ep) => {
                      const events: string[] = (() => {
                        try { return JSON.parse(ep.events); } catch { return []; }
                      })();
                      const isExpanded = expandedDeliveries === ep.id;

                      return (
                        <div key={ep.id} className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between p-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono text-slate-800 truncate">{ep.url}</p>
                              {ep.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{ep.description}</p>
                              )}
                              <div className="flex flex-wrap gap-1 mt-2">
                                {events.map((ev) => (
                                  <Badge key={ev} variant="secondary" className="text-xs font-mono">
                                    {ev}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 ml-4 shrink-0">
                              <Switch
                                checked={ep.isActive === "true"}
                                onCheckedChange={(checked) =>
                                  updateWebhookMutation.mutate({ id: ep.id, isActive: checked })
                                }
                              />
                              <button
                                onClick={() => setExpandedDeliveries(isExpanded ? null : ep.id)}
                                className="text-slate-500 hover:text-slate-700"
                                title="Ver entregas"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("Remover este endpoint?")) {
                                    deleteWebhookMutation.mutate({ id: ep.id });
                                  }
                                }}
                                className="text-red-400 hover:text-red-600"
                                title="Remover"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Delivery log */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50 p-4">
                              <p className="text-xs font-medium text-slate-700 mb-3">
                                Últimas 20 entregas
                              </p>
                              {deliveriesQuery.isLoading ? (
                                <p className="text-xs text-slate-500">Carregando...</p>
                              ) : deliveriesQuery.data && deliveriesQuery.data.length > 0 ? (
                                <div className="space-y-2">
                                  {deliveriesQuery.data.map((d) => (
                                    <div
                                      key={d.id}
                                      className="flex items-start gap-3 text-xs bg-white border border-slate-100 rounded p-2"
                                    >
                                      <span
                                        className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                                          d.success === "true" ? "bg-green-500" : "bg-red-400"
                                        }`}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-mono font-medium">{d.event}</span>
                                          {d.responseStatus != null && (
                                            <span
                                              className={`px-1.5 py-0.5 rounded font-mono ${
                                                d.success === "true"
                                                  ? "bg-green-100 text-green-800"
                                                  : "bg-red-100 text-red-800"
                                              }`}
                                            >
                                              HTTP {d.responseStatus}
                                            </span>
                                          )}
                                          <span className="text-slate-400 ml-auto">
                                            {new Date(d.createdAt).toLocaleString("pt-BR")}
                                          </span>
                                        </div>
                                        {d.responseBody && (
                                          <p className="text-slate-500 truncate mt-0.5">
                                            {d.responseBody}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">Nenhuma entrega registada.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Info box */}
              <Card className="p-5 bg-slate-50 border-slate-200">
                <p className="text-sm font-semibold text-slate-800 mb-2">Como verificar a assinatura</p>
                <p className="text-xs text-slate-600 mb-2">
                  Cada requisição inclui o header{" "}
                  <code className="bg-slate-200 px-1 rounded">X-AutoNF-Signature: sha256=&lt;hmac&gt;</code>.
                  Verifique com:
                </p>
                <pre className="bg-slate-900 text-green-400 text-xs rounded p-3 overflow-x-auto">
{`const sig = crypto
  .createHmac('sha256', SECRET)
  .update(rawBody)
  .digest('hex');

if (\`sha256=\${sig}\` !== req.headers['x-autonf-signature']) {
  return res.status(401).end();
}`}
                </pre>
              </Card>
            </TabsContent>

            {/* Account Tab */}
            <TabsContent value="account" className="space-y-6">
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-1">Privacidade e LGPD</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Consulte nossa{" "}
                  <a href="/privacy" className="text-blue-600 underline">
                    Política de Privacidade
                  </a>{" "}
                  para entender como tratamos seus dados.
                </p>
              </Card>

              <Card className="p-6 border-red-200">
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900 mb-1">Excluir conta</h3>
                    <p className="text-sm text-slate-600 mb-4">
                      Remove permanentemente sua conta, certificados, configurações e histórico de
                      notas. Dados fiscais já emitidos são mantidos pelo prazo legal de 5 anos.
                      Esta ação é irreversível.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <UserX className="w-4 h-4 mr-2" />
                      Excluir minha conta
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta permanentemente</DialogTitle>
            <DialogDescription>
              Esta ação excluirá todos os seus dados (empresa, certificado, histórico de notas) e não
              pode ser desfeita. Para confirmar, digite <strong>EXCLUIR</strong> abaixo.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Digite EXCLUIR para confirmar"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "EXCLUIR" || deleteAccountMutation.isPending}
              onClick={() => deleteAccountMutation.mutate()}
            >
              {deleteAccountMutation.isPending ? "Excluindo..." : "Excluir conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
