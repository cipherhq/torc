import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
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
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <Ionicons name="compass" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
