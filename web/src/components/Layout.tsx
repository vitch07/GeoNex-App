import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>GeoNex</h1>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
            Dashboard
          </NavLink>
          <NavLink to="/map" className={({ isActive }) => isActive ? 'active' : ''}>
            Map View
          </NavLink>
          <NavLink to="/projects" className={({ isActive }) => isActive ? 'active' : ''}>
            Projects
          </NavLink>
          <NavLink to="/assignments" className={({ isActive }) => isActive ? 'active' : ''}>
            Assignments
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>
              Users
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div style={{ marginBottom: 8 }}>
            <strong>{user?.username}</strong>
            <br />
            <span style={{ fontSize: 12 }}>{user?.role}</span>
          </div>
          <button className="btn-secondary" onClick={logout} style={{ width: '100%' }}>
            Logout
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
