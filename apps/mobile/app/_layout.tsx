import "../global.css";
import { Stack } from "expo-router";
import { PostalCodeProvider } from "../lib/PostalCodeContext";

export default function RootLayout() {
  return (
    <PostalCodeProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="flyer/[store]"
          options={{
            headerBackTitle: "返回",
            headerTitleStyle: { fontWeight: "bold" },
          }}
        />
      </Stack>
    </PostalCodeProvider>
  );
}
