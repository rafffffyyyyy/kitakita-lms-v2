"use client";

import React from "react";

interface ConfirmLogoutModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmLogoutModal({ onConfirm, onCancel }: ConfirmLogoutModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Confirm Logout</h2>
        <p className="text-sm text-gray-600 mb-6">Are you sure you want to log out?</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
