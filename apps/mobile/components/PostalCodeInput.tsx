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
        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 mb-3"
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
        <Text className="text-red-500 text-sm mb-3">{error}</Text>
      ) : null}
      <TouchableOpacity
        className="w-full bg-blue-500 rounded-lg py-3 items-center"
        onPress={handleSubmit}
        accessibilityRole="button"
      >
        <Text className="text-white font-bold text-base">查找特价</Text>
      </TouchableOpacity>
    </View>
  );
}
