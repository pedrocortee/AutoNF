import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-800 mb-4">404</h1>
        <p className="text-slate-500 mb-8">Página não encontrada</p>
        <button
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          onClick={() => navigate("/")}
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
