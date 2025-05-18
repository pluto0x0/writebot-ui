import React from 'react';
import { Input } from "@/components/ui/input";

export default function InputField({ label, value, setValue }) {
  return (
    <div className="mb-4">
      <label className="font-medium mb-1 block">{label}</label>
      <Input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border rounded-lg p-2 w-full"
      />
    </div>
  );
}