import "../global.css";
import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { PostalCodeProvider } from "../lib/PostalCodeContext";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  // undefined = still loading; null = no session; Session = logged in
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Load persisted session on app start
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    // Subscribe to future auth state changes (logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session),
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return; // still loading splash

    const inAuthFlow =
      segments[0] === "login" || segments[0] === "onboarding";

    if (!session && !inAuthFlow) {
      router.replace("/login");
    } else if (session && segments[0] === "login") {
      router.replace("/(tabs)");
    }
  }, [session, segments]);

  // Show nothing while determining auth state (prevents flash)
  if (session === undefined) return null;

  return (
    <PostalCodeProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
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
