"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Ongeldig e-mailadres of wachtwoord.");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Inloggen</h1>
        <p className="auth-subtitle">Welkom terug bij FierlLab</p>

        <form onSubmit={handleLogin} className="auth-form">
          <div className="field-group">
            <label htmlFor="email">E-mailadres</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jij@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="field-group">
            <label htmlFor="password">Wachtwoord</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Bezig…" : "Inloggen"}
          </button>
        </form>

        <p className="auth-switch">
          Nog geen account?{" "}
          <a href="/register">Registreer hier</a>
        </p>
      </div>
    </main>
  );
}
