"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message === "User already registered"
        ? "Dit e-mailadres is al geregistreerd."
        : "Registreren is niet gelukt. Controleer je gegevens.");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Registreren</h1>
        <p className="auth-subtitle">Maak een account voor FierlLab</p>

        <form onSubmit={handleRegister} className="auth-form">
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
              placeholder="Minimaal 6 tekens"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Bezig…" : "Account aanmaken"}
          </button>
        </form>

        <p className="auth-switch">
          Al een account?{" "}
          <a href="/login">Log hier in</a>
        </p>
      </div>
    </main>
  );
}
