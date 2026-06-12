import { Tabs } from "expo-router";
import { Text } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: { borderTopColor: "#e2e8f0" },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "首页",
          headerShown: false,
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="recommendations"
        options={{
          title: "推荐",
          headerShown: false,
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>⭐</Text>,
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: "超市",
          headerShown: false,
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>🏪</Text>,
        }}
      />
    </Tabs>
  );
}
