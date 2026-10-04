import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="rail-login">
      <div className="rail-card">
        <p className="rail-kicker">Solana subway</p>
        <h1 className="rail-title">
          APECAT
          <br />
          <em>RAIL</em>
        </h1>
        <p className="rail-lede">Sign in to claim a name. Once it’s yours, nobody else can take it.</p>
        {authEnabled ? (
          <div className="rail-login-actions">
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                className="rail-start"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="rail-sub">Sign-in is disabled.</p>
        )}
        <Link to="/" className="rail-sub">
          Back to the tunnel
        </Link>
      </div>
    </main>
  );
}
