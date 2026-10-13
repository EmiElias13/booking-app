import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth.jsx'

export default function RequireStaff({ children }) {
  const { isStaff } = useAuth()
  const location = useLocation()

  if (!isStaff) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
