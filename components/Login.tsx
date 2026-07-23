// Login — DESIGN.md §12.1 split-screen recipe + §12.2 client-side rate limit.
// Single login for both modules; redirect by perfil (Tecnico -> /tecnico).
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { Button, Card, CardContent, Input } from './ui/UIComponents';
import { useAuth } from '../contexts/AuthContext';
import { isTecnicoOnly } from '../utils/permissions';
import { formatLockTime, getLockStatus, recordFailedAttempt, resetAttempts } from '../utils/rateLimit';

const APP_VERSION = 'v0.1.0';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockSecs, setLockSecs] = useState(() => getLockStatus('login').lockSecs);

  // Tick the lockout countdown once per second while locked.
  useEffect(() => {
    if (lockSecs <= 0) return;
    const t = setInterval(() => setLockSecs(getLockStatus('login').lockSecs), 1000);
    return () => clearInterval(t);
  }, [lockSecs > 0]);

  const locked = lockSecs > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked || loading) return;
    setError(null);
    setLoading(true);
    try {
      const logged = await login(usuario.trim(), password);
      resetAttempts('login');
      // Redirect by perfil: the technician app is /tecnico, everyone else lands on /home.
      navigate(isTecnicoOnly(logged.perfil) ? '/tecnico' : '/home', { replace: true });
    } catch {
      recordFailedAttempt('login');
      setLockSecs(getLockStatus('login').lockSecs);
      setError('Usuario o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background animate-in fade-in duration-500">
      {/* Panel de branding (solo desktop) */}
      <div className="hidden md:flex flex-col justify-between w-1/2 lg:w-3/5 relative overflow-hidden text-white">
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-brand via-brand to-black" />
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
        <div className="relative z-10 p-12 h-full flex flex-col justify-between">
          <img src="/logo.png" alt="TopRentals" className="h-12 w-12 rounded-lg drop-shadow-lg" />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl mb-6 leading-tight drop-shadow-lg">TopRentals</h1>
            <p className="text-lg text-gray-200 max-w-md border-l-2 border-white/30 pl-4">Gestión de mantenimiento, stock y compras</p>
          </div>
          <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">© {new Date().getFullYear()} TopRentals</p>
        </div>
      </div>

      {/* Panel de formulario */}
      <div className="flex-1 flex flex-col relative bg-white">
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-sm border-0 shadow-none bg-transparent">
            <CardContent className="p-0">
              <img src="/logo.png" alt="TopRentals" className="md:hidden h-14 w-14 rounded-xl mb-6" />
              <h2 className="text-3xl font-bold tracking-tight text-primary">Bienvenido</h2>
              <p className="text-sm text-muted-foreground mb-6">Ingresá a tu cuenta</p>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm mb-4" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-user" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Usuario</label>
                  <Input
                    id="login-user"
                    autoFocus
                    autoComplete="username"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    className="h-12 bg-secondary/30 border-border focus:border-primary focus:bg-background transition-all mt-1"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Contraseña</label>
                  <div className="relative mt-1">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 bg-secondary/30 border-border focus:border-primary focus:bg-background transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading || locked || !usuario || !password}
                  className="w-full h-12 mt-4 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01]"
                >
                  {locked ? (
                    <><Lock className="mr-2 h-4 w-4" /> Bloqueado · {formatLockTime(lockSecs)}</>
                  ) : loading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <>Ingresar <ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-xs font-medium tracking-wide text-muted-foreground/70">{APP_VERSION}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;
