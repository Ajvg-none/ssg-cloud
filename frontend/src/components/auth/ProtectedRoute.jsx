import React from 'react';
import { Navigate } from 'react-router-dom';

const ROLE_ROUTES = {
  ADMIN: '/admin',
  TIENDA: '/store',
  LABORATORIO: '/lab',
};

const ProtectedRoute = ({ allowedRoles, children }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to={ROLE_ROUTES[role] || '/login'} replace />;
  }

  return children;
};

export default ProtectedRoute;
