import { useState } from "react";
import Dashboard from "./Dashboard";
import Login from "./Login";

export default function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("adminToken"));

  const login = (t: string) => {
    sessionStorage.setItem("adminToken", t);
    setToken(t);
  };

  const logout = () => {
    sessionStorage.removeItem("adminToken");
    setToken(null);
  };

  return token ? <Dashboard token={token} onLogout={logout} /> : <Login onLogin={login} />;
}
