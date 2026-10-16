import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth.jsx'

// `roles` (optional) limits the route to those staff roles; others go back to /approvals.
export default function RequireStaff({ children, roles }) {
  const { isStaff, staffRole } = useAuth()
  const location = useLocation()

  if (!isStaff) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(staffRole)) {
    return <Navigate to="/approvals" replace />
  }

  return children
}
