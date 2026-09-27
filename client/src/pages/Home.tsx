import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { SignInButton } from "@clerk/clerk-react";
import { ArrowRight, CheckCircle2, Zap, BarChart3, Shield, FileCheck } from "lucide-react";
import { useEffect } from "react";
import { AccountingFirmsSection } from "@/components/AccountingFirmsSection";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isAuthenticated && !loading) navigate("/dashboard");
  }, [isAuthenticated, loading, navigate]);

  if (loading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-bold">NF</span>
            </div>
            <span className="font-semibold text-slate-900">AutoNF</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="#escritorios"
              className="hidden sm:inline text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              Para escritórios
            </a>
            <button
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              onClick={() => navigate("/docs")}
            >
              Documentação
            </button>
            <SignInButton mode="modal">
              <Button variant="outline" size="sm" className="border-slate-200 text-slate-700 hover:bg-slate-50">
                Entrar
              </Button>
            </SignInButton>
            <SignInButton mode="modal">
              <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200">
                Começar grátis
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </SignInButton>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Gradient mesh background */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-32 w-[600px] h-[600px] bg-indigo-100/70 rounded-full blur-3xl" />
          <div className="absolute top-20 -left-32 w-[400px] h-[400px] bg-violet-100/50 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-blue-50/80 rounded-full blur-2xl" />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-20 pb-28">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium px-3.5 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            Emissão de NFS-e para empresas brasileiras
          </div>

          {/* Headline */}
          <h1 className="text-[56px] font-extrabold tracking-tight leading-[1.06] text-slate-900 max-w-3xl">
            Emita notas fiscais{" "}
            <span className="text-indigo-600">automaticamente</span>
          </h1>

          <p className="mt-6 text-xl text-slate-500 max-w-xl leading-relaxed">
            Integração direta com a prefeitura. Certificado digital A1. Histórico completo. Economize horas toda semana.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <SignInButton mode="modal">
              <Button size="lg" className="gap-2 text-base bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 px-7">
                Começar gratuitamente
                <ArrowRight className="w-4 h-4" />
              </Button>
            </SignInButton>
            <button
              onClick={() => navigate("/docs")}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
            >
              Ver documentação
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Trust signals */}
          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3">
            {[
              "Certificado A1 integrado",
              "Prefeitura em tempo real",
              "Sem contrato de fidelidade",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-y border-slate-100 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "10x", label: "mais rápido que emissão manual" },
              { value: "100%", label: "integrado com a SEFIN" },
              { value: "A1", label: "suporte a certificado digital" },
              { value: "24/7", label: "disponibilidade do sistema" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-bold text-indigo-600">{value}</p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            Tudo que você precisa para emitir NFS-e
          </h2>
          <p className="text-slate-500 mt-3 max-w-lg mx-auto">
            Um sistema completo pensado para freelancers e empresas que precisam de agilidade e conformidade fiscal.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: Zap,
              title: "Emissão automática",
              description: "Crie notas em segundos. O sistema envia à prefeitura e atualiza o status em tempo real, sem burocracia.",
              bg: "bg-indigo-50",
              color: "text-indigo-600",
            },
            {
              icon: BarChart3,
              title: "Dashboard completo",
              description: "Visualize métricas, filtre por status e cliente, acompanhe o histórico e exporte o que precisar.",
              bg: "bg-violet-50",
              color: "text-violet-600",
            },
            {
              icon: Shield,
              title: "Segurança total",
              description: "Autenticação OAuth segura. Certificado digital A1. Dados isolados por empresa. LGPD compliant.",
              bg: "bg-emerald-50",
              color: "text-emerald-600",
            },
          ].map(({ icon: Icon, title, description, bg, color }) => (
            <div
              key={title}
              className="group p-6 rounded-2xl border border-slate-200 bg-white hover:shadow-md hover:border-indigo-100 transition-all duration-200"
            >
              <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center mb-5`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-slate-50 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Como funciona</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: FileCheck,
                title: "Configure sua empresa",
                description: "Preencha CNPJ, inscrição municipal e faça upload do certificado digital A1.",
              },
              {
                step: "02",
                icon: Zap,
                title: "Crie a nota fiscal",
                description: "Informe o cliente, serviço e valor. Um clique e a nota é enviada à prefeitura.",
              },
              {
                step: "03",
                icon: CheckCircle2,
                title: "Pronto",
                description: "Acompanhe o status em tempo real. A nota chega confirmada em segundos.",
              },
            ].map(({ step, icon: Icon, title, description }) => (
              <div key={step} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="w-px flex-1 bg-indigo-100 mt-3 hidden md:block" />
                </div>
                <div className="pb-8">
                  <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Passo {step}</p>
                  <h3 className="text-base font-semibold text-slate-900 mb-1.5">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Para escritórios de contabilidade ── */}
      <AccountingFirmsSection />

      {/* ── CTA ── */}
      <section className="relative bg-indigo-600 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-indigo-500/50 rounded-full blur-2xl" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-violet-700/40 rounded-full blur-2xl" />
        </div>
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
            Pronto para automatizar suas notas?
          </h2>
          <p className="text-indigo-200 mb-10 max-w-md mx-auto">
            Comece hoje. Configure em 5 minutos e emita sua primeira nota ainda hoje.
          </p>
          <SignInButton mode="modal">
            <Button
              size="lg"
              className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold shadow-xl gap-2 px-8"
            >
              Começar gratuitamente
              <ArrowRight className="w-4 h-4" />
            </Button>
          </SignInButton>
          <p className="text-indigo-300 text-xs mt-5">Sem cartão de crédito · Sem contrato · Cancele quando quiser</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">NF</span>
            </div>
            <span className="font-semibold text-slate-900 text-sm">AutoNF</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/docs")} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
              Documentação
            </button>
            <button onClick={() => navigate("/privacy")} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
              Privacidade
            </button>
          </div>
          <p className="text-xs text-slate-400">© 2026 AutoNF. Emissão automática de NFS-e.</p>
        </div>
      </footer>
    </div>
  );
}
