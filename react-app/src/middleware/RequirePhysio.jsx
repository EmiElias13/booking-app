import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth.jsx'

export default function RequirePhysio({ children }) {
  const { isPhysio } = useAuth()
  const location = useLocation()

  if (!isPhysio) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
