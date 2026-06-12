import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";

const POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

interface Props {
  onSubmit: (postalCode: string) => void;
}

export default function PostalCodeInput({ onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim().toUpperCase();
    if (!POSTAL_CODE_REGEX.test(trimmed)) {
      setError("请输入有效的加拿大邮编，例如 L3R 0B1");
      return;
    }
    setError("");
    onSubmit(trimmed);
  };

  return (
    <View className="w-full">
      <TextInput
        className="w-full bg-white border-2 border-gray-300 rounded-2xl px-4 py-4 text-title text-ink mb-3"
        placeholder="L3R 0B1"
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setError("");
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={handleSubmit}
        accessibilityLabel="邮编输入框"
      />
      {error ? (
        <Text className="text-red-600 text-body mb-3 leading-6">{error}</Text>
      ) : null}
      <TouchableOpacity
        className="w-full bg-brand rounded-2xl min-h-[56px] items-center justify-center"
        onPress={handleSubmit}
        accessibilityRole="button"
      >
        <Text className="text-white font-bold text-title">查找特价</Text>
      </TouchableOpacity>
    </View>
  );
}
