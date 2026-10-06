import { createFileRoute, Link } from "@tanstack/react-router";

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
        <p className="rail-lede">
          Claim a name and password in the game. Log in with them on any browser to keep your scores.
        </p>
        <Link to="/" className="rail-start">
          Back to the tunnel
        </Link>
      </div>
    </main>
  );
}
