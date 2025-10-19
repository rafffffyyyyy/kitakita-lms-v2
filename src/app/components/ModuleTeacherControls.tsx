// ===================== src/app/components/ModuleTeacherControls.tsx =====================
"use client";
import React from "react";

interface Props {
  onUploadClick: () => void;
}

export default function ModuleTeacherControls({ onUploadClick }: Props) {
  return (
    <div className="mt-6 space-y-2">
      <button className="w-full bg-gray-200 px-3 py-1 rounded text-sm">Pre-Test</button>
      <button className="w-full bg-gray-200 px-3 py-1 rounded text-sm">Post-Test</button>
      <button className="w-full bg-blue-600 text-white px-3 py-1 rounded text-sm">Add Assignment</button>
      <button className="w-full bg-blue-600 text-white px-3 py-1 rounded text-sm">Add Quiz</button>
      <button
        onClick={onUploadClick}
        className="w-full bg-blue-600 text-white px-3 py-1 rounded text-sm"
      >
        Upload File
      </button>
    </div>
  );
}