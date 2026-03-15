import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncAssignment, syncAllData, isOnline, SyncResult } from '../services/SyncService';
import { getCachedAssignments, getUnsyncedFeatures } from '../database/LocalDatabase';

interface SyncScreenProps {
  onLogout?: () => void;
}

export default function SyncScreen({ onLogout }: SyncScreenProps = {}) {
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    const networkOnline = await isOnline();
    setOnline(networkOnline);

    const cached = await getCachedAssignments();
    setAssignments(cached);

    const unsynced = await getUnsyncedFeatures();
    setUnsyncedCount(unsynced.length);
  };

  const handleSyncAll = async () => {
    if (!online) {
      Alert.alert('Offline', 'You need network connectivity to sync.');
      return;
    }

    setSyncing(true);
    try {
      // Sync base data (assignments, layers)
      await syncAllData();

      // Sync each assignment
      let totalPulled = 0;
      let totalPushed = 0;
      let totalConflicts = 0;

      for (const assignment of assignments) {
        const result = await syncAssignment(assignment.id);
        totalPulled += result.pulled;
        totalPushed += result.pushed;
        totalConflicts += result.conflicts;
      }

      setLastResult({
        pulled: totalPulled,
        pushed: totalPushed,
        conflicts: totalConflicts,
        success: true,
      });

      await loadStatus();
      Alert.alert('Sync Complete', `Pushed: ${totalPushed}, Pulled: ${totalPulled}, Conflicts: ${totalConflicts}`);
    } catch (error: any) {
      setLastResult({
        pulled: 0,
        pushed: 0,
        conflicts: 0,
        success: false,
        error: error.message,
      });
      Alert.alert('Sync Failed', error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure? Unsynced data may be lost.', [
      { text: 'Cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('geonex_token');
          await AsyncStorage.removeItem('geonex_user');
          if (onLogout) onLogout();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sync & Settings</Text>
        <View style={[styles.statusDot, { backgroundColor: online ? '#16a34a' : '#dc2626' }]} />
        <Text style={styles.statusText}>{online ? 'Online' : 'Offline'}</Text>
      </View>

      <View style={styles.body}>
        {/* Sync status card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sync Status</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{unsyncedCount}</Text>
              <Text style={styles.statLabel}>Pending Changes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{assignments.length}</Text>
              <Text style={styles.statLabel}>Assignments</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.syncButton, (!online || syncing) && styles.syncButtonDisabled]}
            onPress={handleSyncAll}
            disabled={!online || syncing}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.syncButtonText}>
                {online ? 'Sync Now' : 'No Connection'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Last sync result */}
        {lastResult && (
          <View style={[styles.card, { borderColor: lastResult.success ? '#16a34a' : '#dc2626' }]}>
            <Text style={styles.cardTitle}>Last Sync Result</Text>
            <Text style={styles.resultText}>
              Status: {lastResult.success ? 'Success' : 'Failed'}
            </Text>
            {lastResult.success ? (
              <>
                <Text style={styles.resultText}>Features Pushed: {lastResult.pushed}</Text>
                <Text style={styles.resultText}>Features Pulled: {lastResult.pulled}</Text>
                <Text style={styles.resultText}>Conflicts: {lastResult.conflicts}</Text>
              </>
            ) : (
              <Text style={styles.resultError}>{lastResult.error}</Text>
            )}
          </View>
        )}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  statusText: { fontSize: 13, color: '#6b7280' },
  body: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 16 },
  statsRow: { flexDirection: 'row', marginBottom: 16 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '700', color: '#2563eb' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  syncButton: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  syncButtonDisabled: { opacity: 0.5 },
  syncButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultText: { fontSize: 14, color: '#374151', marginBottom: 4 },
  resultError: { fontSize: 14, color: '#dc2626', marginTop: 4 },
  logoutButton: {
    backgroundColor: '#fee2e2',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '600' },
});
