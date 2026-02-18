import { Tabs } from 'expo-router';
import React from 'react';
import { AuthProvider } from '../../contexts/AuthContext';
import { JobProvider } from '../../contexts/JobContext';

export default function TabLayout() {
  return (
    <AuthProvider>
      <JobProvider>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: '#2EFFAF',
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#0F1419',
              borderTopColor: 'rgba(255, 255, 255, 0.1)',
            },
            tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
          }}>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ color }) => <></>,
            }}
          />
          <Tabs.Screen
            name="explore"
            options={{
              title: 'Explore',
              tabBarIcon: ({ color }) => <></>,
            }}
          />
        </Tabs>
      </JobProvider>
    </AuthProvider>
  );
}
