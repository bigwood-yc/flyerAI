import React, { createContext, useContext, useState } from "react";

interface PostalCodeContextValue {
  postalCode: string;
  setPostalCode: (pc: string) => void;
}

const PostalCodeContext = createContext<PostalCodeContextValue>({
  postalCode: "",
  setPostalCode: () => {},
});

export function PostalCodeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [postalCode, setPostalCode] = useState("");
  return (
    <PostalCodeContext.Provider value={{ postalCode, setPostalCode }}>
      {children}
    </PostalCodeContext.Provider>
  );
}

export function usePostalCode(): PostalCodeContextValue {
  return useContext(PostalCodeContext);
}
