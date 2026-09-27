import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, CloudDownload, ScanText, ListChecks, FileSpreadsheet } from "lucide-react";

// Links configuráveis no build: o vídeo da demo (A.8) e o agendamento do diagnóstico
// (WhatsApp, Calendly etc.). Sem valor, o bloco correspondente não aparece.
const DEMO_VIDEO_URL = import.meta.env.VITE_DEMO_VIDEO_URL as string | undefined;
const DIAGNOSTICO_URL = import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined;

const STEPS = [
  {
    icon: CloudDownload,
    title: "Captura automática",
    description: "As NF-e emitidas contra cada cliente do escritório chegam direto da SEFAZ, com o certificado A1 dele.",
  },
  {
    icon: ScanText,
    title: "Leitura com IA",
    description: "NFS-e municipais, boletos e recibos em PDF são lidos e conferidos. Upload em lote por pasta ou ZIP.",
  },
  {
    icon: ListChecks,
    title: "Revisão só da exceção",
    description: "CNPJ, totais, datas e duplicidade validados. Só o que tiver dúvida vai para uma pessoa.",
  },
  {
    icon: FileSpreadsheet,
    title: "Pronto para importar",
    description: "Exportação no layout do seu sistema contábil, com conta, centro de custo e histórico.",
  },
];

/** Converte links do YouTube/Vimeo em URL de embed; demais links são usados como vídeo direto. */
function toEmbed(url: string): { kind: "iframe" | "video"; src: string } {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  return { kind: "video", src: url };
}

export function AccountingFirmsSection() {
  const video = DEMO_VIDEO_URL ? toEmbed(DEMO_VIDEO_URL) : null;

  return (
    <section id="escritorios" className="scroll-mt-16 border-t border-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest mb-3">
            Para escritórios de contabilidade
          </p>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            Notas de entrada conferidas e prontas para importar, sem ninguém digitar
          </h2>
          <p className="text-slate-500 mt-4 leading-relaxed">
            Sua equipe só revisa o que o sistema marcou como dúvida. O resto chega da SEFAZ, é validado
            e sai no formato do seu sistema contábil.
          </p>
        </div>

        <div className={`mt-14 grid gap-12 ${video ? "lg:grid-cols-2" : ""}`}>
          <div className={`grid gap-6 ${video ? "" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
            {STEPS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>

          {video && (
            <div className="aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
              {video.kind === "iframe" ? (
                <iframe
                  src={video.src}
                  title="Demonstração do AutoNF Entrada"
                  className="w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={video.src} controls preload="metadata" className="w-full h-full" />
              )}
            </div>
          )}
        </div>

        <div className="mt-14 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Diagnóstico com os números do seu escritório</h3>
            <p className="text-sm text-slate-600 mt-1.5 max-w-xl leading-relaxed">
              Mapeamos o processo de entrada, calculamos as horas e o retorno e rodamos o sistema numa amostra
              real das suas notas.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {["Amostra real de 50 a 100 documentos", "Cálculo de payback", "Abatido do setup"].map(item => (
                <div key={item} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          {DIAGNOSTICO_URL && (
            <Button asChild size="lg" className="gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 px-7 shrink-0">
              <a href={DIAGNOSTICO_URL} target="_blank" rel="noopener noreferrer">
                Agendar diagnóstico
                <ArrowRight className="w-4 h-4" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
