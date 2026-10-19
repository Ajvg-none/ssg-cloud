// frontend/src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Alert from '../components/ui/Alert';
import { Eye, EyeOff, User, Lock } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (token && role) {
      redirectByRole(role);
    }
  }, []);

  const redirectByRole = (role) => {
    const routes = { ADMIN: '/admin', TIENDA: '/store', LABORATORIO: '/lab' };
    navigate(routes[role] || '/store', { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Usuario y contraseña son obligatorios.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authAPI.login({ username, password });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('role', user.role);
      localStorage.setItem('username', user.username);
      if (user.storeId) localStorage.setItem('storeId', user.storeId);
      if (user.labId) localStorage.setItem('labId', user.labId);
      redirectByRole(user.role);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-slow">
        {/* Logo y encabezado */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="w-48 md:w-56 transition-transform duration-300 hover:scale-105">
              <img
                src="/logo-opti.jpg"
                alt="Opti-Color"
                className="w-full h-auto drop-shadow-lg"
              />
            </div>
          </div>
          <p className="text-opticolor-gray-600 text-sm mt-1">
            Sistema de Gestión de Garantías
          </p>
        </div>

        {/* Tarjeta de login */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/30">
          <h2 className="text-2xl font-bold text-opticolor-gray-900 text-center mb-6">
            Iniciar Sesión
          </h2>

          {error && (
            <div className="mb-4">
              <Alert type="error" message={error} onClose={() => setError(null)} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Campo Usuario con ícono */}
            <div className="relative">
              <div className="absolute left-3 top-9 text-opticolor-gray-400">
                <User className="h-5 w-5 shrink-0" aria-hidden="true" />
              </div>
              <Input
                label="Usuario"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ingresa tu usuario"
                className="pl-10"
                autoComplete="username"
              />
            </div>

            {/* Campo Contraseña con ícono de candado + botón de ojo */}
            <div className="relative">
              {/* Ícono de Candado (izquierda) */}
              <div className="absolute left-3 top-9 text-opticolor-gray-400">
                <Lock className="h-5 w-5 shrink-0" aria-hidden="true" />
              </div>

              <Input
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="pl-10 pr-10"
                autoComplete="current-password"
              />

              {/* Botón de Ojo (derecha) */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-opticolor-gray-400 hover:text-opticolor-red transition-colors"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Botón con gradiente */}
            <Button
              type="submit"
              loading={loading}
              className="w-full text-lg bg-gradient-to-r from-opticolor-red to-opticolor-red-dark hover:from-opticolor-red-dark hover:to-opticolor-red transition-all duration-300 transform hover:scale-[1.02] shadow-md hover:shadow-lg"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
//