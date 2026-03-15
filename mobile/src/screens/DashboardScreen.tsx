import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import api from '../config/api';

export default function DashboardScreen() {
  const [stats, setStats] = useState({
    projects: 0,
    assignments: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
  });
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [projectsRes, assignmentsRes] = await Promise.all([
        api.get<any>('/projects'),
        api.get<any>('/assignments'),
      ]);

      const projects = Array.isArray(projectsRes) ? projectsRes : (projectsRes.data || []);
      const assignments = Array.isArray(assignmentsRes) ? assignmentsRes : (assignmentsRes.data || []);

      setStats({
        projects: projects.length,
        assignments: assignments.length,
        pending: assignments.filter((a: any) => a.status === 'pending').length,
        inProgress: assignments.filter((a: any) => a.status === 'in_progress').length,
        completed: assignments.filter((a: any) => a.status === 'completed').length,
      });
      setRecentAssignments(assignments.slice(0, 5));
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
      </View>
      <ScrollView
        style={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderLeftColor: '#2563eb' }]}>
            <Text style={styles.statValue}>{stats.projects}</Text>
            <Text style={styles.statLabel}>Projects</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#8b5cf6' }]}>
            <Text style={styles.statValue}>{stats.assignments}</Text>
            <Text style={styles.statLabel}>Assignments</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#d97706' }]}>
            <Text style={styles.statValue}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#16a34a' }]}>
            <Text style={styles.statValue}>{stats.completed}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Assignments</Text>
          {recentAssignments.map((a) => (
            <View key={a.id} style={styles.assignmentItem}>
              <View style={styles.assignmentHeader}>
                <Text style={styles.assignmentProject}>{a.project_name}</Text>
                <View style={[styles.badge, { backgroundColor: getStatusColor(a.status) + '20' }]}>
                  <Text style={[styles.badgeText, { color: getStatusColor(a.status) }]}>
                    {a.status.replace('_', ' ')}
                  </Text>
                </View>
              </View>
              <Text style={styles.assignmentUser}>Assigned to: {a.assigned_user}</Text>
            </View>
          ))}
          {recentAssignments.length === 0 && (
            <Text style={styles.emptyText}>No assignments yet</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending': return '#d97706';
    case 'in_progress': return '#2563eb';
    case 'completed': return '#16a34a';
    case 'cancelled': return '#dc2626';
    default: return '#6b7280';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  body: { flex: 1, padding: 16 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statValue: { fontSize: 28, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 12 },
  assignmentItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  assignmentProject: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  assignmentUser: { fontSize: 13, color: '#6b7280' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 20 },
});
