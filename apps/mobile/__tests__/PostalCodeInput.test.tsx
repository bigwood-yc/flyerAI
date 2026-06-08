import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import PostalCodeInput from "../components/PostalCodeInput";

describe("PostalCodeInput", () => {
  it("calls onSubmit with uppercased postal code when valid (no space)", () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <PostalCodeInput onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "l3r0b1");
    fireEvent.press(getByText("查找特价"));
    expect(onSubmit).toHaveBeenCalledWith("L3R0B1");
  });

  it("calls onSubmit when postal code has a space", () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <PostalCodeInput onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "L3R 0B1");
    fireEvent.press(getByText("查找特价"));
    expect(onSubmit).toHaveBeenCalledWith("L3R 0B1");
  });

  it("shows error and does not call onSubmit for invalid code", () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText, queryByText } = render(
      <PostalCodeInput onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "12345");
    fireEvent.press(getByText("查找特价"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(queryByText(/有效的加拿大邮编/)).toBeTruthy();
  });

  it("clears error when user starts typing again", () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <PostalCodeInput onSubmit={jest.fn()} />
    );
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "bad");
    fireEvent.press(getByText("查找特价"));
    expect(queryByText(/有效的加拿大邮编/)).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "L");
    expect(queryByText(/有效的加拿大邮编/)).toBeNull();
  });
});
