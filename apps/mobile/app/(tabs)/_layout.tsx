import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={{ fontSize: 10, color: focused ? "#3b82f6" : "#94a3b8" }}>
        {label}
      </Text>
    </>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: { borderTopColor: "#e2e8f0" },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "首页",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" label="首页" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="recommendations"
        options={{
          title: "本周推荐",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⭐" label="推荐" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: "超市传单",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏪" label="超市" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
