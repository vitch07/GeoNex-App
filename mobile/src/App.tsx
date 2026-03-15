import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Text, View, TouchableOpacity, StyleSheet, AppState } from 'react-native';

import LoginScreen from './screens/LoginScreen';
import AssignmentsScreen from './screens/AssignmentsScreen';
import MapScreen from './screens/MapScreen';
import PhotoCaptureScreen from './screens/PhotoCaptureScreen';
import PhotoViewerScreen from './screens/PhotoViewerScreen';
import SyncScreen from './screens/SyncScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProjectsScreen from './screens/ProjectsScreen';
import UsersScreen from './screens/UsersScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function AssignmentsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AssignmentsList" component={AssignmentsScreen} />
      <Stack.Screen name="Map" component={MapScreen} />
      <Stack.Screen name="PhotoCapture" component={PhotoCaptureScreen} />
      <Stack.Screen name="PhotoViewer" component={PhotoViewerScreen} />
    </Stack.Navigator>
  );
}

function AdminTabs({ onLogout }: { onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: { paddingBottom: 8, paddingTop: 8, height: 60 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="Assignments"
        component={AssignmentsStack}
        options={{
          tabBarLabel: 'Assignments',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text>,
        }}
      />
      <Tab.Screen
        name="QuickMap"
        component={MapScreen}
        options={{
          tabBarLabel: 'Map',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🗺️</Text>,
        }}
        initialParams={{}}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{
          tabBarLabel: 'Projects',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📁</Text>,
        }}
      />
      <Tab.Screen
        name="More"
        options={{
          tabBarLabel: 'More',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
        }}
      >
        {() => <MoreStack onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// Wrap Users + Sync in a stack for More tab
function MoreStack({ onLogout }: { onLogout: () => void }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreMenu">
        {(props) => <MoreMenuScreen {...props} onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen name="Users" component={UsersScreen} />
      <Stack.Screen name="SyncSettings" component={SyncScreen} />
    </Stack.Navigator>
  );
}

function MoreMenuScreen({ navigation, onLogout }: { navigation: any; onLogout: () => void }) {
  return (
    <View style={moreStyles.container}>
      <View style={moreStyles.header}>
        <Text style={moreStyles.title}>More</Text>
      </View>
      <View style={moreStyles.body}>
        <TouchableOpacity style={moreStyles.menuItem} onPress={() => navigation.navigate('Users')}>
          <Text style={moreStyles.menuIcon}>👥</Text>
          <Text style={moreStyles.menuText}>Users</Text>
          <Text style={moreStyles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={moreStyles.menuItem} onPress={() => navigation.navigate('SyncSettings')}>
          <Text style={moreStyles.menuIcon}>🔄</Text>
          <Text style={moreStyles.menuText}>Sync & Data</Text>
          <Text style={moreStyles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[moreStyles.menuItem, { borderBottomWidth: 0 }]}
          onPress={() => {
            AsyncStorage.multiRemove(['geonex_token', 'geonex_user']).then(onLogout);
          }}
        >
          <Text style={moreStyles.menuIcon}>🚪</Text>
          <Text style={[moreStyles.menuText, { color: '#dc2626' }]}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FieldUserTabs({ onLogout }: { onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: { paddingBottom: 8, paddingTop: 8, height: 60 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Assignments"
        component={AssignmentsStack}
        options={{
          tabBarLabel: 'Assignments',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text>,
        }}
      />
      <Tab.Screen
        name="QuickMap"
        component={MapScreen}
        options={{
          tabBarLabel: 'Map',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🗺️</Text>,
        }}
        initialParams={{}}
      />
      <Tab.Screen
        name="Sync"
      >
        {() => <SyncScreen onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<string>('field_user');
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = await AsyncStorage.getItem('geonex_token');
    const userStr = await AsyncStorage.getItem('geonex_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role || 'field_user');
        setIsLoggedIn(true);
      } catch {
        setIsLoggedIn(false);
      }
    } else {
      setIsLoggedIn(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Listen for app state changes to re-check auth (handles logout from SyncScreen)
  useEffect(() => {
    const sub = AppState.addEventListener('change', () => {
      // Re-check on resume
    });
    return () => sub.remove();
  }, []);

  const handleLogin = async () => {
    const userStr = await AsyncStorage.getItem('geonex_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role || 'field_user');
      } catch {}
    }
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole('field_user');
  };

  if (loading) return null;

  return (
    <>
      <StatusBar style="auto" />
      <NavigationContainer>
        {isLoggedIn ? (
          userRole === 'admin' ? (
            <AdminTabs onLogout={handleLogout} />
          ) : (
            <FieldUserTabs onLogout={handleLogout} />
          )
        ) : (
          <LoginScreen onLogin={handleLogin} />
        )}
      </NavigationContainer>
    </>
  );
}

const moreStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  body: { padding: 16 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  menuIcon: { fontSize: 20, marginRight: 14 },
  menuText: { fontSize: 16, fontWeight: '500', color: '#111827', flex: 1 },
  menuArrow: { fontSize: 24, color: '#9ca3af' },
});
