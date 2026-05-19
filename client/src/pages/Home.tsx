import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { ArrowRight, CheckCircle2, Zap, BarChart3, Shield } from "lucide-react";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isAuthenticated && !loading) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-700/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">
              NF
            </div>
            <span className="font-semibold text-lg">AutoNF</span>
          </div>
          <div className="flex gap-4">
            <Button
              variant="ghost"
              className="text-slate-300 hover:text-white hover:bg-slate-700/50"
              onClick={() => navigate("/docs")}
            >
              Documentação
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
              onClick={() => window.location.href = getLoginUrl()}
            >
              Entrar
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
              Emissão Automática de
              <span className="block bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent">
                Notas Fiscais
              </span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Automatize o processo de emissão de notas fiscais com um painel elegante e intuitivo. Economize horas de trabalho manual.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Button
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-base px-8"
              onClick={() => window.location.href = getLoginUrl()}
            >
              Começar Agora
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700/50 hover:text-white text-base px-8"
              onClick={() => navigate("/docs")}
            >
              Ver Documentação
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-slate-600/50 transition-colors">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center mb-6">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Emissão Automática</h3>
            <p className="text-slate-400">
              Crie notas fiscais em segundos com processamento automático simulado. De Pendente a Processado em instantes.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-slate-600/50 transition-colors">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center mb-6">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Dashboard Inteligente</h3>
            <p className="text-slate-400">
              Visualize métricas em tempo real: total de notas, pendentes, processadas e com erro.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-slate-600/50 transition-colors">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center mb-6">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Segurança Integrada</h3>
            <p className="text-slate-400">
              Autenticação segura com OAuth. Seus dados protegidos e organizados por usuário.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="bg-gradient-to-r from-blue-600/20 to-blue-800/20 border border-blue-500/30 rounded-2xl p-12 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Pronto para automatizar?
          </h2>
          <p className="text-slate-300 mb-8 max-w-xl mx-auto">
            Acesse o painel agora e comece a emitir notas fiscais de forma automática e eficiente.
          </p>
          <Button
            size="lg"
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-base px-8"
            onClick={() => window.location.href = getLoginUrl()}
          >
            Entrar no Painel
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center text-slate-400">
          <p>AutoNF © 2026 - MVP de Sistema de Emissão Automática de Notas Fiscais</p>
        </div>
      </footer>
    </div>
  );
}
