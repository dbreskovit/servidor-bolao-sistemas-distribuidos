import { useState } from "react";
import { Lock } from "lucide-react";
import { api } from "./api";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "./components/ui";

export default function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      const { token } = await api.login(password);
      onLogin(token);
    } catch (e) {
      setError(e instanceof Error && e.message !== "HTTP 401" ? e.message : "Senha inválida");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
            <Lock className="h-4 w-4 text-zinc-400" />
          </div>
          <CardTitle className="text-lg">⚽ Bolão Admin</CardTitle>
          <CardDescription>Entre com a senha do painel de administração</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            placeholder="Senha"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Button className="w-full" onClick={submit} disabled={loading || !password}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
