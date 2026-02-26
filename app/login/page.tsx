'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage({ type: 'error', text: 'Error al enviar el enlace. Inténtalo de nuevo.' });
    } else {
      setMessage({
        type: 'success',
        text: `Hemos enviado un enlace a ${email}. Revisa tu bandeja de entrada.`,
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Survey Reports</h1>
          <p className="mt-2 text-gray-500">Generación de informes de campañas</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-corp focus:border-transparent outline-none transition text-gray-900"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full py-3 px-4 bg-corp text-white font-medium rounded-lg hover:bg-corp-dark disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Enviando...' : 'Enviar enlace de acceso'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-400">
          Recibirás un enlace en tu email para acceder
        </p>

        {message && (
          <div
            className={`mt-4 p-4 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
