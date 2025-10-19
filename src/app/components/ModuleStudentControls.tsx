"use client";

import React from "react";

export default function ModuleStudentControls() {
  return (
    <div className="space-y-2">
      <button className="w-full bg-yellow-500 text-white py-2 rounded text-sm hover:bg-yellow-600">
        Submit Assignment
      </button>
      <button className="w-full bg-pink-500 text-white py-2 rounded text-sm hover:bg-pink-600">
        Answer Quiz
      </button>
      <button className="w-full bg-teal-500 text-white py-2 rounded text-sm hover:bg-teal-600">
        Pre-Test
      </button>
      <button className="w-full bg-indigo-500 text-white py-2 rounded text-sm hover:bg-indigo-600">
        Post-Test
      </button>
    </div>
  );
}
