import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface Stats {
  projects: number;
  assignments: number;
  pendingAssignments: number;
  completedAssignments: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ projects: 0, assignments: 0, pendingAssignments: 0, completedAssignments: 0 });
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [projectsRes, assignmentsRes] = await Promise.all([
        api.get('/projects'),
        api.get('/assignments'),
      ]);

      const assignments = assignmentsRes.data.data || [];
      setStats({
        projects: (projectsRes.data.data || []).length,
        assignments: assignments.length,
        pendingAssignments: assignments.filter((a: any) => a.status === 'pending').length,
        completedAssignments: assignments.filter((a: any) => a.status === 'completed').length,
      });
      setRecentAssignments(assignments.slice(0, 5));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
      </div>
      <div className="page-body">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.projects}</div>
            <div className="stat-label">Total Projects</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.assignments}</div>
            <div className="stat-label">Total Assignments</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.pendingAssignments}</div>
            <div className="stat-label">Pending Assignments</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.completedAssignments}</div>
            <div className="stat-label">Completed</div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Recent Assignments</h3>
          {recentAssignments.length === 0 ? (
            <p style={{ color: 'var(--gray-500)' }}>No assignments yet. <Link to="/assignments">Create one</Link></p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {recentAssignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.project_name}</td>
                    <td>{a.assigned_user}</td>
                    <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
                    <td>{a.due_date ? new Date(a.due_date).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
